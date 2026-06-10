/**
 * Auto-diagnostics
 *
 * After the model edits files (string_replace / write_file), automatically
 * collect language-server diagnostics for those files and surface ERRORS back
 * into the conversation loop as a clearly-labelled synthetic user message, so
 * the model fixes the errors it just introduced before its response ends.
 *
 * Sources mirror the `lsp_get_diagnostics` tool: the VS Code extension when
 * connected, otherwise the local LSP manager. When neither is available the
 * check is a silent no-op. Only diagnostics with severity Error are surfaced
 * (warnings/hints are too often stylistic or pre-existing and would risk
 * looping the model on noise).
 *
 * Freshness: for the local LSP path we re-open the document (which reads the
 * just-edited content from disk) and wait for the server's publishDiagnostics
 * push for that file, bounded by a shared time budget. The manager's
 * diagnostics cache is deliberately NOT consulted — it can hold pre-edit
 * diagnostics, and a stale phantom error is far worse for auto-injection
 * than a missed one. No push within the budget → the file is treated clean.
 */

import {resolve as resolvePath} from 'node:path';
import {getAutoFixDiagnostics} from '@/config/preferences';
import {
	MAX_AUTO_DIAGNOSTIC_ERRORS,
	TIMEOUT_AUTO_DIAGNOSTICS_MS,
} from '@/constants';
import type {ToolCall, ToolResult} from '@/types/core';
import {parseToolArguments} from '@/utils/tool-args-parser';
import type {DiagnosticInfo} from '@/vscode/index';
import {getVSCodeServer, isVSCodeConnected} from '@/vscode/index';
import {getLSPManager} from './lsp-manager';
import type {Diagnostic, PublishDiagnosticsParams} from './protocol';
import {DiagnosticSeverity} from './protocol';

/** File-editing tools whose successful results trigger a diagnostics check. */
const EDIT_TOOLS = new Set(['string_replace', 'write_file']);

/** A single error diagnostic, positions converted to 1-based. */
export interface AutoDiagnosticError {
	line: number;
	character: number;
	message: string;
	source?: string;
}

/** All error diagnostics found for one edited file (absolute path). */
export interface FileErrors {
	file: string;
	errors: AutoDiagnosticError[];
}

/**
 * Outcome of a post-edit diagnostics check:
 * - `skipped`: nothing was checked (feature off, no edited files, or no
 *   diagnostics source available) — callers must not treat this as "clean".
 * - `clean`: a check ran and found no errors.
 * - `errors`: a check ran and found errors; `content` is the synthetic
 *   message to inject into the conversation.
 */
export type AutoDiagnosticsOutcome =
	| {status: 'skipped'}
	| {status: 'clean'}
	| {status: 'errors'; content: string; errorCount: number; fileCount: number};

/**
 * Narrow structural slice of `LSPManager` used by the collector, so tests can
 * fake it with a plain EventEmitter.
 */
export interface AutoDiagnosticsLSP {
	isInitialized(): boolean;
	hasLanguageSupport(filePath: string): boolean;
	openDocument(filePath: string, content?: string): Promise<boolean>;
	on(
		event: 'diagnostics',
		listener: (params: PublishDiagnosticsParams) => void,
	): unknown;
	removeListener(
		event: 'diagnostics',
		listener: (params: PublishDiagnosticsParams) => void,
	): unknown;
}

/**
 * Narrow structural slice of `VSCodeServer` used by the collector, so tests
 * can fake it without a real socket server.
 */
export interface AutoDiagnosticsVSCode {
	onCallbacks(callbacks: {
		onDiagnosticsResponse?: (diagnostics: DiagnosticInfo[]) => void;
	}): void;
	requestDiagnostics(filePath?: string): void;
}

/**
 * Extract the absolute paths of files successfully edited this turn.
 * Failed edits ("Error: …" / "⚒ Validation failed…") are skipped — there is
 * nothing new on disk to diagnose. Paths are deduped, preserving order.
 */
export function extractEditedFilePaths(
	toolCalls: ToolCall[],
	results: ToolResult[],
): string[] {
	const resultsById = new Map(results.map(r => [r.tool_call_id, r]));
	const paths: string[] = [];
	const seen = new Set<string>();

	for (const toolCall of toolCalls) {
		if (!EDIT_TOOLS.has(toolCall.function.name)) continue;
		const result = resultsById.get(toolCall.id);
		if (!result) continue;
		if (
			result.content.startsWith('Error: ') ||
			result.content.startsWith('⚒ Validation failed')
		) {
			continue;
		}
		const args = parseToolArguments<{path?: unknown}>(
			toolCall.function.arguments,
		);
		const path =
			args && typeof args === 'object' && typeof args.path === 'string'
				? args.path
				: undefined;
		if (!path) continue;
		const absPath = resolvePath(path);
		if (seen.has(absPath)) continue;
		seen.add(absPath);
		paths.push(absPath);
	}

	return paths;
}

const fileToUri = (absPath: string): string => `file://${absPath}`;

