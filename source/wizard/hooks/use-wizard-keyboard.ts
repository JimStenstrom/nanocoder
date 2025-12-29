import {useInput} from 'ink';

export interface UseWizardKeyboardOptions {
	onEnter?: () => void;
	onEscape?: () => void;
	onShiftTab?: () => void;
	onTab?: () => void;
	enabled?: boolean;
}

/**
 * Hook to standardize keyboard handling across wizard steps.
 *
 * Handles common wizard keyboard patterns:
 * - Enter: submit/continue
 * - Escape: cancel/go back
 * - Shift+Tab: navigate backwards
 * - Tab: navigate forwards (if enabled)
 */
export function useWizardKeyboard({
	onEnter,
	onEscape,
	onShiftTab,
	onTab,
	enabled = true,
}: UseWizardKeyboardOptions): void {
	useInput(
		(_input, key) => {
			if (!enabled) return;

			// Handle Shift+Tab first (must check before Tab)
			if (key.shift && key.tab) {
				onShiftTab?.();
				return;
			}

			// Handle Tab (without Shift)
			if (key.tab && !key.shift) {
				onTab?.();
				return;
			}

			// Handle Enter
			if (key.return) {
				onEnter?.();
				return;
			}

			// Handle Escape
			if (key.escape) {
				onEscape?.();
				return;
			}
		},
		{isActive: enabled},
	);
}
