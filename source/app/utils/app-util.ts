import {parseInput} from '@/command-parser';
import {commandRegistry} from '@/commands';
import {
	ErrorMessage,
	InfoMessage,
	SuccessMessage,
	WarningMessage,
} from '@/components/message-box';
import ToolMessage from '@/components/tool-message';
import {
	DELAY_COMMAND_COMPLETE_MS,
	TRUNCATION_RESULT_STRING_LENGTH,
} from '@/constants';
import {CheckpointManager} from '@/services/checkpoint-manager';
import {generateKey, sessionManager, sessionService} from '@/session';
import {toolRegistry} from '@/tools/index';
import type {LLMClient} from '@/types/core';
import type {Message, MessageSubmissionOptions} from '@/types/index';
import React from 'react';

/** Command names that require special handling in the app */
const SPECIAL_COMMANDS = {
	CLEAR: 'clear',
	MODEL: 'model',
	PROVIDER: 'provider',
	THEME: 'theme',
	MODEL_DATABASE: 'model-database',
	SETUP_CONFIG: 'setup-config',
	STATUS: 'status',
	CHECKPOINT: 'checkpoint',
	RESUME: 'resume',
} as const;

/** Checkpoint subcommands */
const CHECKPOINT_SUBCOMMANDS = {
	LOAD: 'load',
	RESTORE: 'restore',
} as const;

/**
 * Extracts error message from an unknown error
 */
function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
	return error instanceof Error ? error.message : fallback;
}

/**
 * Handles bash commands prefixed with !
 */
async function handleBashCommand(
	bashCommand: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const {
		onAddToChatQueue,
		onCommandComplete,
		getNextComponentKey,
		setMessages,
		messages,
		setIsBashExecuting,
		setCurrentBashCommand,
	} = options;

	// Set bash execution state to show spinner
	setCurrentBashCommand(bashCommand);
	setIsBashExecuting(true);

	try {
		// Execute the bash command
		const resultString = await toolRegistry.execute_bash({
			command: bashCommand,
		});

		// Parse the result
		let result: {fullOutput: string; llmContext: string};
		try {
			result = JSON.parse(resultString) as {
				fullOutput: string;
				llmContext: string;
			};
		} catch {
			// If parsing fails, treat as plain string
			result = {
				fullOutput: resultString,
				llmContext:
					resultString.length > TRUNCATION_RESULT_STRING_LENGTH
						? resultString.substring(0, TRUNCATION_RESULT_STRING_LENGTH)
						: resultString,
			};
		}

		// Create a proper display of the command and its full output
		const commandOutput = `$ ${bashCommand}
${result.fullOutput || '(No output)'}`;

		// Add the command and its output to the chat queue
		onAddToChatQueue(
			React.createElement(ToolMessage, {
				key: `bash-result-${getNextComponentKey()}`,
				message: commandOutput,
				hideBox: true,
				isBashMode: true,
			}),
		);

		// Add the truncated output to the LLM context for future interactions
		if (result.llmContext) {
			const userMessage: Message = {
				role: 'user',
				content: `Bash command output:\n\`\`\`\n$ ${bashCommand}\n${result.llmContext}\n\`\`\``,
			};
			setMessages([...messages, userMessage]);
		}
	} catch (error: unknown) {
		// Show error message if command fails
		onAddToChatQueue(
			React.createElement(ErrorMessage, {
				key: `bash-error-${getNextComponentKey()}`,
				message: `Error executing command: ${getErrorMessage(error, String(error))}`,
			}),
		);
	} finally {
		// Clear bash execution state
		setIsBashExecuting(false);
		setCurrentBashCommand('');

		// Signal completion for non-interactive mode
		onCommandComplete?.();
	}
}

/**
 * Handles custom user-defined commands
 * Returns true if a custom command was found and handled
 */
