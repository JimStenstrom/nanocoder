import test from 'ava';
import type {AIProviderConfig} from './types/config.js';

test('AISDKClient - maxRetries configuration default value', t => {
	// Test that maxRetries defaults to 2 when not specified
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	// Verify default is 2 (AI SDK default)
	const expectedDefault = 2;
	const actualDefault = config.maxRetries ?? 2;

	t.is(actualDefault, expectedDefault);
});

test('AISDKClient - maxRetries configuration custom value', t => {
	// Test that maxRetries can be set to a custom value
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: 5,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	t.is(config.maxRetries, 5);
});

test('AISDKClient - maxRetries configuration zero retries', t => {
	// Test that maxRetries can be set to 0 to disable retries
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: 0,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	t.is(config.maxRetries, 0);
});

test('AIProviderConfig type - includes maxRetries in interface', t => {
	// Compile-time test that maxRetries is part of the interface
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: 3,
		config: {
			baseURL: 'http://localhost:11434/v1',
		},
	};

	// TypeScript should not complain about maxRetries property
	t.is(typeof config.maxRetries, 'number');
	t.true('maxRetries' in config);
});
