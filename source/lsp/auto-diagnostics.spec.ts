import {EventEmitter} from 'node:events';
import {resolve as resolvePath} from 'node:path';
import test from 'ava';
import {MAX_AUTO_DIAGNOSTIC_ERRORS} from '@/constants';
import type {ToolCall, ToolResult} from '@/types/core';
import type {DiagnosticInfo} from '@/vscode/index';
import {
	type AutoDiagnosticsLSP,
	type AutoDiagnosticsVSCode,
	collectLspErrors,
	collectVSCodeErrors,
	extractEditedFilePaths,
	type FileErrors,
	formatAutoDiagnosticsPrompt,
	getAutoDiagnosticsOutcome,
	setAutoDiagnosticsCollectorForTesting,
} from './auto-diagnostics';
import type {Diagnostic} from './protocol';
import {DiagnosticSeverity} from './protocol';

console.log(`\nauto-diagnostics.spec.ts`);

// ============================================================================
// Helpers
// ============================================================================

const makeToolCall = (
	id: string,
	name: string,
	args: Record<string, unknown> | string,
): ToolCall => ({
	id,
	function: {
		name,
		// XML-fallback models can deliver arguments as a JSON string; the
		// extractor must handle both shapes.
		arguments: args as Record<string, unknown>,
	},
});

const makeResult = (id: string, name: string, content: string): ToolResult => ({
	tool_call_id: id,
	role: 'tool',
	name,
	content,
});

const makeDiagnostic = (
	severity: DiagnosticSeverity | undefined,
	message: string,
	line = 0,
	character = 0,
	source?: string,
): Diagnostic => ({
	range: {
		start: {line, character},
		end: {line, character: character + 1},
	},
	...(severity !== undefined ? {severity} : {}),
	...(source ? {source} : {}),
	message,
});

/**
 * Fake LSP manager: emits the configured diagnostics for a file right after
 * openDocument is called (mimicking a server's publishDiagnostics push).
 */
class FakeLSP extends EventEmitter implements AutoDiagnosticsLSP {
	initialized = true;
	supported = new Set<string>();
	pushes = new Map<string, Diagnostic[]>();
	/** Optional URI transform for the push (e.g. percent-encoding). */
	uriTransform: (uri: string) => string = uri => uri;
	openDocumentCalls: string[] = [];
	openDocumentResult = true;
	/** When false, openDocument never triggers a push (forces a timeout). */
	pushOnOpen = true;
	/** Files that never get a push even when pushOnOpen is true. */
	noPushFor = new Set<string>();

	isInitialized(): boolean {
		return this.initialized;
	}

	hasLanguageSupport(filePath: string): boolean {
		return this.supported.has(filePath);
	}

	async openDocument(filePath: string): Promise<boolean> {
		this.openDocumentCalls.push(filePath);
		if (
			this.pushOnOpen &&
			this.openDocumentResult &&
			!this.noPushFor.has(filePath)
		) {
			const diagnostics = this.pushes.get(filePath) ?? [];
			const uri = this.uriTransform(`file://${filePath}`);
			setImmediate(() => {
				this.emit('diagnostics', {uri, diagnostics});
			});
		}
		return this.openDocumentResult;
	}
}

class FakeVSCode implements AutoDiagnosticsVSCode {
	diagnostics: DiagnosticInfo[] = [];
	respond = true;
	requests: (string | undefined)[] = [];
	private callback: ((diagnostics: DiagnosticInfo[]) => void) | undefined;

	onCallbacks(callbacks: {
		onDiagnosticsResponse?: (diagnostics: DiagnosticInfo[]) => void;
	}): void {
		this.callback = callbacks.onDiagnosticsResponse;
	}

	requestDiagnostics(filePath?: string): void {
		this.requests.push(filePath);
		if (this.respond) {
			const diagnostics = this.diagnostics;
			setImmediate(() => this.callback?.(diagnostics));
		}
	}
}

test.afterEach(() => {
	setAutoDiagnosticsCollectorForTesting(null);
});

// ============================================================================
// extractEditedFilePaths
// ============================================================================

test('extractEditedFilePaths - collects successful edit-tool paths, deduped and absolute', t => {
	const toolCalls = [
		makeToolCall('1', 'string_replace', {path: 'src/a.ts', old_str: 'x'}),
		makeToolCall('2', 'write_file', {path: 'src/b.ts', content: 'y'}),
		makeToolCall('3', 'string_replace', {path: 'src/a.ts', old_str: 'z'}),
	];
	const results = [
		makeResult('1', 'string_replace', 'Successfully replaced content'),
		makeResult('2', 'write_file', 'File written'),
		makeResult('3', 'string_replace', 'Successfully replaced content'),
	];

	const paths = extractEditedFilePaths(toolCalls, results);
	t.deepEqual(paths, [resolvePath('src/a.ts'), resolvePath('src/b.ts')]);
});

