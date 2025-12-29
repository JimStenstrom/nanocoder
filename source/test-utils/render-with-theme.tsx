import {render} from 'ink-testing-library';
import React from 'react';
import {ThemeContext} from '@/hooks/useTheme';
import type {Colors, ThemePreset} from '@/types/ui';

// Default test colors that match the structure used in the app
const testColors: Colors = {
	primary: 'blue',
	secondary: 'gray',
	white: 'white',
	black: 'black',
	info: 'cyan',
	warning: 'yellow',
	error: 'red',
	success: 'green',
	tool: 'magenta',
	diffAdded: 'green',
	diffRemoved: 'red',
	diffAddedText: 'white',
	diffRemovedText: 'white',
};

// Test theme context value
const testThemeContext = {
	currentTheme: 'tokyo-night' as ThemePreset,
	colors: testColors,
	setCurrentTheme: () => {},
};

/**
 * Wrapper component that provides ThemeContext for tests
 */
function TestThemeProvider({children}: {children: React.ReactNode}) {
	return (
		<ThemeContext.Provider value={testThemeContext}>
			{children}
		</ThemeContext.Provider>
	);
}

/**
 * Render a component wrapped with ThemeContext for testing
 */
export function renderWithTheme(
	element: React.ReactElement,
): ReturnType<typeof render> {
	return render(<TestThemeProvider>{element}</TestThemeProvider>);
}
