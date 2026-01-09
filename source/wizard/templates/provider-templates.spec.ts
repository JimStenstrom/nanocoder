import test from 'ava';
import {
	PROVIDER_TEMPLATES,
	type FieldValidationResult,
	normalizeUrl,
} from './provider-templates.js';

// Helper to get the URL validator from ollama template
function getUrlValidator() {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'ollama');
	const baseUrlField = template?.fields.find(f => f.name === 'baseUrl');
	return baseUrlField?.validator;
}

// Helper to get the timeout validator from custom template
function getTimeoutValidator() {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'custom');
	const timeoutField = template?.fields.find(f => f.name === 'timeout');
	return timeoutField?.validator;
}

test('ollama template: single model', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'ollama');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'ollama',
		baseUrl: 'http://localhost:11434/v1',
		model: 'llama2',
	});

	t.deepEqual(config.models, ['llama2']);
});

test('ollama template: multiple comma-separated models', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'ollama');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'ollama',
		baseUrl: 'http://localhost:11434/v1',
		model: 'llama2, codellama, mistral',
	});

	t.deepEqual(config.models, ['llama2', 'codellama', 'mistral']);
});

test('ollama template: handles extra whitespace', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'ollama');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'ollama',
		baseUrl: 'http://localhost:11434/v1',
		model: '  llama2  ,  codellama  ,  mistral  ',
	});

	t.deepEqual(config.models, ['llama2', 'codellama', 'mistral']);
});

test('ollama template: filters empty strings', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'ollama');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'ollama',
		baseUrl: 'http://localhost:11434/v1',
		model: 'llama2,,codellama,',
	});

	t.deepEqual(config.models, ['llama2', 'codellama']);
});

test('custom template: single model', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'custom');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'custom-provider',
		baseUrl: 'http://localhost:8000/v1',
		model: 'my-model',
	});

	t.deepEqual(config.models, ['my-model']);
});

test('custom template: multiple comma-separated models', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'custom');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'custom-provider',
		baseUrl: 'http://localhost:8000/v1',
		model: 'model1, model2, model3',
	});

	t.deepEqual(config.models, ['model1', 'model2', 'model3']);
});

test('openrouter template: single model', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'openrouter');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'OpenRouter',
		apiKey: 'test-key',
		model: 'z-ai/glm-4.7',
	});

	t.deepEqual(config.models, ['z-ai/glm-4.7']);
});

test('openrouter template: multiple comma-separated models', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'openrouter');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'OpenRouter',
		apiKey: 'test-key',
		model: 'z-ai/glm-4.7, anthropic/claude-3-opus, openai/gpt-4',
	});

	t.deepEqual(config.models, [
		'z-ai/glm-4.7',
		'anthropic/claude-3-opus',
		'openai/gpt-4',
	]);
});

test('openai template: preserves organizationId', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'openai');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'openai',
		apiKey: 'test-key',
		model: 'gpt-5-codex',
		organizationId: 'org-123',
	});

	t.is(config.organizationId, 'org-123');
	t.deepEqual(config.models, ['gpt-5-codex']);
});

test('openai template: handles multiple models', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'openai');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'openai',
		apiKey: 'test-key',
		model: 'gpt-5-codex, gpt-4-turbo, gpt-4',
	});

	t.deepEqual(config.models, ['gpt-5-codex', 'gpt-4-turbo', 'gpt-4']);
});

test('custom template: includes timeout', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'custom');
	t.truthy(template);

	const config = template!.buildConfig({
		providerName: 'custom-provider',
		baseUrl: 'http://localhost:8000/v1',
		model: 'my-model',
		timeout: '60000',
	});

	t.is(config.timeout, 60000);
});

// URL Validator Tests
test('urlValidator: returns undefined for empty value', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('');
	t.is(result, undefined);
});