test('extractEditedFilePaths - ignores non-edit tools and failed edits', t => {
	const toolCalls = [
		makeToolCall('1', 'read_file', {path: 'src/a.ts'}),
		makeToolCall('2', 'string_replace', {path: 'src/b.ts'}),
		makeToolCall('3', 'write_file', {path: 'src/c.ts'}),
		makeToolCall('4', 'write_file', {path: 'src/d.ts'}),
	];
	const results = [
		makeResult('1', 'read_file', 'file contents'),
		makeResult('2', 'string_replace', 'Error: Content not found in file.'),
		makeResult('3', 'write_file', '⚒ Validation failed: bad path'),
		makeResult('4', 'write_file', 'File written'),
	];

	const paths = extractEditedFilePaths(toolCalls, results);
	t.deepEqual(paths, [resolvePath('src/d.ts')]);
});

test('extractEditedFilePaths - handles JSON-string arguments and missing data', t => {
	const toolCalls = [
		makeToolCall('1', 'write_file', '{"path":"src/a.ts","content":"x"}'),
		makeToolCall('2', 'write_file', 'not json at all'),
		makeToolCall('3', 'write_file', {content: 'no path'}),
		makeToolCall('4', 'write_file', {path: 'src/never-ran.ts'}),
	];
	const results = [
		makeResult('1', 'write_file', 'File written'),
		makeResult('2', 'write_file', 'File written'),
		makeResult('3', 'write_file', 'File written'),
		// no result for call 4
	];

	const paths = extractEditedFilePaths(toolCalls, results);
	t.deepEqual(paths, [resolvePath('src/a.ts')]);
});

// ============================================================================
// collectLspErrors
// ============================================================================

test('collectLspErrors - returns only error-severity diagnostics, 1-based', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);
	lsp.pushes.set(file, [
		makeDiagnostic(DiagnosticSeverity.Error, 'broken', 2, 4, 'typescript'),
		makeDiagnostic(DiagnosticSeverity.Warning, 'meh', 5, 0),
		makeDiagnostic(DiagnosticSeverity.Hint, 'nit', 6, 0),
		makeDiagnostic(undefined, 'unknown severity', 7, 0),
	]);

	const result = await collectLspErrors([file], lsp, 1000);
	t.deepEqual(result, [
		{
			file,
			errors: [
				{line: 3, character: 5, message: 'broken', source: 'typescript'},
			],
		},
	]);
	t.is(lsp.listenerCount('diagnostics'), 0, 'listener must be removed');
});

test('collectLspErrors - clean file yields empty list (not null)', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);
	lsp.pushes.set(file, [makeDiagnostic(DiagnosticSeverity.Warning, 'meh')]);

	const result = await collectLspErrors([file], lsp, 1000);
	t.deepEqual(result, []);
});

test('collectLspErrors - returns null when manager is not initialized', async t => {
	const lsp = new FakeLSP();
	lsp.initialized = false;
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);

	const result = await collectLspErrors([file], lsp, 1000);
	t.is(result, null);
	t.deepEqual(lsp.openDocumentCalls, []);
});

test('collectLspErrors - returns null when no file has language support', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/readme.md');

	const result = await collectLspErrors([file], lsp, 1000);
	t.is(result, null);
	t.deepEqual(lsp.openDocumentCalls, []);
});

test('collectLspErrors - no push within budget returns null (nothing was observed)', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);
	lsp.pushOnOpen = false;

	const result = await collectLspErrors([file], lsp, 50);
	t.is(result, null, 'a full timeout must not be reported as a clean check');
	t.is(lsp.listenerCount('diagnostics'), 0, 'listener cleared after timeout');
});

test('collectLspErrors - openDocument returning false resolves without waiting out the budget', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);
	lsp.openDocumentResult = false;

	const started = Date.now();
	const result = await collectLspErrors([file], lsp, 5000);
	t.is(result, null);
	t.true(
		Date.now() - started < 4000,
		'must not wait out the full budget when no server handles the file',
	);
	t.is(lsp.listenerCount('diagnostics'), 0);
});

test('collectLspErrors - one observed file is a real check even if another times out', async t => {
	const lsp = new FakeLSP();
	const fileA = resolvePath('src/a.ts');
	const fileB = resolvePath('src/b.ts');
	lsp.supported.add(fileA);
	lsp.supported.add(fileB);
	lsp.pushes.set(fileA, [makeDiagnostic(DiagnosticSeverity.Warning, 'meh')]);
	lsp.noPushFor.add(fileB);

	const result = await collectLspErrors([fileA, fileB], lsp, 150);
	t.deepEqual(result, [], 'observed file was clean; timed-out file skipped');
	t.is(lsp.listenerCount('diagnostics'), 0);
});

