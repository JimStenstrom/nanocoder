import test from 'ava';
import {processAssistantResponse} from './conversation-loop.js';
import type {Message} from '@/types/core';

// Note: This is a minimal smoke test since processAssistantResponse is highly complex
// and has many external dependencies. Full integration testing would require
// extensive mocking of LLMClient, ToolManager, message components, etc.

test('processAssistantResponse - throws on null client', async t => {
	const params = {
		systemMessage: {role: 'system', content: 'test'} as Message,
		messages: [],
		client: null as any,
		toolManager: null,
		abortController: null,
		setAbortController: () => {},
		setIsGenerating: () => {},
		setStreamingContent: () => {},
		setTokenCount: () => {},
		setMessages: () => {},
		addToChatQueue: () => {},
		getNextComponentKey: () => 1,
		currentModel: 'test-model',
		developmentMode: 'normal' as const,
		nonInteractiveMode: false,
		conversationStateManager: {
			current: {
				updateAssistantMessage: () => {},
				updateAfterToolExecution: () => {},
			},
		} as any,
		onStartToolConfirmationFlow: () => {},
		onConversationComplete: () => {},
	};

	await t.throwsAsync(async () => {
		await processAssistantResponse(params);
	});
});