/** Match a server-published URI against ours, tolerating percent-encoding. */
const uriMatchesFile = (publishedUri: string, fileUri: string): boolean => {
	if (publishedUri === fileUri) return true;
	try {
		return decodeURIComponent(publishedUri) === fileUri;
	} catch {
		return false;
	}
};

/**
 * Subscribe for a publishDiagnostics push for `uri`, then run `trigger` (the
 * didOpen that makes the server recompute). Resolves with the pushed
 * diagnostics, or null on timeout / trigger failure. The timer and listener
 * are cleaned up on every resolution path — nothing outlives the promise.
 */
const waitForPushDiagnostics = (
	lsp: AutoDiagnosticsLSP,
	uri: string,
	timeoutMs: number,
	trigger: () => Promise<boolean>,
): Promise<Diagnostic[] | null> =>
	new Promise(resolve => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		const onDiagnostics = (params: PublishDiagnosticsParams) => {
			if (!uriMatchesFile(params.uri, uri)) return;
			finish(params.diagnostics);
		};

		const finish = (value: Diagnostic[] | null) => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			lsp.removeListener('diagnostics', onDiagnostics);
			resolve(value);
		};

		// Subscribe BEFORE triggering so a fast push can't be missed.
		lsp.on('diagnostics', onDiagnostics);
		timer = setTimeout(() => finish(null), timeoutMs);

		trigger().then(
			opened => {
				// openDocument returns false when no ready server handles the
				// file — no push will ever come, so stop waiting immediately.
				if (!opened) finish(null);
			},
			() => finish(null),
		);
	});

const lspDiagnosticToError = (diag: Diagnostic): AutoDiagnosticError => ({
	line: diag.range.start.line + 1,
	character: diag.range.start.character + 1,
	message: diag.message,
	...(diag.source ? {source: diag.source} : {}),
});

/**
 * Collect error diagnostics for the given files from the local LSP manager.
 * `budgetMs` is the total wall-clock budget shared across all files; files
 * without language support are skipped for free. Returns null when no check
 * actually observed anything (manager uninitialized, no file has language
 * support, or every wait timed out) so callers can distinguish "clean" from
 * "didn't look" — only a real observation should count as clean.
 */
export async function collectLspErrors(
	filePaths: string[],
	lsp: AutoDiagnosticsLSP,
	budgetMs: number = TIMEOUT_AUTO_DIAGNOSTICS_MS,
): Promise<FileErrors[] | null> {
	if (!lsp.isInitialized()) return null;

	const supported = filePaths.filter(path => lsp.hasLanguageSupport(path));
	if (supported.length === 0) return null;

	const deadline = Date.now() + budgetMs;
	const results: FileErrors[] = [];
	let observedAny = false;

	for (const filePath of supported) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) break;

		const diagnostics = await waitForPushDiagnostics(
			lsp,
			fileToUri(filePath),
			remaining,
			() => lsp.openDocument(filePath),
		);
		// Timeout or no server → skip this file rather than risk stale errors.
		if (!diagnostics) continue;
		observedAny = true;

		const errors = diagnostics
			.filter(diag => diag.severity === DiagnosticSeverity.Error)
			.map(lspDiagnosticToError);
		if (errors.length > 0) {
			results.push({file: filePath, errors});
		}
	}

	return observedAny ? results : null;
}

/**
 * Request diagnostics for one file from the connected VS Code extension,
 * bounded by `timeoutMs` (same callback/timeout pattern as the
 * lsp_get_diagnostics tool). Resolves null on timeout.
 */
const requestVSCodeDiagnostics = (
	server: AutoDiagnosticsVSCode,
	filePath: string,
	timeoutMs: number,
): Promise<DiagnosticInfo[] | null> =>
	new Promise(resolve => {
		let settled = false;
		const timer = setTimeout(() => {
			finish(null);
		}, timeoutMs);

		const finish = (value: DiagnosticInfo[] | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};

		server.onCallbacks({
			onDiagnosticsResponse: diagnostics => finish(diagnostics),
		});
		server.requestDiagnostics(filePath);
	});

/**
 * Collect error diagnostics for the given files from the VS Code extension.
 * `budgetMs` is the total wall-clock budget shared across all files. Returns
 * null when no request got a response at all (nothing was observed).
 */
export async function collectVSCodeErrors(
	filePaths: string[],
	server: AutoDiagnosticsVSCode,
	budgetMs: number = TIMEOUT_AUTO_DIAGNOSTICS_MS,
): Promise<FileErrors[] | null> {
	const deadline = Date.now() + budgetMs;
	const results: FileErrors[] = [];
	let observedAny = false;

	for (const filePath of filePaths) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) break;

		const diagnostics = await requestVSCodeDiagnostics(
			server,
			filePath,
			remaining,
		);
		if (!diagnostics) continue;
		observedAny = true;

		const errors = diagnostics
			.filter(
				diag =>
					diag.severity === 'error' && resolvePath(diag.filePath) === filePath,
			)
			.map(diag => ({
				line: diag.line + 1,
				character: diag.character + 1,
				message: diag.message,
				...(diag.source ? {source: diag.source} : {}),
			}));
		if (errors.length > 0) {
			results.push({file: filePath, errors});
		}
	}

	return observedAny ? results : null;
}

