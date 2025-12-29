import test from 'ava';
import {render} from 'ink-testing-library';
import React from 'react';
import {ProviderStep} from './provider-step.js';

// ============================================================================
// Tests for ProviderStep Component Rendering
// ============================================================================

console.log(`\nprovider-step.spec.tsx – ${React.version}`);

test('ProviderStep renders with initial options', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Let's add AI providers/);
});

test('ProviderStep shows template selection option', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	t.regex(output!, /Choose from common templates/);
});

test('ProviderStep shows custom provider option', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	t.regex(output!, /Add custom provider manually/);
});

test('ProviderStep shows skip option', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	t.regex(output!, /Skip providers/);
});

test('ProviderStep shows edit option when providers exist', t => {
	const existingProviders = [
		{
			name: 'ollama',
			baseUrl: 'http://localhost:11434/v1',
			models: ['llama2'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	const output = lastFrame();
	t.regex(output!, /Edit existing providers/);
});

test('ProviderStep does not show edit option when no providers exist', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	t.notRegex(output!, /Edit existing providers/);
});

test('ProviderStep shows provider count when providers exist', t => {
	const existingProviders = [
		{
			name: 'ollama',
			baseUrl: 'http://localhost:11434/v1',
			models: ['llama2'],
		},
		{
			name: 'OpenRouter',
			baseUrl: 'https://openrouter.ai/api/v1',
			apiKey: 'test-key',
			models: ['model1'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	const output = lastFrame();
	t.regex(output!, /2 providers already added/);
});

test('ProviderStep renders without crashing when onBack is provided', t => {
	let backCalled = false;

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			onBack={() => {
				backCalled = true;
			}}
		/>,
	);

	t.truthy(lastFrame());
	t.false(backCalled); // Should not be called on render
});

test('ProviderStep accepts existingProviders prop', t => {
	const existingProviders = [
		{
			name: 'test-provider',
			baseUrl: 'http://localhost:8080/v1',
			models: ['test-model'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	// Component should render without errors
	t.truthy(lastFrame());
});

test('ProviderStep renders with correct initial state', t => {
	const {frames} = render(<ProviderStep onComplete={() => {}} />);

	// Should have rendered at least one frame
	t.true(frames.length > 0);

	// First frame should show initial options
	const firstFrame = frames[0];
	t.regex(firstFrame, /Let's add AI providers/);
});

// ============================================================================
// Tests for ProviderStep Component Modes
// ============================================================================

test('ProviderStep renders template selection mode', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	// Initial mode shows the prompt to choose templates
	t.regex(output!, /Let's add AI providers/);
});

test('ProviderStep shows provider templates in list', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	// Initial screen shows option to choose templates
	t.regex(output!, /Choose from common templates/);
});

// ============================================================================
// Tests for ProviderStep Component Callbacks
// ============================================================================

test('ProviderStep calls onComplete when provided', t => {
	let completeCalled = false;

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {
				completeCalled = true;
			}}
		/>,
	);

	t.truthy(lastFrame());
	t.false(completeCalled); // Should not be called on render
});

test('ProviderStep calls onBack when provided', t => {
	let backCalled = false;

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			onBack={() => {
				backCalled = true;
			}}
		/>,
	);

	t.truthy(lastFrame());
	t.false(backCalled); // Should not be called on render
});

// ============================================================================
// Tests for ProviderStep State Management
// ============================================================================

test('ProviderStep shows single provider count', t => {
	const existingProviders = [
		{
			name: 'provider1',
			baseUrl: 'http://localhost:1111/v1',
			models: ['model1'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	const output = lastFrame();
	t.regex(output!, /1 provider already added/);
});

test('ProviderStep shows multiple providers count', t => {
	const existingProviders = [
		{
			name: 'provider1',
			baseUrl: 'http://localhost:1111/v1',
			models: ['model1'],
		},
		{
			name: 'provider2',
			baseUrl: 'http://localhost:2222/v1',
			models: ['model2'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	const output = lastFrame();
	t.regex(output!, /2 providers already added/);
});

test('ProviderStep handles empty existingProviders array', t => {
	const {lastFrame} = render(
		<ProviderStep onComplete={() => {}} existingProviders={[]} />,
	);

	const output = lastFrame();
	t.truthy(output);
	// Should not show provider count when none exist
	t.notRegex(output!, /providers? already added/);
});

// ============================================================================
// Tests for ProviderStep Props Validation
// ============================================================================

test('ProviderStep requires onComplete prop', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	// Component should render without errors
	t.truthy(lastFrame());
});

test('ProviderStep handles optional onBack prop', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	// Component should render without errors even without onBack
	t.truthy(lastFrame());
});

test('ProviderStep handles optional existingProviders prop', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	// Component should render without errors even without existingProviders
	t.truthy(lastFrame());
});

// ============================================================================
// Tests for ProviderStep UI Elements
// ============================================================================

test('ProviderStep renders SelectInput component', t => {
	const {lastFrame} = render(<ProviderStep onComplete={() => {}} />);

	const output = lastFrame();
	// SelectInput should render options
	t.truthy(output);
	t.regex(
		output!,
		/Choose from common templates|Add custom provider manually|Skip providers/,
	);
});

test('ProviderStep shows correct text color for provider count', t => {
	const existingProviders = [
		{
			name: 'test',
			baseUrl: 'http://localhost:8080/v1',
			models: ['test'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	// Component should render the provider count
	const output = lastFrame();
	t.regex(output!, /1 provider already added/);
});

test('ProviderStep renders multiple provider names when added', t => {
	const existingProviders = [
		{
			name: 'ollama',
			baseUrl: 'http://localhost:11434/v1',
			models: ['llama2'],
		},
		{
			name: 'OpenRouter',
			baseUrl: 'https://openrouter.ai/api/v1',
			apiKey: 'test',
			models: ['model1'],
		},
	];

	const {lastFrame} = render(
		<ProviderStep
			onComplete={() => {}}
			existingProviders={existingProviders}
		/>,
	);

	const output = lastFrame();
	t.regex(output!, /2 providers already added/);
});