async function handleCustomCommand(
	message: string,
	commandName: string,
	options: MessageSubmissionOptions,
): Promise<boolean> {
	const {
		customCommandCache,
		customCommandLoader,
		customCommandExecutor,
		onHandleChatMessage,
		onCommandComplete,
	} = options;

	const customCommand =
		customCommandCache.get(commandName) ||
		customCommandLoader?.getCommand(commandName);

	if (!customCommand) {
		return false;
	}

	// Execute custom command with any arguments
	// Slice past '/' + commandName + space to get the arguments
	const args = message
		.slice(commandName.length + 2)
		.trim()
		.split(/\s+/)
		.filter(arg => arg);

	const processedPrompt = customCommandExecutor?.execute(customCommand, args);

	// Send the processed prompt to the AI
	if (processedPrompt) {
		await onHandleChatMessage(processedPrompt);
	} else {
		// Custom command didn't generate a prompt, signal completion
		onCommandComplete?.();
	}

	return true;
}

/**
 * Handles special commands that need app state access (/clear, /model, etc.)
 * Returns true if a special command was handled
 */
async function handleSpecialCommand(
	commandName: string,
	options: MessageSubmissionOptions,
): Promise<boolean> {
	const {
		onClearMessages,
		onEnterModelSelectionMode,
		onEnterProviderSelectionMode,
		onEnterThemeSelectionMode,
		onEnterModelDatabaseMode,
		onEnterConfigWizardMode,
		onShowStatus,
		onCommandComplete,
	} = options;

	switch (commandName) {
		case SPECIAL_COMMANDS.CLEAR:
			await onClearMessages();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.MODEL:
			onEnterModelSelectionMode();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.PROVIDER:
			onEnterProviderSelectionMode();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.THEME:
			onEnterThemeSelectionMode();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.MODEL_DATABASE:
			onEnterModelDatabaseMode();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.SETUP_CONFIG:
			onEnterConfigWizardMode();
			onCommandComplete?.();
			return true;

		case SPECIAL_COMMANDS.STATUS:
			onShowStatus();
			// Status adds to queue synchronously, give React time to render
			setTimeout(() => onCommandComplete?.(), DELAY_COMMAND_COMPLETE_MS);
			return true;

		default:
			return false;
	}
}

/**
 * Handles interactive checkpoint load command
 * Returns true if checkpoint load was handled
 */
async function handleCheckpointLoad(
	commandParts: string[],
	options: MessageSubmissionOptions,
): Promise<boolean> {
	const {
		onAddToChatQueue,
		onEnterCheckpointLoadMode,
		onCommandComplete,
		getNextComponentKey,
		messages,
	} = options;

	// Check if this is an interactive checkpoint load command
	const isCheckpointLoad =
		commandParts[0] === SPECIAL_COMMANDS.CHECKPOINT &&
		(commandParts[1] === CHECKPOINT_SUBCOMMANDS.LOAD ||
			commandParts[1] === CHECKPOINT_SUBCOMMANDS.RESTORE) &&
		commandParts.length === 2;

	if (!isCheckpointLoad) {
		return false;
	}

	try {
		const manager = new CheckpointManager();
		const checkpoints = await manager.listCheckpoints();

		if (checkpoints.length === 0) {
			onAddToChatQueue(
				React.createElement(InfoMessage, {
					key: `checkpoint-info-${getNextComponentKey()}`,
					message:
						'No checkpoints available. Create one with /checkpoint create [name]',
					hideBox: true,
				}),
			);
			onCommandComplete?.();
			return true;
		}

		onEnterCheckpointLoadMode(checkpoints, messages.length);
		return true;
	} catch (error) {
		onAddToChatQueue(
			React.createElement(ErrorMessage, {
				key: `checkpoint-error-${getNextComponentKey()}`,
				message: `Failed to list checkpoints: ${getErrorMessage(error)}`,
				hideBox: true,
			}),
		);
		onCommandComplete?.();
		return true;
	}
}

/**
 * Helper to complete resume command with proper React timing
 */