test('collectLspErrors - matches percent-encoded URIs from the server', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/my file.ts');
	lsp.supported.add(file);
	lsp.pushes.set(file, [makeDiagnostic(DiagnosticSeverity.Error, 'broken')]);
	lsp.uriTransform = uri => encodeURI(uri);

	const result = await collectLspErrors([file], lsp, 1000);
	t.is(result?.length, 1);
	t.is(result?.[0]?.errors[0]?.message, 'broken');
});

test('collectLspErrors - collects across multiple files', async t => {
	const lsp = new FakeLSP();
	const fileA = resolvePath('src/a.ts');
	const fileB = resolvePath('src/b.ts');
	lsp.supported.add(fileA);
	lsp.supported.add(fileB);
	lsp.pushes.set(fileA, [makeDiagnostic(DiagnosticSeverity.Error, 'a broke')]);
	lsp.pushes.set(fileB, [makeDiagnostic(DiagnosticSeverity.Error, 'b broke')]);

	const result = await collectLspErrors([fileA, fileB], lsp, 1000);
	t.is(result?.length, 2);
	t.is(result?.[0]?.errors[0]?.message, 'a broke');
	t.is(result?.[1]?.errors[0]?.message, 'b broke');
	t.is(lsp.listenerCount('diagnostics'), 0);
});

// ============================================================================
// collectVSCodeErrors
// ============================================================================

test('collectVSCodeErrors - filters to errors in the requested file', async t => {
	const server = new FakeVSCode();
	const file = resolvePath('src/a.ts');
	server.diagnostics = [
		{
			filePath: file,
			line: 2,
			character: 4,
			message: 'broken',
			severity: 'error',
			source: 'ts',
		},
		{
			filePath: file,
			line: 5,
			character: 0,
			message: 'meh',
			severity: 'warning',
		},
		{
			filePath: resolvePath('src/other.ts'),
			line: 1,
			character: 1,
			message: 'elsewhere',
			severity: 'error',
		},
	];

	const result = await collectVSCodeErrors([file], server, 1000);
	t.deepEqual(result, [
		{
			file,
			errors: [{line: 3, character: 5, message: 'broken', source: 'ts'}],
		},
	]);
	t.deepEqual(server.requests, [file]);
});

test('collectVSCodeErrors - no response within budget returns null (nothing was observed)', async t => {
	const server = new FakeVSCode();
	server.respond = false;

	const result = await collectVSCodeErrors(
		[resolvePath('src/a.ts')],
		server,
		50,
	);
	t.is(result, null, 'a full timeout must not be reported as a clean check');
});

// ============================================================================
// formatAutoDiagnosticsPrompt
// ============================================================================

test('formatAutoDiagnosticsPrompt - returns null when there are no errors', t => {
	t.is(formatAutoDiagnosticsPrompt([]), null);
	t.is(formatAutoDiagnosticsPrompt([{file: '/tmp/a.ts', errors: []}]), null);
});

test('formatAutoDiagnosticsPrompt - labelled message with positions and source', t => {
	const formatted = formatAutoDiagnosticsPrompt([
		{
			file: '/tmp/a.ts',
			errors: [
				{line: 3, character: 5, message: 'broken', source: 'typescript'},
				{line: 9, character: 1, message: 'also broken'},
			],
		},
	]);

	t.truthy(formatted);
	t.is(formatted?.errorCount, 2);
	t.is(formatted?.fileCount, 1);
	t.true(formatted?.content.startsWith('[Auto-diagnostics]'));
	t.true(formatted?.content.includes('2 errors'));
	t.true(formatted?.content.includes('/tmp/a.ts:'));
	t.true(formatted?.content.includes('Line 3:5 [typescript] broken'));
	t.true(formatted?.content.includes('Line 9:1 also broken'));
	t.true(formatted?.content.includes('Fix these errors now.'));
});

test('formatAutoDiagnosticsPrompt - caps the listed errors', t => {
	const errors = Array.from({length: MAX_AUTO_DIAGNOSTIC_ERRORS + 5}, (_, i) => ({
		line: i + 1,
		character: 1,
		message: `error ${i}`,
	}));
	const formatted = formatAutoDiagnosticsPrompt([{file: '/tmp/a.ts', errors}]);

	t.is(formatted?.errorCount, MAX_AUTO_DIAGNOSTIC_ERRORS + 5);
	t.true(formatted?.content.includes(`error ${MAX_AUTO_DIAGNOSTIC_ERRORS - 1}`));
	t.false(formatted?.content.includes(`error ${MAX_AUTO_DIAGNOSTIC_ERRORS}\n`));
	t.true(formatted?.content.includes('…and 5 more.'));
});

// ============================================================================
// getAutoDiagnosticsOutcome
// ============================================================================

const editTurn = () => ({
	toolCalls: [makeToolCall('1', 'write_file', {path: 'src/a.ts'})],
	results: [makeResult('1', 'write_file', 'File written')],
});