/**
 * Build the synthetic user message listing the collected errors. Returns
 * null when there are none. The error list is capped for token hygiene.
 */
export function formatAutoDiagnosticsPrompt(
	fileErrors: FileErrors[],
): {content: string; errorCount: number; fileCount: number} | null {
	const errorCount = fileErrors.reduce((n, f) => n + f.errors.length, 0);
	if (errorCount === 0) return null;

	const lines: string[] = [
		`[Auto-diagnostics] The language server reported ${errorCount} error${
			errorCount === 1 ? '' : 's'
		} in file${fileErrors.length === 1 ? '' : 's'} you just edited:`,
		'',
	];

	let shown = 0;
	for (const {file, errors} of fileErrors) {
		if (shown >= MAX_AUTO_DIAGNOSTIC_ERRORS) break;
		lines.push(`${file}:`);
		for (const error of errors) {
			if (shown >= MAX_AUTO_DIAGNOSTIC_ERRORS) break;
			const source = error.source ? `[${error.source}] ` : '';
			lines.push(
				`  Line ${error.line}:${error.character} ${source}${error.message}`,
			);
			shown++;
		}
	}
	if (shown < errorCount) {
		lines.push(`  …and ${errorCount - shown} more.`);
	}

	lines.push(
		'',
		'Fix these errors now. If an error is pre-existing or cannot be fixed, briefly explain why instead of repeatedly attempting fixes.',
	);

	return {
		content: lines.join('\n'),
		errorCount,
		fileCount: fileErrors.length,
	};
}

/** Dependency overrides for tests; production callers pass nothing. */
export interface AutoDiagnosticsDeps {
	isEnabled?: () => boolean;
	isVSCodeAvailable?: () => boolean;
	getVSCode?: () => Promise<AutoDiagnosticsVSCode>;
	getLsp?: () => Promise<AutoDiagnosticsLSP>;
	budgetMs?: number;
}

export type AutoDiagnosticsCollector = (args: {
	toolCalls: ToolCall[];
	results: ToolResult[];
}) => Promise<AutoDiagnosticsOutcome>;

// Test hook: lets the conversation-loop spec drive the injection path with a
// deterministic collector instead of real LSP / VS Code singletons.
let collectorOverride: AutoDiagnosticsCollector | null = null;

/** Override the collector (pass null to restore). For testing only. */
export function setAutoDiagnosticsCollectorForTesting(
	collector: AutoDiagnosticsCollector | null,
): void {
	collectorOverride = collector;
}

/**
 * Run the post-edit diagnostics check for one executed tool batch.
 *
 * Cheap no-op ordering: the edited-file scan is pure, the preference read is
 * one sync file read, and no LSP/VS Code machinery is touched unless both
 * pass. With no diagnostics source available the outcome is `skipped`.
 */
export async function getAutoDiagnosticsOutcome(
	args: {toolCalls: ToolCall[]; results: ToolResult[]},
	deps: AutoDiagnosticsDeps = {},
): Promise<AutoDiagnosticsOutcome> {
	if (collectorOverride) {
		return collectorOverride(args);
	}

	const editedFiles = extractEditedFilePaths(args.toolCalls, args.results);
	if (editedFiles.length === 0) return {status: 'skipped'};

	const enabled = deps.isEnabled ? deps.isEnabled() : getAutoFixDiagnostics();
	if (!enabled) return {status: 'skipped'};

	const budgetMs = deps.budgetMs ?? TIMEOUT_AUTO_DIAGNOSTICS_MS;

	let fileErrors: FileErrors[] | null;
	try {
		const vscodeAvailable = deps.isVSCodeAvailable
			? deps.isVSCodeAvailable()
			: isVSCodeConnected();
		if (vscodeAvailable) {
			const server = await (deps.getVSCode
				? deps.getVSCode()
				: getVSCodeServer());
			fileErrors = await collectVSCodeErrors(editedFiles, server, budgetMs);
		} else {
			const lsp = await (deps.getLsp ? deps.getLsp() : getLSPManager());
			fileErrors = await collectLspErrors(editedFiles, lsp, budgetMs);
		}
	} catch {
		// A diagnostics hiccup must never break the conversation turn: the
		// caller has already persisted the assistant tool_calls message, so a
		// throw here would leave dangling tool_calls in history and fail the
		// next request. Treat any collection error as "nothing observed".
		return {status: 'skipped'};
	}
	// No observation at all (no source, unsupported files, or every wait
	// timed out) must not count as a clean check.
	if (fileErrors === null) return {status: 'skipped'};

	const formatted = formatAutoDiagnosticsPrompt(fileErrors);
	if (!formatted) return {status: 'clean'};
	return {status: 'errors', ...formatted};
}
