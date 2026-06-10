import {Box, Text, useFocus, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {commandRegistry} from '@/commands';
import {DevelopmentModeIndicator} from '@/components/development-mode-indicator';
import TextInput from '@/components/text-input';
import {MAX_IMAGE_ATTACHMENTS_PER_MESSAGE} from '@/constants';
import {useInputState} from '@/hooks/useInputState';
import {useResponsiveTerminal} from '@/hooks/useTerminalWidth';
import {useTheme} from '@/hooks/useTheme';
import {useUIStateContext} from '@/hooks/useUIState';
import {promptHistory} from '@/prompt-history';
import type {TuneConfig} from '@/types/config';
import type {
	ContextSource,
	DevelopmentMode,
	ImageAttachment,
} from '@/types/core';
import type {InputState} from '@/types/hooks';
import {Completion} from '@/types/index';
import {captureClipboardImage} from '@/utils/clipboard-image';
import {
	getCurrentFileMention,
	getFileCompletions,
} from '@/utils/file-autocomplete';
import {handleFileMention} from '@/utils/file-mention-handler';
import {
	addImagePlaceholder,
	collectImageAttachments,
	detectTrailingImagePathToken,
	validateImageFile,
} from '@/utils/image-attachments';
import {assemblePrompt} from '@/utils/prompt-processor';
import type {ActiveEditorState} from '@/vscode/vscode-server';

interface ChatProps {
	onSubmit?: (
		message: string,
		displayValue: string,
		images?: ImageAttachment[],
	) => void;
	placeholder?: string;
	customCommands?: string[]; // List of custom command names and aliases
	disabled?: boolean; // Disable input when AI is processing
	isBusy?: boolean; // True when in-flight work is cancellable; Escape is owned by the global handler, so it must not clear the input
	onToggleMode?: () => void; // Callback when user presses shift+tab to toggle development mode
	onToggleReasoningExpanded?: () => void; // Callback when user presses ctrl+r to toggle expanded reasoning traces
	onToggleCompactDisplay?: () => void; // Callback when user presses ctrl+o to toggle compact tool display
	compactToolDisplay?: boolean; // Current compact display state
	developmentMode?: DevelopmentMode; // Current development mode
	contextPercentUsed?: number | null; // Context window usage percentage
	contextSource?: ContextSource | null; // Whether ctx % is API-reported or estimated
	sessionName?: string; // Optional session name for display
	tune?: TuneConfig; // Model mode configuration
	currentModel?: string; // Active model id — resolves the 'auto' tune profile for display
	activeEditor?: ActiveEditorState | null; // VS Code active file + optional selection
	onDismissActiveEditor?: () => void; // Dismiss the active editor pill on clear/escape
}

export default function UserInput({
	onSubmit,
	placeholder,
	customCommands = [],
	disabled = false,
	isBusy = false,
	onToggleMode,
	onToggleReasoningExpanded,
	onToggleCompactDisplay,
	compactToolDisplay = true,
	developmentMode = 'normal',
	contextPercentUsed,
	contextSource,
	sessionName,
	tune,
	currentModel,
	activeEditor,
	onDismissActiveEditor,
}: ChatProps) {
	const {isFocused, focus} = useFocus({autoFocus: !disabled, id: 'user-input'});
	const {colors} = useTheme();
	const inputState = useInputState();
	const uiState = useUIStateContext();
	const {boxWidth, isNarrow} = useResponsiveTerminal();
	const [textInputKey, setTextInputKey] = useState(0);
	// Store the full InputState draft when starting history navigation, so it can be restored
	const savedDraftRef = useRef<InputState>({
		displayValue: '',
		placeholderContent: {},
	});
	// File autocomplete state
	const [isFileAutocompleteMode, setIsFileAutocompleteMode] = useState(false);
	const [fileCompletions, setFileCompletions] = useState<
		Array<{path: string; score: number}>
	>([]);
	const [selectedFileIndex, setSelectedFileIndex] = useState(0);
	// Transient image-attachment status shown under the input (cleared on the
	// next keystroke). Used for clipboard/attach failures and skip warnings.
	const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
	// Guards against double-submit (Enter during the async attachment read)
	// and overlapping clipboard captures.
	const isSubmittingRef = useRef(false);
	const isCapturingClipboardRef = useRef(false);
	// Previous input length, to tell paste/drag insertions (multi-char jumps)
	// from single keystrokes for image-path auto-attachment.
	const prevInputLengthRef = useRef(0);

	const {
		input,
		historyIndex,
		setOriginalInput,
		setHistoryIndex,
		updateInput,
		resetInput,
		deletePlaceholder: _deletePlaceholder,
		currentState,
		setInputState,
	} = inputState;

	const {
		showClearMessage,
		showCompletions,
		completions,
		pendingFileMentions,
		setShowClearMessage,
		setShowCompletions,
		setCompletions,
		setPendingFileMentions,
		resetUIState,
	} = uiState;

	// Check if we're in bash mode (input starts with !)
	const isBashMode = input.trim().startsWith('!');

	// Check if we're in command mode (input starts with /)
	const isCommandMode = input.trim().startsWith('/');

	// Load history on mount
	useEffect(() => {
		void promptHistory.loadHistory();
	}, []);

	// Consume pending file mentions from explorer and insert into input
	// Properly attach files by calling handleFileMention for each
	useEffect(() => {
		if (pendingFileMentions.length === 0) return;

		const attachFiles = async () => {
			let state = currentState;
			let displayValue = state.displayValue;

			for (const filePath of pendingFileMentions) {
				// Create a temporary mention text to replace
				const mentionText = `@${filePath}`;
				// Add the mention to display value first
				displayValue = displayValue
					? `${displayValue} ${mentionText}`
					: mentionText;

				// Handle the file mention to create placeholder
				const result = await handleFileMention(
					filePath,
					displayValue,
					state.placeholderContent,
					mentionText,
				);

				if (result) {
					state = result;
					displayValue = result.displayValue;
				}
			}

			setInputState(state);
			setTextInputKey(prev => prev + 1);
			setPendingFileMentions([]);
		};

		void attachFiles();
	}, [
		pendingFileMentions,
		currentState,
		setInputState,
		setPendingFileMentions,
	]);

	// Trigger file autocomplete when input changes
	useEffect(() => {
		const runFileAutocomplete = async () => {
			const mention = getCurrentFileMention(input, input.length);

			if (mention) {
				setIsFileAutocompleteMode(true);
				const cwd = process.cwd();
				const completions = await getFileCompletions(mention.mention, cwd);
				setFileCompletions(completions);
				setSelectedFileIndex(0); // Reset selection when completions change
			} else {
				setIsFileAutocompleteMode(false);
				setFileCompletions([]);
				setSelectedFileIndex(0);
			}
		};

		void runFileAutocomplete();
	}, [input]);

	// Auto-attach an image when the input ends with an existing image file
	// path. Drag-and-drop and paste insert the path as a multi-char chunk;
	// typed paths attach once followed by whitespace (or on submit, below).
	// The path token is replaced with a compact "[Image #N: name.png]"
	// indicator backed by an IMAGE placeholder.
	useEffect(() => {
		const previousLength = prevInputLengthRef.current;
		prevInputLengthRef.current = input.length;

		const isMultiCharInsertion = input.length - previousLength > 1;
		const endsWithWhitespace = /\s$/.test(input);
		if (!isMultiCharInsertion && !endsWithWhitespace) return;

		const token = detectTrailingImagePathToken(input);
		if (!token) return;

		let cancelled = false;
		const attach = async () => {
			const validated = await validateImageFile(token.filePath);
			// Drop the result if the input moved on or a submit is in flight
			// (the submit path does its own late attach of trailing tokens) —
			// otherwise this could resurrect the input box after it was reset.
			if (cancelled || isSubmittingRef.current) return;
			if (!validated.ok) {
				// A nonexistent path is just text the user wrote; only surface
				// failures where the file clearly exists but cannot attach.
				if (validated.reason === 'too-large') {
					setAttachmentNotice(validated.message);
				}
				return;
			}
			const next = addImagePlaceholder(currentState, validated, token.raw);
			if (!next) {
				setAttachmentNotice(
					`Too many images (max ${MAX_IMAGE_ATTACHMENTS_PER_MESSAGE} per message)`,
				);
				return;
			}
			setInputState(next);
			setTextInputKey(prev => prev + 1);
			setAttachmentNotice(null);
		};
		void attach();
		return () => {
			cancelled = true;
		};
	}, [input, currentState, setInputState]);

	// Attach an image from the OS clipboard (Ctrl+V). The clipboard bitmap is
	// written to a temp PNG and attached like a dropped file.
	const handleClipboardAttach = useCallback(async () => {
		if (isCapturingClipboardRef.current) return;
		isCapturingClipboardRef.current = true;
		try {
			const result = await captureClipboardImage();
			if (!result.ok) {
				setAttachmentNotice(result.message);
				return;
			}
			const validated = await validateImageFile(result.filePath);
			if (!validated.ok) {
				setAttachmentNotice(validated.message);
				return;
			}
			const next = addImagePlaceholder(currentState, validated, null);
			if (!next) {
				setAttachmentNotice(
					`Too many images (max ${MAX_IMAGE_ATTACHMENTS_PER_MESSAGE} per message)`,
				);
				return;
			}
			setInputState(next);
			setTextInputKey(prev => prev + 1);
			setAttachmentNotice(null);
		} finally {
			isCapturingClipboardRef.current = false;
		}
	}, [currentState, setInputState]);

	// Calculate command completions using useMemo to prevent flashing
	const commandCompletions = useMemo(() => {
		if (!isCommandMode || isFileAutocompleteMode) {
			return [];
		}

		const commandPrefix = input.slice(1).split(' ')[0];

		const builtInCompletions = commandRegistry.getCompletions(commandPrefix);
		const customCompletions = customCommands
			.filter(cmd => {
				// Include all when no prefix, otherwise filter by prefix
				return (
					!commandPrefix ||
					cmd.toLowerCase().includes(commandPrefix.toLowerCase())
				);
			})
			.sort((a, b) => a.localeCompare(b));

		return [
			...builtInCompletions.map(cmd => ({name: cmd, isCustom: false})),
			...customCompletions.map(cmd => ({name: cmd, isCustom: true})),
		] as Completion[];
	}, [input, isCommandMode, isFileAutocompleteMode, customCommands]);

	// Update UI state for command completions
	useEffect(() => {
		if (commandCompletions.length > 0) {
			setCompletions(commandCompletions);
			setShowCompletions(true);
		} else if (showCompletions) {
			setCompletions([]);
			setShowCompletions(false);
		}
	}, [commandCompletions, showCompletions, setCompletions, setShowCompletions]);

	// Helper functions

	// Handle file mention selection (Tab key in file autocomplete mode)
	const handleFileSelection = useCallback(async () => {
		if (!isFileAutocompleteMode || fileCompletions.length === 0) {
			return false;
		}

		const mention = getCurrentFileMention(input, input.length);
		if (!mention) {
			return false;
		}

		// Select the currently highlighted file
		const selectedPath = fileCompletions[selectedFileIndex]?.path;
		if (!selectedPath) {
			return false;
		}

		// Extract the original mention text (the @... part we're replacing)
		const mentionText = input.substring(mention.startIndex, mention.endIndex);

		// Handle the file mention to create placeholder
		const result = await handleFileMention(
			selectedPath,
			currentState.displayValue,
			currentState.placeholderContent,
			mentionText,
		);

		if (result) {
			setInputState(result);
			setIsFileAutocompleteMode(false);
			setFileCompletions([]);
			setSelectedFileIndex(0);
			setTextInputKey(prev => prev + 1);
			return true;
		}

		return false;
	}, [
		isFileAutocompleteMode,
		fileCompletions,
		selectedFileIndex,
		input,
		currentState,
		setInputState,
	]);

	// Handle form submission
	const handleSubmit = useCallback(() => {
		if (!input.trim() || !onSubmit || isSubmittingRef.current) {
			return;
		}
		isSubmittingRef.current = true;

		const submit = async () => {
			// Late attachment: a typed-out image path with no trailing
			// whitespace only becomes an attachment when Enter is pressed.
			let state = currentState;
			const token = detectTrailingImagePathToken(state.displayValue);
			if (token) {
				const validated = await validateImageFile(token.filePath);
				if (validated.ok) {
					state = addImagePlaceholder(state, validated, token.raw) ?? state;
				}
			}

			// Read the attached images (placeholders still present in the
			// input) from disk; vanished/oversized files are skipped with a
			// notice rather than blocking the message.
			const {attachments, warnings} = await collectImageAttachments(state);
			if (warnings.length > 0) {
				setAttachmentNotice(warnings.join(' · '));
			}

			// Assemble the full prompt by replacing placeholders with content
			const fullMessage = assemblePrompt(state);

			// Save the InputState to history and send assembled message to AI
			promptHistory.addPrompt(state);
			onSubmit(
				fullMessage,
				state.displayValue,
				attachments.length > 0 ? attachments : undefined,
			);
			resetInput();
			resetUIState();
			promptHistory.resetIndex();
		};

		void submit()
			.catch(() => {
				// Defensive: a failed attachment read must never crash the app;
				// the message simply isn't sent and the input stays intact.
				setAttachmentNotice('Failed to read image attachments — not sent');
			})
			.finally(() => {
				isSubmittingRef.current = false;
			});
	}, [input, onSubmit, resetInput, resetUIState, currentState]);

	// Handle escape key logic
	const handleEscape = useCallback(() => {
		if (showClearMessage) {
			resetInput();
			resetUIState();
			setAttachmentNotice(null);
			onDismissActiveEditor?.();
			focus('user-input');
		} else {
			setShowClearMessage(true);
		}
	}, [
		showClearMessage,
		resetInput,
		resetUIState,
		onDismissActiveEditor,
		setShowClearMessage,
		focus,
	]);

	// History navigation
	const handleHistoryNavigation = useCallback(
		(direction: 'up' | 'down') => {
			const history = promptHistory.getHistory();
			if (history.length === 0) return;

			if (direction === 'up') {
				if (historyIndex === -1) {
					// Save the full current state before starting navigation
					savedDraftRef.current = currentState;
					setOriginalInput(input);
					setHistoryIndex(history.length - 1);
					setInputState(history[history.length - 1]);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex > 0) {
					const newIndex = historyIndex - 1;
					setHistoryIndex(newIndex);
					setInputState(history[newIndex]);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex === 0) {
					// At first history item, restore saved draft
					setHistoryIndex(-2);
					setInputState(savedDraftRef.current);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex === -2) {
					// At draft, cycle back to last history item
					savedDraftRef.current = currentState;
					setHistoryIndex(history.length - 1);
					setInputState(history[history.length - 1]);
					setTextInputKey(prev => prev + 1);
				}
			} else {
				if (historyIndex === -1) {
					// Save draft, go to draft cycling state (visually a no-op)
					savedDraftRef.current = currentState;
					setOriginalInput(input);
					setHistoryIndex(-2);
					setInputState(savedDraftRef.current);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex === -2) {
					// At draft, cycle to first history item
					savedDraftRef.current = currentState;
					setHistoryIndex(0);
					setInputState(history[0]);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex >= 0 && historyIndex < history.length - 1) {
					// Move forward in history
					const newIndex = historyIndex + 1;
					setHistoryIndex(newIndex);
					setInputState(history[newIndex]);
					setTextInputKey(prev => prev + 1);
				} else if (historyIndex === history.length - 1) {
					// At last history item, restore saved draft
					setHistoryIndex(-2);
					setInputState(savedDraftRef.current);
					setTextInputKey(prev => prev + 1);
				}
			}
		},
		[
			historyIndex,
			input,
			currentState,
			setHistoryIndex,
			setOriginalInput,
			setInputState,
		],
	);

	useInput((inputChar, key) => {
		// Cancelling in-flight work is owned by the single section-level Escape
		// handler (see InteractiveApp), which fires no matter which component is
		// mounted. Here we only swallow Escape while busy so it doesn't fall
		// through to the clear-input double-press.
		if (key.escape && (isBusy || disabled)) {
			return;
		}

		// Handle shift+tab to toggle development mode (always available)
		if (key.tab && key.shift && onToggleMode) {
			onToggleMode();
			return;
		}

		// Handle ctrl+o to toggle compact tool display (always available)
		if (key.ctrl && inputChar === 'o' && onToggleCompactDisplay) {
			onToggleCompactDisplay();
			return;
		}

		// Handle ctrl+r to toggle expanded reasoning traces (always available)
		if (key.ctrl && inputChar === 'r' && onToggleReasoningExpanded) {
			onToggleReasoningExpanded();
			return;
		}

		// Block all other input when disabled
		if (disabled) {
			return;
		}

		// Handle ctrl+v to attach an image from the OS clipboard. Terminal
		// text paste arrives via the terminal's own paste shortcut (Cmd+V /
		// Ctrl+Shift+V), so the raw Ctrl+V byte is free to claim here.
		if (key.ctrl && inputChar === 'v') {
			void handleClipboardAttach();
			return;
		}

		// Handle special keys
		if (key.escape) {
			handleEscape();
			return;
		}

		// Handle Tab key
		if (key.tab) {
			// File autocomplete takes priority
			if (isFileAutocompleteMode) {
				void handleFileSelection();
				return;
			}

			// Command completion - use pre-calculated commandCompletions
			if (input.startsWith('/')) {
				if (commandCompletions.length === 1) {
					// Auto-complete when there's exactly one match
					const completion = commandCompletions[0];
					const completedText = `/${completion.name}`;
					// Use setInputState to bypass paste detection for autocomplete
					setInputState({
						displayValue: completedText,
						placeholderContent: currentState.placeholderContent,
					});
					setTextInputKey(prev => prev + 1);
				} else if (commandCompletions.length > 1) {
					// If completions are already showing, autocomplete to the first result
					if (showCompletions && completions.length > 0) {
						const completion = completions[0];
						const completedText = `/${completion.name}`;
						// Use setInputState to bypass paste detection for autocomplete
						setInputState({
							displayValue: completedText,
							placeholderContent: currentState.placeholderContent,
						});
						setShowCompletions(false);
						setTextInputKey(prev => prev + 1);
					} else {
						// Show completions when there are multiple matches
						setCompletions(commandCompletions);
						setShowCompletions(true);
					}
				}
				return;
			}
		}

		// Space exits file autocomplete mode
		if (inputChar === ' ' && isFileAutocompleteMode) {
			setIsFileAutocompleteMode(false);
			setFileCompletions([]);
		}

		// Clear clear message on other input
		if (showClearMessage) {
			setShowClearMessage(false);
			focus('user-input');
		}

		// Clear transient attachment notices once the user keeps typing
		if (attachmentNotice) {
			setAttachmentNotice(null);
		}

		// Handle return keys for multiline input
		// Ctrl+J is the official newline shortcut and reliably sends a literal LF
		if (
			(key.ctrl && inputChar === 'j') ||
			(inputChar === '\n' && !key.return)
		) {
			updateInput(input + '\n');
			return;
		}

		// Support Shift+Enter if the terminal sends it properly
		if (key.return && key.shift) {
			updateInput(input + '\n');
			return;
		}

		// Handle navigation
		if (key.upArrow) {
			// File autocomplete navigation takes priority
			if (isFileAutocompleteMode && fileCompletions.length > 0) {
				setSelectedFileIndex(prev =>
					prev > 0 ? prev - 1 : fileCompletions.length - 1,
				);
				return;
			}
			handleHistoryNavigation('up');
			return;
		}

		if (key.downArrow) {
			// File autocomplete navigation takes priority
			if (isFileAutocompleteMode && fileCompletions.length > 0) {
				setSelectedFileIndex(prev =>
					prev < fileCompletions.length - 1 ? prev + 1 : 0,
				);
				return;
			}
			handleHistoryNavigation('down');
			return;
		}
	});

	const textColor = disabled || !input ? colors.secondary : colors.primary;

	// When disabled, show minimal UI to avoid cluttering the screen
	if (disabled) {
		return (
			<Box flexDirection="column" paddingY={1} width="100%" marginTop={1}>
				<Text color={colors.secondary}>
					<Spinner type="dots" /> Press Esc to cancel
					{onToggleCompactDisplay && (
						<Text>
							{' '}
							· ctrl-o {compactToolDisplay ? 'expand' : 'compact'}{' '}
							{isNarrow ? '' : 'tool results'}
						</Text>
					)}
				</Text>
				<DevelopmentModeIndicator
					developmentMode={developmentMode}
					colors={colors}
					contextPercentUsed={contextPercentUsed ?? null}
					contextSource={contextSource ?? null}
					sessionName={sessionName}
					tune={tune}
					currentModel={currentModel}
				/>
			</Box>
		);
	}

	return (
		<>
			{!isBashMode ? (
				<Text color={colors.primary} bold>
					What would you like me to help with?
				</Text>
			) : (
				<Text color={colors.tool} bold>
					Bash mode
				</Text>
			)}
			<Box
				flexDirection="column"
				marginTop={1}
				backgroundColor={colors.base}
				width={boxWidth}
				padding={1}
				borderStyle="bold"
				borderLeft={true}
				borderRight={false}
				borderTop={false}
				borderBottom={false}
				borderLeftColor={isBashMode ? colors.tool : colors.primary}
			>
				{/* Input row */}
				<Box>
					{input.length === 0 && (
						<Text color={isBashMode ? colors.tool : textColor}>{'>'} </Text>
					)}
					<TextInput
						key={textInputKey}
						value={input}
						onChange={updateInput}
						onSubmit={handleSubmit}
						placeholder="/ commands, ! bash, ↑/↓ history"
						focus={isFocused}
						wrapWidth={boxWidth - 3}
					/>
				</Box>

				{showClearMessage && (
					<Text color={colors.secondary}>Press escape again to clear</Text>
				)}

				{attachmentNotice && (
					<Text color={colors.warning}>{attachmentNotice}</Text>
				)}
			</Box>

			{showCompletions && completions.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color={colors.secondary}>Available commands:</Text>
					{completions.map((completion, index) => (
						<Text
							key={index}
							color={completion.isCustom ? colors.info : colors.primary}
						>
							/{completion.name}
						</Text>
					))}
				</Box>
			)}
			{isFileAutocompleteMode && fileCompletions.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color={colors.secondary}>
						File suggestions (↑/↓ to navigate, Tab to select):
					</Text>
					{fileCompletions.slice(0, 5).map((file, index) => (
						<Text
							key={index}
							color={index === selectedFileIndex ? colors.info : colors.primary}
							bold={index === selectedFileIndex}
						>
							{index === selectedFileIndex ? '▸ ' : '  '}
							{file.path}
						</Text>
					))}
				</Box>
			)}

			{/* Development mode indicator - always visible */}
			<DevelopmentModeIndicator
				developmentMode={developmentMode}
				colors={colors}
				contextPercentUsed={contextPercentUsed ?? null}
				contextSource={contextSource ?? null}
				sessionName={sessionName}
				tune={tune}
				currentModel={currentModel}
				activeEditor={activeEditor}
			/>
		</>
	);
}