test('getAutoDiagnosticsOutcome - skipped when nothing was edited (preference never read)', async t => {
	let enabledChecked = false;
	const outcome = await getAutoDiagnosticsOutcome(
		{
			toolCalls: [makeToolCall('1', 'read_file', {path: 'src/a.ts'})],
			results: [makeResult('1', 'read_file', 'contents')],
		},
		{
			isEnabled: () => {
				enabledChecked = true;
				return true;
			},
		},
	);
	t.deepEqual(outcome, {status: 'skipped'});
	t.false(enabledChecked, 'cheap pure check must run before preference I/O');
});

test('getAutoDiagnosticsOutcome - skipped when the preference is off', async t => {
	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => false,
	});
	t.deepEqual(outcome, {status: 'skipped'});
});

test('getAutoDiagnosticsOutcome - skipped when no diagnostics source is available', async t => {
	const lsp = new FakeLSP();
	lsp.initialized = false;

	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => true,
		isVSCodeAvailable: () => false,
		getLsp: async () => lsp,
	});
	t.deepEqual(outcome, {status: 'skipped'});
});

test('getAutoDiagnosticsOutcome - skipped when the diagnostics source throws', async t => {
	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => true,
		isVSCodeAvailable: () => false,
		getLsp: async () => {
			throw new Error('LSP exploded');
		},
	});
	t.deepEqual(outcome, {status: 'skipped'});
});

test('getAutoDiagnosticsOutcome - clean when LSP reports no errors', async t => {
	const lsp = new FakeLSP();
	lsp.supported.add(resolvePath('src/a.ts'));
	lsp.pushes.set(resolvePath('src/a.ts'), [
		makeDiagnostic(DiagnosticSeverity.Warning, 'meh'),
	]);

	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => true,
		isVSCodeAvailable: () => false,
		getLsp: async () => lsp,
		budgetMs: 1000,
	});
	t.deepEqual(outcome, {status: 'clean'});
});

test('getAutoDiagnosticsOutcome - errors when LSP reports them', async t => {
	const lsp = new FakeLSP();
	const file = resolvePath('src/a.ts');
	lsp.supported.add(file);
	lsp.pushes.set(file, [makeDiagnostic(DiagnosticSeverity.Error, 'broken', 2)]);

	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => true,
		isVSCodeAvailable: () => false,
		getLsp: async () => lsp,
		budgetMs: 1000,
	});
	t.is(outcome.status, 'errors');
	if (outcome.status === 'errors') {
		t.is(outcome.errorCount, 1);
		t.is(outcome.fileCount, 1);
		t.true(outcome.content.includes('broken'));
	}
});

test('getAutoDiagnosticsOutcome - prefers VS Code when connected', async t => {
	const server = new FakeVSCode();
	const file = resolvePath('src/a.ts');
	server.diagnostics = [
		{
			filePath: file,
			line: 0,
			character: 0,
			message: 'vscode broken',
			severity: 'error',
		},
	];
	const lsp = new FakeLSP();

	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => true,
		isVSCodeAvailable: () => true,
		getVSCode: async () => server,
		getLsp: async () => lsp,
		budgetMs: 1000,
	});
	t.is(outcome.status, 'errors');
	if (outcome.status === 'errors') {
		t.true(outcome.content.includes('vscode broken'));
	}
	t.deepEqual(lsp.openDocumentCalls, [], 'LSP must not be touched');
});

test('getAutoDiagnosticsOutcome - collector override takes precedence and resets', async t => {
	setAutoDiagnosticsCollectorForTesting(async () => ({
		status: 'errors',
		content: 'overridden',
		errorCount: 1,
		fileCount: 1,
	}));
	const outcome = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => false,
	});
	t.is(outcome.status, 'errors');

	setAutoDiagnosticsCollectorForTesting(null);
	const after = await getAutoDiagnosticsOutcome(editTurn(), {
		isEnabled: () => false,
	});
	t.deepEqual(after, {status: 'skipped'});
});

// Type-level guard: the real LSPManager and VSCodeServer must satisfy the
// structural interfaces the collector accepts. This block never runs — it
// fails compilation (reviewers' tsc; specs are excluded from the repo's
// tsconfig) if the interfaces drift from the real classes.
test('interfaces - structurally compatible with the real implementations', t => {
	const _typecheck = async () => {
		const {LSPManager} = await import('./lsp-manager');
		const manager: AutoDiagnosticsLSP = new LSPManager();
		void manager;
		const {getVSCodeServer} = await import('@/vscode/index');
		const server: AutoDiagnosticsVSCode = await getVSCodeServer();
		void server;
		const errors: FileErrors[] = [];
		void errors;
	};
	void _typecheck;
	t.pass();
});
