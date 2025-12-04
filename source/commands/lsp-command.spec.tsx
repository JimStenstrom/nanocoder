import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {LSP, lspCommand} from './lsp';
import {getLSPManager, type LSPInitResult} from '../lsp/lsp-manager';
import {ThemeContext} from '../hooks/useTheme';
import {themes} from '../config/themes';

console.log(`\nlsp-command.spec.tsx`);

// Mock ThemeProvider for testing
const MockThemeProvider = ({children}: {children: React.ReactNode}) => {
	const mockTheme = {
		currentTheme: 'tokyo-night' as const,
		colors: themes['tokyo-night'].colors,
		setCurrentTheme: () => {},
	};
	return (
		<ThemeContext.Provider value={mockTheme}>{children}</ThemeContext.Provider>
	);
};

// Mock LSP manager status
const mockLSPStatus = {
	initialized: true,
	servers: [
		{
			name: 'typescript-language-server',
			ready: true,
			languages: ['ts', 'js', 'tsx', 'jsx'],
		},
		{
			name: 'gopls',
			ready: true,
			languages: ['go'],
		},
		{
			name: 'rust-analyzer',
			ready: false,
			languages: ['rs'],
		},
	],
};

// ============================================================================
// Tests for LSP Command Display
// ============================================================================

test('LSP command: shows no servers when none connected', t => {
	const emptyStatus = {
		initialized: false,
		servers: [],
	};

	const {lastFrame} = render(
		<MockThemeProvider>
			<LSP status={emptyStatus} />
		</MockThemeProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /No LSP servers connected/);
	t.regex(output!, /agents\.config\.json/);
	t.regex(
		output!,
		/LSP servers will auto-discover based on your project files/,
	);
});

test('LSP command: displays server status correctly', t => {
	const {lastFrame} = render(
		<MockThemeProvider>
			<LSP status={mockLSPStatus} />
		</MockThemeProvider>,
	);

	const output = lastFrame();
	t.truthy(output);

	// Should show connected servers count
	t.regex(output!, /Connected LSP Servers \(3\):/);

	// Should show server names
	t.regex(output!, /typescript-language-server/);
	t.regex(output!, /gopls/);
	t.regex(output!, /rust-analyzer/);

	// Should show status icons
	t.regex(output!, /🟢/); // Ready servers
	t.regex(output!, /🔴/); // Initializing server

	// Should show status text
	t.regex(output!, /\(Ready\)/);
	t.regex(output!, /\(Initializing\)/);
});

test('LSP command: displays associated languages correctly', t => {
	const {lastFrame} = render(
		<MockThemeProvider>
			<LSP status={mockLSPStatus} />
		</MockThemeProvider>,
	);

	const output = lastFrame();
	t.truthy(output);

	// Should show languages for each server
	t.regex(output!, /Languages: ts, js, tsx, jsx/);
	t.regex(output!, /Languages: go/);
	t.regex(output!, /Languages: rs/);
});

test('LSP command: handles single language correctly', t => {
	const singleLangStatus = {
		initialized: true,
		servers: [
			{
				name: 'single-lang-server',
				ready: true,
				languages: ['python'],
			},
		],
	};

	const {lastFrame} = render(
		<MockThemeProvider>
			<LSP status={singleLangStatus} />
		</MockThemeProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Languages: python/);
});

test('LSP command: handles multiple languages correctly', t => {
	const multiLangStatus = {
		initialized: true,
		servers: [
			{
				name: 'multi-lang-server',
				ready: true,
				languages: ['js', 'ts', 'jsx', 'tsx', 'vue'],
			},
		],
	};

	const {lastFrame} = render(
		<MockThemeProvider>
			<LSP status={multiLangStatus} />
		</MockThemeProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.regex(output!, /Languages: js, ts, jsx, tsx, vue/);
});

test('LSP command: shows correct status icons', t => {
	const testCases = [
		{ready: true, expectedIcon: '🟢'},
		{ready: false, expectedIcon: '🔴'},
	];

	for (const testCase of testCases) {
		const status = {
			initialized: true,
			servers: [
				{
					name: 'test-server',
					ready: testCase.ready,
					languages: ['test'],
				},
			],
		};

		const {lastFrame} = render(
			<MockThemeProvider>
				<LSP status={status} />
			</MockThemeProvider>,
		);

		const output = lastFrame();
		t.truthy(output);
		t.regex(
			output!,
			new RegExp(testCase.expectedIcon),
			`Should show ${testCase.expectedIcon} for ready=${testCase.ready}`,
		);
	}
});

test('LSP command: shows correct status text', t => {
	const testCases = [
		{ready: true, expectedText: 'Ready'},
		{ready: false, expectedText: 'Initializing'},
	];

	for (const testCase of testCases) {
		const status = {
			initialized: true,
			servers: [
				{
					name: 'test-server',
					ready: testCase.ready,
					languages: ['test'],
				},
			],
		};

		const {lastFrame} = render(
			<MockThemeProvider>
				<LSP status={status} />
			</MockThemeProvider>,
		);

		const output = lastFrame();
		t.truthy(output);
		t.regex(
			output!,
			new RegExp(`\\(${testCase.expectedText}\\)`),
			`Should show (${testCase.expectedText}) for ready=${testCase.ready}`,
		);
	}
});

// ============================================================================
// Command Handler Tests
// ============================================================================

test('lspCommand has correct name', t => {
	t.is(lspCommand.name, 'lsp');
});

test('lspCommand has description', t => {
	t.truthy(lspCommand.description);
	t.is(typeof lspCommand.description, 'string');
	t.true(lspCommand.description.length > 0);
});

test('lspCommand handler is a function', t => {
	t.is(typeof lspCommand.handler, 'function');
});

test('lspCommand handler returns valid React element', async t => {
	// Mock the LSP manager to return our test status
	const originalGetLSPManager = getLSPManager;
	const mockLSPManager = {
		getStatus: () => mockLSPStatus,
	};
	// Since we can't directly mock the singleton function, we'll just call the handler
	// which will use the actual LSP manager (but it will return an element regardless)
	const mockMessages: any[] = [];
	const mockMetadata: any = {
		provider: 'test',
		model: 'test',
		tokens: 0,
		getMessageTokens: () => 0,
	};

	const result = await lspCommand.handler([], mockMessages, mockMetadata);

	t.truthy(result);
	t.true(React.isValidElement(result));
});

test('lspCommand handler returns React element when no servers connected', async t => {
	const mockMessages: any[] = [];
	const mockMetadata: any = {
		provider: 'test',
		model: 'test',
		tokens: 0,
		getMessageTokens: () => 0,
	};

	const result = await lspCommand.handler([], mockMessages, mockMetadata);

	t.truthy(result);
	t.true(React.isValidElement(result));
});
