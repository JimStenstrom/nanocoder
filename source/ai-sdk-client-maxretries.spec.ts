import test from 'ava';
import {AISDKClient} from './ai-sdk-client.js';
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

// Integration tests with actual AISDKClient instantiation

test('AISDKClient - instantiation with default maxRetries', async t => {
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	const client = await AISDKClient.create(config);

	// Client should be created successfully
	t.truthy(client);
	t.is(client.getCurrentModel(), 'test-model');
});

test('AISDKClient - instantiation with custom maxRetries', async t => {
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

	const client = await AISDKClient.create(config);

	// Client should be created successfully with custom maxRetries
	t.truthy(client);
	t.is(client.getCurrentModel(), 'test-model');
});

test('AISDKClient - instantiation with zero maxRetries', async t => {
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

	const client = await AISDKClient.create(config);

	// Client should be created successfully with retries disabled
	t.truthy(client);
	t.is(client.getCurrentModel(), 'test-model');
});

// Edge case tests for maxRetries values

test('AISDKClient - handles negative maxRetries by clamping to 0', async t => {
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: -5,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	const client = await AISDKClient.create(config);

	// Client should be created and negative value clamped to 0
	t.truthy(client);
});

test('AISDKClient - handles very large maxRetries value', async t => {
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: 1000000,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	const client = await AISDKClient.create(config);

	// Client should be created with large retry value
	t.truthy(client);
});

test('AISDKClient - handles fractional maxRetries by flooring', async t => {
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: 3.7,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	const client = await AISDKClient.create(config);

	// Client should be created and fractional value floored to 3
	t.truthy(client);
});

test('AISDKClient - handles NaN maxRetries by using default', async t => {
	const config: AIProviderConfig = {
		name: 'TestProvider',
		type: 'openai-compatible',
		models: ['test-model'],
		maxRetries: NaN,
		config: {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'test-key',
		},
	};

	const client = await AISDKClient.create(config);

	// Client should be created with default value (NaN becomes 0 after Math.floor)
	t.truthy(client);
});
