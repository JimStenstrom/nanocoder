import test from 'ava';
import {executeToolsDirectly} from './tool-executor.js';
import type {ToolCall} from '@/types/core';

// Note: This is a minimal smoke test since executeToolsDirectly has complex dependencies
// Full integration testing would require extensive mocking of processToolUse, validators, etc.

test('executeToolsDirectly - returns empty array for no tools', async t => {
	const toolCalls: ToolCall[] = [];
	const conversationStateManager = {
		current: {
			updateAfterToolExecution: () => {},
		},
	} as any;

	const results = await executeToolsDirectly(
		toolCalls,
		null,
		conversationStateManager,
		() => {},
		() => 1,
	);

	t.deepEqual(results, []);
});

test('executeToolsDirectly - does not throw on execution', async t => {
	const toolCalls: ToolCall[] = [
		{
			id: 'call_1',
			function: {name: 'test_tool', arguments: {}},
		},
	];
	const conversationStateManager = {
		current: {
			updateAfterToolExecution: () => {},
		},
	} as any;

	// Should handle errors gracefully
	await t.notThrowsAsync(async () => {
		await executeToolsDirectly(
			toolCalls,
			null,
			conversationStateManager,
			() => {},
			() => 1,
		);
	});
});