function completeResumeCommand(
	onAddToChatQueue: (component: React.ReactNode) => void,
	onCommandComplete: (() => void) | undefined,
	element: React.ReactElement,
): void {
	queueMicrotask(() => {
		onAddToChatQueue(element);
	});
	setTimeout(() => {
		onCommandComplete?.();
	}, DELAY_COMMAND_COMPLETE_MS);
}

/**
 * Helper to restore a session (identity + messages)
 */
function restoreSession(
	session: {
		id: string;
		createdAt: number;
		name: string;
		messageCount: number;
		messages: Message[];
	},
	setMessages: (messages: Message[]) => void,
	onAddToChatQueue: (component: React.ReactNode) => void,
	onCommandComplete: (() => void) | undefined,
	currentMessageCount: number,
): void {
	// Restore session identity and messages
	sessionService.restore({
		id: session.id,
		createdAt: session.createdAt,
	});
	setMessages(session.messages);

	// Show warning if current session had unsaved messages
	if (currentMessageCount > 0) {
		queueMicrotask(() => {
			onAddToChatQueue(
				React.createElement(WarningMessage, {
					key: generateKey('resume-warning'),
					message: `Previous session with ${currentMessageCount} message(s) was replaced.`,
					hideBox: true,
				}),
			);
		});
	}

	completeResumeCommand(
		onAddToChatQueue,
		onCommandComplete,
		React.createElement(SuccessMessage, {
			key: generateKey('resume-success'),
			message: `Session restored: ${session.name} (${session.messageCount} messages)`,
			hideBox: true,
		}),
	);
}

/**
 * Handles /resume command with message restoration
 * Returns true if resume was handled (has subcommand), false to fall through to list view
 */
async function handleResumeCommand(
	commandParts: string[],
	options: MessageSubmissionOptions,
): Promise<boolean> {
	const {onAddToChatQueue, onCommandComplete, setMessages, messages} = options;

	// /resume without args falls through to show list via built-in command
	if (commandParts.length < 2) {
		return false;
	}

	const subcommand = commandParts[1];
	const currentSessionId = sessionService.isInitialized()
		? sessionService.getSessionId()
		: null;

	try {
		// /resume last - resume most recent session
		if (subcommand === 'last') {
			const session = await sessionManager.getLastSession();
			if (!session) {
				completeResumeCommand(
					onAddToChatQueue,
					onCommandComplete,
					React.createElement(ErrorMessage, {
						key: generateKey('resume-error'),
						message: 'No previous session found.',
						hideBox: true,
					}),
				);
				return true;
			}

			// Prevent resuming current session
			if (session.id === currentSessionId) {
				completeResumeCommand(
					onAddToChatQueue,
					onCommandComplete,
					React.createElement(InfoMessage, {
						key: generateKey('resume-info'),
						message: 'Already in this session.',
						hideBox: true,
					}),
				);
				return true;
			}

			restoreSession(
				session,
				setMessages,
				onAddToChatQueue,
				onCommandComplete,
				messages.length,
			);
			return true;
		}

		// /resume <id> or /resume <number>
		let sessionId = subcommand;

		// Only treat as index if it's purely numeric (prevents collision with hex IDs)
		const isPurelyNumeric = /^\d+$/.test(subcommand);
		if (isPurelyNumeric) {
			const index = Number.parseInt(subcommand, 10);
			if (index > 0) {
				const sessions = await sessionManager.listSessions({limit: index});
				if (sessions.length < index) {
					completeResumeCommand(
						onAddToChatQueue,
						onCommandComplete,
						React.createElement(ErrorMessage, {
							key: generateKey('resume-error'),
							message: `Session #${index} not found. Only ${sessions.length} sessions available.`,
							hideBox: true,
						}),
					);
					return true;
				}
				sessionId = sessions[index - 1].id;
			}
		}

		// Prevent resuming current session
		if (sessionId === currentSessionId) {
			completeResumeCommand(
				onAddToChatQueue,
				onCommandComplete,
				React.createElement(InfoMessage, {
					key: generateKey('resume-info'),
					message: 'Already in this session.',
					hideBox: true,
				}),
			);
			return true;
		}

		// Load session by ID
		const session = await sessionManager.loadSession(sessionId);
		if (!session) {
			completeResumeCommand(
				onAddToChatQueue,
				onCommandComplete,
				React.createElement(ErrorMessage, {
					key: generateKey('resume-error'),
					message: `Session '${sessionId}' not found.`,
					hideBox: true,
				}),
			);
			return true;
		}

		restoreSession(
			session,
			setMessages,
			onAddToChatQueue,
			onCommandComplete,
			messages.length,
		);
		return true;
	} catch (error) {
		completeResumeCommand(
			onAddToChatQueue,
			onCommandComplete,
			React.createElement(ErrorMessage, {
				key: generateKey('resume-error'),
				message: `Failed to resume session: ${getErrorMessage(error)}`,
				hideBox: true,
			}),
		);
		return true;
	}
}

