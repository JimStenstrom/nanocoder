import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import React, {useEffect, useState} from 'react';
import {defaultTheme, getThemeColors} from '@/config/themes';
import {TIMEOUT_VSCODE_EXTENSION_SKIP_MS} from '@/constants';
import {
	installExtension,
	isExtensionInstalled,
	isVSCodeCliAvailable,
} from '@/vscode/extension-installer';

interface VSCodeExtensionPromptProps {
	onComplete: () => void;
	onSkip: () => void;
}

type PromptState =
	| 'checking'
	| 'prompt'
	| 'installing'
	| 'success'
	| 'error'
	| 'no-cli';

enum InstallOption {
	Yes = 'yes',
	No = 'no',
}

/**
 * Ink component that prompts the user to install the VS Code extension
 * when running with --vscode flag and the extension isn't installed
 */
// Compute initial state synchronously
function getInitialState(): PromptState {
	if (isExtensionInstalled()) {
		return 'checking'; // Will trigger onComplete in effect
	}
	if (!isVSCodeCliAvailable()) {
		return 'no-cli';
	}
	return 'prompt';
}

export function VSCodeExtensionPrompt({
	onComplete,
	onSkip,
}: VSCodeExtensionPromptProps) {
	const [state, setState] = useState<PromptState>(getInitialState);
	const [message, setMessage] = useState('');
	const colors = getThemeColors(defaultTheme);

	const handleInstall = React.useCallback(async () => {
		const result = await installExtension();
		if (result.success) {
			setMessage(result.message);
			setState('success');
			// Wait for user to press Enter
		} else {
			setMessage(result.message);
			setState('error');
			// Auto-continue after showing error
			setTimeout(onSkip, TIMEOUT_VSCODE_EXTENSION_SKIP_MS);
		}
	}, [onSkip]);

	// Handle Enter key press in success state
	useInput(
		(_input, key) => {
			if (state === 'success' && key.return) {
				onComplete();
			}
		},
		{isActive: state === 'success'},
	);

	// Handle already-installed case
	useEffect(() => {
		if (isExtensionInstalled()) {
			onComplete();
		}
	}, [onComplete]);

	// Handle no-cli case - auto-skip after showing message
	useEffect(() => {
		if (state === 'no-cli') {
			const timer = setTimeout(onSkip, TIMEOUT_VSCODE_EXTENSION_SKIP_MS);
			return () => clearTimeout(timer);
		}
	}, [state, onSkip]);

	const items: {label: string; value: InstallOption}[] = [
		{
			label: 'Yes, install extension',
			value: InstallOption.Yes,
		},
		{
			label: 'No, skip for now',
			value: InstallOption.No,
		},
	];

	const handleSelect = (item: {label: string; value: InstallOption}) => {
		if (item.value === InstallOption.Yes) {
			setState('installing');
			void handleInstall();
		} else {
			onSkip();
		}
	};

	if (state === 'checking') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.primary}>Checking VS Code extension...</Text>
			</Box>
		);
	}

	if (state === 'no-cli') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.warning}>
					VS Code CLI not found. To enable VS Code integration:
				</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					<Text color={colors.secondary}>1. Open VS Code</Text>
					<Text color={colors.secondary}>
						2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)
					</Text>
					<Text color={colors.secondary}>
						3. Type "Shell Command: Install 'code' command in PATH"
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text color={colors.secondary}>
						Continuing without VS Code integration...
					</Text>
				</Box>
			</Box>
		);
	}

	if (state === 'prompt') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.primary} bold>
					VS Code Extension
				</Text>
				<Box marginTop={1}>
					<Text color={colors.white}>
						The VS Code extension enables live diff previews when Nanocoder
						modifies files.
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text color={colors.white}>Install the extension now?</Text>
				</Box>
				<Box marginTop={1}>
					<SelectInput items={items} onSelect={handleSelect} />
				</Box>
			</Box>
		);
	}

	if (state === 'installing') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.primary}>Installing VS Code extension...</Text>
			</Box>
		);
	}

	if (state === 'success') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.success}>✓ {message}</Text>
				<Box marginTop={1}>
					<Text color={colors.secondary}>Press Enter to continue...</Text>
				</Box>
			</Box>
		);
	}

	if (state === 'error') {
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color={colors.error}>✗ {message}</Text>
				<Text color={colors.secondary}>
					Continuing without VS Code integration...
				</Text>
			</Box>
		);
	}

	return null;
}

/**
 * Check if we should show the extension install prompt
 * Returns true if --vscode flag is present and extension is not installed
 */
export function shouldPromptExtensionInstall(): boolean {
	const hasVSCodeFlag = process.argv.includes('--vscode');
	if (!hasVSCodeFlag) return false;

	// Don't prompt if extension is already installed
	if (isExtensionInstalled()) return false;

	return true;
}
