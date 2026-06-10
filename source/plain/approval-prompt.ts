import {createInterface} from 'node:readline';
import {color} from '@/plain/writer';
import type {ToolCall} from '@/types/core';
import {parseToolArguments} from '@/utils/tool-args-parser';

/**
 * Outcome of asking the human about one tool call (`nanocoder run --ask`):
 *
 * - `approve`: run this call only.
 * - `deny`: don't run it; the model receives a cancellation tool result.
 */
export type ApprovalDecision = 'approve' | 'deny';

/**
 * Reads one line of user input in response to `question`. Implementations
 * must reject on EOF / interrupt so the caller can fail safe (treat the
 * approval as not granted).
 */
export type AskFunction = (question: string) => Promise<string>;

/** Cap the rendered tool arguments (write_file payloads can be enormous). */
const MAX_ARGUMENT_PREVIEW_CHARS = 2000;

const DECISIONS: Record<string, ApprovalDecision> = {
	y: 'approve',
	yes: 'approve',
	n: 'deny',
	no: 'deny',
};

export function formatApprovalQuestion(toolCall: ToolCall): string {
	let argsPreview: string;
	try {
		argsPreview = JSON.stringify(
			parseToolArguments(toolCall.function.arguments),
		);
	} catch {
		argsPreview = String(toolCall.function.arguments);
	}
	if (argsPreview && argsPreview.length > MAX_ARGUMENT_PREVIEW_CHARS) {
		argsPreview = `${argsPreview.slice(0, MAX_ARGUMENT_PREVIEW_CHARS)}… (truncated)`;
	}
	const lines = [
		color('yellow', `Tool approval required: ${toolCall.function.name}`),
		...(argsPreview && argsPreview !== '{}'
			? [color('gray', `  ${argsPreview}`)]
			: []),
		'Approve? [y] yes once  [n] no: ',
	];
	return lines.join('\n');
}

/**
 * Ask the human to approve one tool call. Re-prompts on unrecognized input;
 * propagates `ask` rejections (EOF / Ctrl-C) to the caller, which treats the
 * approval as not granted.
 */
export async function promptToolApproval(
	toolCall: ToolCall,
	ask: AskFunction,
): Promise<ApprovalDecision> {
	let question = formatApprovalQuestion(toolCall);
	for (;;) {
		const answer = (await ask(question)).trim().toLowerCase();
		// hasOwn guard: a plain-object lookup alone would also match inherited
		// keys like "constructor" and mistake them for a decision.
		if (Object.hasOwn(DECISIONS, answer)) {
			return DECISIONS[answer];
		}
		question = 'Please answer y or n: ';
	}
}

/**
 * Real-TTY `AskFunction`: one readline interface per question, reading from
 * stdin and prompting on stderr (stdout stays reserved for model output, so
 * `nanocoder run --ask "..." > out.md` keeps working). Rejects on Ctrl-C and
 * on EOF / closed stdin.
 */
export function createStdinAsk(): AskFunction {
	return question =>
		new Promise<string>((resolve, reject) => {
			const rl = createInterface({
				input: process.stdin,
				output: process.stderr,
			});
			let settled = false;
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				fn();
				rl.close();
			};
			rl.on('SIGINT', () => {
				process.stderr.write('\n');
				finish(() => reject(new Error('Interrupted at approval prompt')));
			});
			rl.on('close', () => {
				finish(() => reject(new Error('Input closed at approval prompt')));
			});
			rl.question(question, answer => {
				finish(() => resolve(answer));
			});
		});
}
