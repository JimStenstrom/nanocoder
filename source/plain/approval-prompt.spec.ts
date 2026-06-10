import test from 'ava';
import type {ToolCall} from '@/types/core';
import {
	type AskFunction,
	formatApprovalQuestion,
	promptToolApproval,
} from './approval-prompt.js';

// Suppress ANSI so prompt-text assertions stay readable.
process.env.NO_COLOR = '1';

const TOOL_CALL: ToolCall = {
	id: 'call-1',
	function: {name: 'execute_bash', arguments: {command: 'rm -rf build'}},
};

function scriptedAsk(answers: string[]): {
	ask: AskFunction;
	questions: string[];
} {
	const questions: string[] = [];
	const remaining = [...answers];
	const ask: AskFunction = async question => {
		questions.push(question);
		const answer = remaining.shift();
		if (answer === undefined) {
			throw new Error('scripted ask ran out of answers');
		}
		return answer;
	};
	return {ask, questions};
}

test('maps single-letter answers to decisions', async t => {
	t.is(await promptToolApproval(TOOL_CALL, scriptedAsk(['y']).ask), 'approve');
	t.is(await promptToolApproval(TOOL_CALL, scriptedAsk(['n']).ask), 'deny');
});

test('accepts word answers, mixed case, and surrounding whitespace', async t => {
	t.is(
		await promptToolApproval(TOOL_CALL, scriptedAsk([' YES ']).ask),
		'approve',
	);
	t.is(await promptToolApproval(TOOL_CALL, scriptedAsk(['No']).ask), 'deny');
});

test('does not treat inherited object keys as decisions', async t => {
	// A bare DECISIONS[answer] lookup would resolve 'constructor' to the
	// inherited Object constructor (truthy) and approve the tool.
	const {ask, questions} = scriptedAsk(['constructor', 'toString', 'n']);

	const decision = await promptToolApproval(TOOL_CALL, ask);

	t.is(decision, 'deny');
	t.is(questions.length, 3);
});

test('re-prompts on empty or unrecognized input', async t => {
	const {ask, questions} = scriptedAsk(['', 'maybe', 'n']);

	const decision = await promptToolApproval(TOOL_CALL, ask);

	t.is(decision, 'deny');
	t.is(questions.length, 3);
	t.regex(questions[1], /answer y or n/);
});

test('first prompt names the tool, shows arguments, and lists the options', async t => {
	const {ask, questions} = scriptedAsk(['y']);

	await promptToolApproval(TOOL_CALL, ask);

	t.regex(questions[0], /execute_bash/);
	t.regex(questions[0], /rm -rf build/);
	t.regex(questions[0], /\[y\].*\[n\]/s);
});

test('propagates ask rejections (EOF / interrupt) to the caller', async t => {
	const ask: AskFunction = async () => {
		throw new Error('Input closed at approval prompt');
	};

	await t.throwsAsync(promptToolApproval(TOOL_CALL, ask), {
		message: /Input closed/,
	});
});

test('formatApprovalQuestion truncates huge arguments', t => {
	const bigCall: ToolCall = {
		id: 'call-2',
		function: {
			name: 'write_file',
			arguments: {path: 'a.txt', content: 'x'.repeat(10_000)},
		},
	};

	const question = formatApprovalQuestion(bigCall);

	t.true(question.length < 3000);
	t.regex(question, /truncated/);
});

test('formatApprovalQuestion omits the argument line for empty arguments', t => {
	const bareCall: ToolCall = {
		id: 'call-3',
		function: {name: 'list_directory', arguments: {}},
	};

	const question = formatApprovalQuestion(bareCall);

	t.regex(question, /list_directory/);
	t.false(question.includes('{}'));
});
