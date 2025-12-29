import test from 'ava';
import {PROVIDER_TEMPLATES} from './provider-templates.js';

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

// Azure OpenAI tests
test('azure-openai template: extracts deployment from full URL', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint:
			'https://jim-mjrgv2i9-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-5-nano/chat/completions?api-version=2025-01-01-preview',
		apiKey: 'test-key',
		providerName: 'Azure OpenAI',
	});

	t.is(config.name, 'Azure OpenAI');
	t.is(config.providerType, 'azure');
	t.is(
		config.baseUrl,
		'https://jim-mjrgv2i9-eastus2.cognitiveservices.azure.com',
	);
	t.is(config.apiKey, 'test-key');
	t.deepEqual(config.models, ['gpt-5-nano']);
});

test('azure-openai template: handles base URL only', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint: 'https://myresource.openai.azure.com',
		apiKey: 'test-key',
	});

	t.is(config.baseUrl, 'https://myresource.openai.azure.com');
	t.deepEqual(config.models, []);
});

test('azure-openai template: strips trailing paths from base URL', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint: 'https://myresource.openai.azure.com/some/other/path',
		apiKey: 'test-key',
	});

	t.is(config.baseUrl, 'https://myresource.openai.azure.com');
});

test('azure-openai template: cognitiveservices endpoint', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint:
			'https://myresource-eastus2.cognitiveservices.azure.com/openai/deployments/my-gpt4/chat/completions',
		apiKey: 'test-key',
	});

	t.is(
		config.baseUrl,
		'https://myresource-eastus2.cognitiveservices.azure.com',
	);
	t.deepEqual(config.models, ['my-gpt4']);
});

test('azure-openai template: default provider name', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint:
			'https://myresource.openai.azure.com/openai/deployments/gpt-4o/chat/completions',
		apiKey: 'test-key',
	});

	t.is(config.name, 'Azure OpenAI');
});

test('azure-openai template: custom provider name', t => {
	const template = PROVIDER_TEMPLATES.find(t => t.id === 'azure-openai');
	t.truthy(template);

	const config = template!.buildConfig({
		endpoint:
			'https://myresource.openai.azure.com/openai/deployments/gpt-4o/chat/completions',
		apiKey: 'test-key',
		providerName: 'My Azure Instance',
	});

	t.is(config.name, 'My Azure Instance');
});
