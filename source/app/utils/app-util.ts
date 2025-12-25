import {parseInput} from '@/command-parser';
import {commandRegistry} from '@/commands';
import ErrorMessage from '@/components/error-message';
import InfoMessage from '@/components/info-message';
import ToolMessage from '@/components/tool-message';
import {
	DELAY_COMMAND_COMPLETE_MS,
	TRUNCATION_RESULT_STRING_LENGTH,
} from '@/constants';
import {CheckpointManager} from '@/services/checkpoint-manager';
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
} as const;

/** Checkpoint subcommands */
const CHECKPOINT_SUBCOMMANDS = {
	LOAD: 'load',
	RESTORE: 'restore',
} as const;

export async function handleMessageSubmission(
	message: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const {
		customCommandCache,
		customCommandLoader,
		customCommandExecutor,
		onClearMessages,
		onEnterModelSelectionMode,
		onEnterProviderSelectionMode,
		onEnterThemeSelectionMode,
		onEnterModelDatabaseMode,
		onEnterConfigWizardMode,
		onEnterCheckpointLoadMode,
		onShowStatus,
		onHandleChatMessage,
		onAddToChatQueue,
		onCommandComplete,
		componentKeyCounter,
		setMessages,
		messages,
		setIsBashExecuting,
		setCurrentBashCommand,
	} = options;

	// Parse the input to determine its type
	const parsedInput = parseInput(message);

	// Handle bash commands (prefixed with !)
	if (parsedInput.isBashCommand && parsedInput.bashCommand) {
		const bashCommand = parsedInput.bashCommand;

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
					key: `bash-result-${componentKeyCounter}`,
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

			// Clear bash execution state
			setIsBashExecuting(false);
			setCurrentBashCommand('');

			// Signal completion for non-interactive mode
			onCommandComplete?.();
			return;
		} catch (error: unknown) {
			// Show error message if command fails
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			onAddToChatQueue(
				React.createElement(ErrorMessage, {
					key: `bash-error-${componentKeyCounter}`,
					message: `Error executing command: ${errorMessage}`,
				}),
			);

			// Clear bash execution state
			setIsBashExecuting(false);
			setCurrentBashCommand('');

			// Signal completion for non-interactive mode
			onCommandComplete?.();

			// Don't send to LLM - just return here
			return;
		}
	}

	// Handle regular commands (prefixed with /)
	if (message.startsWith('/')) {
		const commandName = message.slice(1).split(' ')[0];

		// Check for custom command first
		const customCommand =
			customCommandCache.get(commandName) ||
			customCommandLoader?.getCommand(commandName);

		if (customCommand) {
			// Execute custom command with any arguments
			const args = message
				.slice(commandName.length + 1)
				.trim()
				.split(/\s+/)
				.filter(arg => arg);
			const processedPrompt = customCommandExecutor?.execute(
				customCommand,
				args,
			);

			// Send the processed prompt to the AI
			if (processedPrompt) {
				await onHandleChatMessage(processedPrompt);
			} else {
				// Custom command didn't generate a prompt, signal completion
				onCommandComplete?.();
			}
			return;
		} else {
			// Handle special commands that need app state access
			if (commandName === SPECIAL_COMMANDS.CLEAR) {
				await onClearMessages();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.MODEL) {
				onEnterModelSelectionMode();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.PROVIDER) {
				onEnterProviderSelectionMode();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.THEME) {
				onEnterThemeSelectionMode();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.MODEL_DATABASE) {
				onEnterModelDatabaseMode();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.SETUP_CONFIG) {
				onEnterConfigWizardMode();
				onCommandComplete?.();
				return;
			} else if (commandName === SPECIAL_COMMANDS.STATUS) {
				onShowStatus();
				// Status adds to queue synchronously, give React time to render
				setTimeout(() => onCommandComplete?.(), DELAY_COMMAND_COMPLETE_MS);
				return;
			}

			// Handle checkpoint load specially for interactive mode
			const commandParts = message.slice(1).trim().split(/\s+/);
			if (
				commandParts[0] === SPECIAL_COMMANDS.CHECKPOINT &&
				(commandParts[1] === CHECKPOINT_SUBCOMMANDS.LOAD ||
					commandParts[1] === CHECKPOINT_SUBCOMMANDS.RESTORE) &&
				commandParts.length === 2
			) {
				// Interactive checkpoint load - no specific checkpoint name provided
				try {
					const manager = new CheckpointManager();
					const checkpoints = await manager.listCheckpoints();

					if (checkpoints.length === 0) {
						onAddToChatQueue(
							React.createElement(InfoMessage, {
								key: `checkpoint-info-${componentKeyCounter}`,
								message:
									'No checkpoints available. Create one with /checkpoint create [name]',
								hideBox: true,
							}),
						);
						onCommandComplete?.();
						return;
					}

					onEnterCheckpointLoadMode(checkpoints, messages.length);
					return;
				} catch (error) {
					onAddToChatQueue(
						React.createElement(ErrorMessage, {
							key: `checkpoint-error-${componentKeyCounter}`,
							message: `Failed to list checkpoints: ${
								error instanceof Error ? error.message : 'Unknown error'
							}`,
							hideBox: true,
						}),
					);
					onCommandComplete?.();
					return;
				}
			}

			// Execute built-in command
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
			if (result) {
				// Check if result is JSX (React element)
				// Defer adding to chat queue to avoid "Cannot update a component while rendering" error
				if (React.isValidElement(result)) {
					queueMicrotask(() => {
						onAddToChatQueue(result);
					});
					// Give React time to render before signaling completion
					setTimeout(() => {
						onCommandComplete?.();
					}, DELAY_COMMAND_COMPLETE_MS);
				} else if (typeof result === 'string' && result.trim()) {
					queueMicrotask(() => {
						onAddToChatQueue(
							React.createElement(InfoMessage, {
								key: `command-result-${componentKeyCounter}`,
								message: result,
								hideBox: true,
							}),
						);
					});
					// Give React time to render before signaling completion
					setTimeout(() => {
						onCommandComplete?.();
					}, DELAY_COMMAND_COMPLETE_MS);
				} else {
					// No output to display, signal completion immediately
					onCommandComplete?.();
				}
			} else {
				// No result, signal completion immediately
				onCommandComplete?.();
			}
		}

		// Return here to avoid sending to LLM
		return;
	}

	// Regular chat message - process with AI
	await onHandleChatMessage(message);
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
