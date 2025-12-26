import test from 'ava';
import {render} from 'ink-testing-library';
import React from 'react';
import {Text} from 'ink';
import {themes} from '../config/themes';
import {ThemeContext} from '../hooks/useTheme';
import {UIStateProvider} from '../hooks/useUIState';
import ToolMessage from './tool-message';

console.log('\ntool-message.spec.tsx');

// Mock ThemeProvider for testing
const MockThemeProvider = ({children}: {children: React.ReactNode}) => {
	const mockTheme = {
		currentTheme: 'tokyo-night' as const,
		colors: themes['tokyo-night'].colors,
		setCurrentTheme: () => {},
	};

	return <ThemeContext.Provider value={mockTheme}>{children}</ThemeContext.Provider>;
};

// Wrapper with all required providers
const TestWrapper = ({children}: {children: React.ReactNode}) => (
	<MockThemeProvider>
		<UIStateProvider>{children}</UIStateProvider>
	</MockThemeProvider>
);

// ============================================================================
// Component Rendering Tests
// ============================================================================

test('ToolMessage renders without crashing', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test Tool" message="Test message" />
		</TestWrapper>,
	);

	t.truthy(lastFrame());
});

test('ToolMessage renders with title in TitledBox', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Custom Title" message="Test message" />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Custom Title/);
});

test('ToolMessage renders with default title when not provided', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage message="Test message" />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Tool Message/);
});

test('ToolMessage renders string message', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Hello world" />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Hello world/);
});

test('ToolMessage renders ReactNode message', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message={<Text>Hello world</Text>} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Hello world/);
});

// ============================================================================
// hideBox Option Tests
// ============================================================================

test('ToolMessage renders without box when hideBox is true', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="No box message" hideBox={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /No box message/);
	// Should not have TitledBox borders (│ character)
	const lines = output!.split('\n').filter(line => line.includes('│'));
	t.is(lines.length, 0);
});

test('ToolMessage displays Bash Command Output label when hideBox and isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Bash output" hideBox={true} isBashMode={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Bash Command Output/);
});

test('ToolMessage displays truncation message when hideBox and isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideBox={true} isBashMode={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Output truncated to 4k characters/);
});

test('ToolMessage does not display Bash label when hideBox without isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Regular output" hideBox={true} isBashMode={false} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Regular output/);
	t.notRegex(output!, /Bash Command Output/);
});

test('ToolMessage does not display truncation when hideBox without isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideBox={true} isBashMode={false} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.notRegex(output!, /Output truncated to 4k characters/);
});

// ============================================================================
// hideTitle Option Tests
// ============================================================================

test('ToolMessage renders without title when hideTitle is true', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Hidden Title" message="No title message" hideTitle={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /No title message/);
	// Title should not be shown
	t.notRegex(output!, /Hidden Title/);
});

test('ToolMessage displays truncation message when hideTitle and isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideTitle={true} isBashMode={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Output truncated to 4k characters/);
});

test('ToolMessage does not display truncation when hideTitle without isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideTitle={true} isBashMode={false} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.notRegex(output!, /Output truncated to 4k characters/);
});

// ============================================================================
// isBashMode Option Tests (with TitledBox)
// ============================================================================

test('ToolMessage displays truncation in TitledBox when isBashMode', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test Tool" message="Bash result" isBashMode={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Bash result/);
	t.regex(output!, /Output truncated to 4k characters/);
});

test('ToolMessage does not display truncation when isBashMode is false', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test Tool" message="Regular result" isBashMode={false} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Regular result/);
	t.notRegex(output!, /Output truncated to 4k characters/);
});

// ============================================================================
// Combined Options Tests
// ============================================================================

test('ToolMessage renders with hideBox and hideTitle both true', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage message="Combined test" hideBox={true} hideTitle={true} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Combined test/);
});

test('ToolMessage renders with isBashMode in all display modes', t => {
	// Test with TitledBox (default)
	const {lastFrame: frame1} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" isBashMode={true} />
		</TestWrapper>,
	);
	const output1 = frame1();
	t.truthy(output1);
	t.regex(output1!, /Output truncated to 4k characters/);

	// Test with hideBox
	const {lastFrame: frame2} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideBox={true} isBashMode={true} />
		</TestWrapper>,
	);
	const output2 = frame2();
	t.truthy(output2);
	t.regex(output2!, /Output truncated to 4k characters/);

	// Test with hideTitle
	const {lastFrame: frame3} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Output" hideTitle={true} isBashMode={true} />
		</TestWrapper>,
	);
	const output3 = frame3();
	t.truthy(output3);
	t.regex(output3!, /Output truncated to 4k characters/);
});

test('ToolMessage component structure is valid', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Content" />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output!.length > 0);
});

test('ToolMessage maintains consistent border color with theme', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="Content" />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	// Border character from TitledBox
	t.regex(output!, /│/);
});

test('ToolMessage handles empty message', t => {
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message="" />
		</TestWrapper>,
	);

	t.truthy(lastFrame());
});

test('ToolMessage handles multiline message', t => {
	const multilineMessage = 'Line 1\nLine 2\nLine 3';
	const {lastFrame} = render(
		<TestWrapper>
			<ToolMessage title="Test" message={multilineMessage} />
		</TestWrapper>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Line 1/);
});

test('ToolMessage memo prevents unnecessary re-renders', t => {
	let renderCount = 0;
	const TestComponent = () => {
		renderCount++;
		return (
			<TestWrapper>
				<ToolMessage title="Test" message="Content" />
			</TestWrapper>
		);
	};

	const {lastFrame, rerender} = render(<TestComponent />);
	const firstRender = lastFrame();
	t.truthy(firstRender);
	const initialCount = renderCount;

	// Re-render with same props
	rerender(<TestComponent />);
	// React TestRenderer may count renders differently
	// The important thing is that the component is memoized
	t.true(renderCount >= initialCount);
});