/**
 * Handles built-in commands via the command registry
 */
async function handleBuiltInCommand(
	message: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const {onAddToChatQueue, onCommandComplete, getNextComponentKey, messages} =
		options;

	const totalTokens = messages.reduce(
		(sum, msg) => sum + options.getMessageTokens(msg),
		0,
	);

	const result = await commandRegistry.execute(message.slice(1), messages, {
		provider: options.provider,
		model: options.model,
		tokens: totalTokens,
		getMessageTokens: options.getMessageTokens,
	});

	if (!result) {
		onCommandComplete?.();
		return;
	}

	// Handle React element result
	if (React.isValidElement(result)) {
		// Defer adding to chat queue to avoid "Cannot update a component while rendering" error
		queueMicrotask(() => {
			onAddToChatQueue(result);
		});
		// Give React time to render before signaling completion
		setTimeout(() => {
			onCommandComplete?.();
		}, DELAY_COMMAND_COMPLETE_MS);
		return;
	}

	// Handle string result
	if (typeof result === 'string' && result.trim()) {
		queueMicrotask(() => {
			onAddToChatQueue(
				React.createElement(InfoMessage, {
					key: `command-result-${getNextComponentKey()}`,
					message: result,
					hideBox: true,
				}),
			);
		});
		// Give React time to render before signaling completion
		setTimeout(() => {
			onCommandComplete?.();
		}, DELAY_COMMAND_COMPLETE_MS);
		return;
	}

	// No output to display, signal completion immediately
	onCommandComplete?.();
}

/**
 * Handles slash commands (prefixed with /)
 */
async function handleSlashCommand(
	message: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const commandName = message.slice(1).split(/\s+/)[0];

	// Try custom command first
	if (await handleCustomCommand(message, commandName, options)) {
		return;
	}

	// Try special command
	if (await handleSpecialCommand(commandName, options)) {
		return;
	}

	// Try checkpoint load
	const commandParts = message.slice(1).trim().split(/\s+/);
	if (await handleCheckpointLoad(commandParts, options)) {
		return;
	}

	// Try resume with message restoration
	if (
		commandParts[0] === SPECIAL_COMMANDS.RESUME &&
		(await handleResumeCommand(commandParts, options))
	) {
		return;
	}

	// Fall back to built-in command
	await handleBuiltInCommand(message, options);
}

/**
 * Main entry point for handling user message submission.
 * Routes messages to appropriate handlers based on their type.
 */
export async function handleMessageSubmission(
	message: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const parsedInput = parseInput(message);

	// Handle bash commands (prefixed with !)
	if (parsedInput.isBashCommand && parsedInput.bashCommand) {
		await handleBashCommand(parsedInput.bashCommand, options);
		return;
	}

	// Handle slash commands (prefixed with /)
	if (message.startsWith('/')) {
		await handleSlashCommand(message, options);
		return;
	}

	// Regular chat message - process with AI
	await options.onHandleChatMessage(message);
}

export function createClearMessagesHandler(
	setMessages: (messages: Message[]) => void,
	client: LLMClient | null,
) {
	return async () => {
		// Clear message history and client context
		setMessages([]);
		if (client) {
			await client.clearContext();
		}
	};
}