test('urlValidator: returns valid for HTTPS URL', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('https://api.example.com/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns valid for localhost HTTP', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://localhost:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns valid for 127.0.0.1 HTTP', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://127.0.0.1:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns valid for private network 192.168.x.x HTTP', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://192.168.1.100:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns valid for private network 10.x.x.x HTTP', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://10.0.0.50:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns valid for private network 172.16.x.x HTTP', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://172.16.0.1:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});

test('urlValidator: returns warning for public HTTP URL', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('http://api.example.com/v1') as FieldValidationResult;
	t.false(result.valid);
	if (!result.valid) {
		t.is(result.severity, 'warning');
		t.true(result.message.includes('HTTP on public server'));
	}
});

test('urlValidator: accepts non-http protocols (will fail at connection time)', t => {
	// We don't block non-http/https protocols since they're unrealistic for LLM APIs
	// Users will get "connection refused" if they try something like ftp://
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('ftp://example.com/v1') as FieldValidationResult;
	t.true(result.valid); // Passes validation, will fail at runtime
});

test('urlValidator: returns error for invalid URL format', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	const result = validator!('not-a-valid-url') as FieldValidationResult;
	t.false(result.valid);
	if (!result.valid) {
		t.is(result.severity, 'error');
		t.true(result.message.includes('Invalid URL'));
	}
});

// Timeout Validator Tests
test('timeoutValidator: returns undefined for empty value', t => {
	const validator = getTimeoutValidator();
	t.truthy(validator);
	const result = validator!('');
	t.is(result, undefined);
});

test('timeoutValidator: returns valid for positive number', t => {
	const validator = getTimeoutValidator();
	t.truthy(validator);
	const result = validator!('30000') as FieldValidationResult;
	t.true(result.valid);
});

test('timeoutValidator: returns error for zero', t => {
	const validator = getTimeoutValidator();
	t.truthy(validator);
	const result = validator!('0') as FieldValidationResult;
	t.false(result.valid);
	if (!result.valid) {
		t.is(result.severity, 'error');
		t.true(result.message.includes('positive number'));
	}
});

test('timeoutValidator: returns error for negative number', t => {
	const validator = getTimeoutValidator();
	t.truthy(validator);
	const result = validator!('-1000') as FieldValidationResult;
	t.false(result.valid);
	if (!result.valid) {
		t.is(result.severity, 'error');
	}
});

test('timeoutValidator: returns error for non-numeric value', t => {
	const validator = getTimeoutValidator();
	t.truthy(validator);
	const result = validator!('abc') as FieldValidationResult;
	t.false(result.valid);
	if (!result.valid) {
		t.is(result.severity, 'error');
	}
});

// URL Normalization Tests
test('normalizeUrl: returns unchanged valid http URL', t => {
	t.is(normalizeUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizeUrl: returns unchanged valid https URL', t => {
	t.is(normalizeUrl('https://api.example.com/v1'), 'https://api.example.com/v1');
});

test('normalizeUrl: fixes htttp:// typo', t => {
	t.is(normalizeUrl('htttp://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizeUrl: fixes htp:// typo', t => {
	t.is(normalizeUrl('htp://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizeUrl: fixes hhtp:// typo', t => {
	t.is(normalizeUrl('hhtp://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizeUrl: fixes htps:// typo', t => {
	t.is(normalizeUrl('htps://api.example.com/v1'), 'https://api.example.com/v1');
});

test('normalizeUrl: fixes htttps:// typo', t => {
	t.is(normalizeUrl('htttps://api.example.com/v1'), 'https://api.example.com/v1');
});

test('normalizeUrl: fixes httpss:// typo', t => {
	t.is(normalizeUrl('httpss://api.example.com/v1'), 'https://api.example.com/v1');
});

test('normalizeUrl: fixes missing colon http//', t => {
	t.is(normalizeUrl('http//localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('normalizeUrl: fixes missing colon https//', t => {
	t.is(normalizeUrl('https//api.example.com/v1'), 'https://api.example.com/v1');
});

test('normalizeUrl: trims whitespace', t => {
	t.is(normalizeUrl('  http://localhost:11434/v1  '), 'http://localhost:11434/v1');
});

test('normalizeUrl: case insensitive protocol fix', t => {
	t.is(normalizeUrl('HTTTP://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('urlValidator: validates typo-corrected URL as valid', t => {
	const validator = getUrlValidator();
	t.truthy(validator);
	// htttp:// typo should be auto-corrected and validate successfully
	const result = validator!('htttp://localhost:11434/v1') as FieldValidationResult;
	t.true(result.valid);
});
