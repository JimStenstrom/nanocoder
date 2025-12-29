import {Box, Text} from 'ink';
import {colors} from '@/config/index';
import {useResponsiveTerminal} from '@/hooks/useTerminalWidth';

export interface NavigationHint {
	key: string;
	action: string;
}

export interface NavigationHintsProps {
	hints: NavigationHint[];
}

/**
 * Keyboard navigation hints displayed at the bottom of wizard screens.
 *
 * Automatically adjusts layout based on terminal width:
 * - Narrow: stacked vertically
 * - Wide: inline with pipe separators
 */
export function NavigationHints({hints}: NavigationHintsProps) {
	const {isNarrow} = useResponsiveTerminal();

	if (hints.length === 0) {
		return null;
	}

	if (isNarrow) {
		return (
			<Box flexDirection="column">
				{hints.map(hint => (
					<Text key={hint.key} color={colors.secondary}>
						{hint.key}: {hint.action}
					</Text>
				))}
			</Box>
		);
	}

	return (
		<Box>
			<Text color={colors.secondary}>
				{hints.map((hint, idx) => (
					<Text key={hint.key}>
						{hint.key} to {hint.action}
						{idx < hints.length - 1 ? ' | ' : ''}
					</Text>
				))}
			</Text>
		</Box>
	);
}

// Common hint presets for convenience
export const FIELD_INPUT_HINTS: NavigationHint[] = [
	{key: 'Enter', action: 'continue'},
	{key: 'Shift+Tab', action: 'go back'},
];

export const MULTILINE_INPUT_HINTS: NavigationHint[] = [
	{key: 'Esc', action: 'submit'},
	{key: 'Shift+Tab', action: 'go back'},
];

export const SELECTION_HINTS: NavigationHint[] = [
	{key: 'Enter', action: 'select'},
	{key: 'Shift+Tab', action: 'go back'},
];

export const MODEL_SELECTION_HINTS: NavigationHint[] = [
	{key: 'Enter', action: 'toggle/continue'},
	{key: 'Shift+Tab', action: 'go back'},
];

export const TAB_NAVIGATION_HINTS: NavigationHint[] = [
	{key: 'Arrow keys', action: 'Navigate'},
	{key: 'Tab', action: 'Switch tabs'},
	{key: 'Shift+Tab', action: 'Go back'},
];
