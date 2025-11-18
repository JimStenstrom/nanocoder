import React from 'react';
import {commandRegistry} from '@/commands';
import {parseInput} from '@/command-parser';
import {toolRegistry} from '@/tools/index';
import InfoMessage from '@/components/info-message';
import ToolMessage from '@/components/tool-message';
import ErrorMessage from '@/components/error-message';
import type {MessageSubmissionOptions, Message} from '@/types/index';
import type {LLMClient} from '@/types/core';

export async function handleMessageSubmission(
	message: string,
	options: MessageSubmissionOptions,
): Promise<void> {
	const {
		customCommandCache,
		customCommandLoader,
		customCommandExecutor,
		onClearMessages,
		onCompactMessages,
		onEnterModelSelectionMode,
		onEnterProviderSelectionMode,
		onEnterThemeSelectionMode,
		onEnterRecommendationsMode,
		onEnterConfigWizardMode,
		onShowStatus,
		onHandleChatMessage,
		onAddToChatQueue,
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
						resultString.length > 4000
							? resultString.substring(0, 4000)
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
			}
		} else {
			// Handle special commands that need app state access
			if (commandName === 'clear') {
				await onClearMessages();
				// Still show the clear command result
			} else if (commandName === 'compact') {
				// Parse compact command arguments
				const args = message
					.slice(commandName.length + 1)
					.trim()
					.split(/\s+/)
					.filter(arg => arg);
				const action = args[0] || 'preview';
				const mode = (args[1] || 'default') as
					| 'default'
					| 'aggressive'
					| 'conservative';

				// Only handle 'apply' action here; 'preview' is handled by the command handler
				if (action === 'apply') {
					const result = await onCompactMessages(mode);
					// Show result message
					const MessageComponent = result.success
						? InfoMessage
						: ErrorMessage;
					queueMicrotask(() =>
						onAddToChatQueue(
							React.createElement(MessageComponent, {
								key: `compact-result-${componentKeyCounter}`,
								message: result.message,
								hideBox: true,
							}),
						),
					);
					// Don't execute the command handler for 'apply' - we've already handled it
					return;
				}
			} else if (commandName === 'model') {
				onEnterModelSelectionMode();
				return;
			} else if (commandName === 'provider') {
				onEnterProviderSelectionMode();
				return;
			} else if (commandName === 'theme') {
				onEnterThemeSelectionMode();
				return;
			} else if (commandName === 'recommendations') {
				onEnterRecommendationsMode();
				return;
			} else if (commandName === 'setup-config') {
				onEnterConfigWizardMode();
				return;
			} else if (commandName === 'status') {
				onShowStatus();
				return;
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
					queueMicrotask(() => onAddToChatQueue(result));
				} else if (typeof result === 'string' && result.trim()) {
					queueMicrotask(() =>
						onAddToChatQueue(
							React.createElement(InfoMessage, {
								key: `command-result-${componentKeyCounter}`,
								message: result,
								hideBox: true,
							}),
						),
					);
				}
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

export function createCompactMessagesHandler(
	messages: Message[],
	mode: 'default' | 'aggressive' | 'conservative',
	setMessages: (messages: Message[]) => void,
	client: LLMClient | null,
) {
	return async (): Promise<{
		success: boolean;
		message: string;
		tokensSaved?: number;
	}> => {
		if (!client) {
			return {
				success: false,
				message: 'No LLM client available for compaction',
			};
		}

		if (messages.length === 0) {
			return {
				success: false,
				message: 'No messages to compact',
			};
		}

		// Determine how many recent messages to keep based on mode
		let recentMessagesToKeep: number;
		switch (mode) {
			case 'aggressive':
				recentMessagesToKeep = Math.min(5, Math.floor(messages.length * 0.1));
				break;
			case 'conservative':
				recentMessagesToKeep = Math.min(
					20,
					Math.floor(messages.length * 0.4),
				);
				break;
			case 'default':
			default:
				recentMessagesToKeep = Math.min(
					10,
					Math.floor(messages.length * 0.25),
				);
				break;
		}

		const messagesToCompact = Math.max(
			0,
			messages.length - recentMessagesToKeep,
		);

		if (messagesToCompact === 0) {
			return {
				success: false,
				message: 'No messages to compact. Conversation is already minimal.',
			};
		}

		// Split messages into those to compact and those to keep
		const oldMessages = messages.slice(0, messagesToCompact);
		const recentMessages = messages.slice(messagesToCompact);

		try {
			// Analyze what types of content are in old messages
			const hasToolCalls = oldMessages.some(
				m => m.tool_calls || m.role === 'tool',
			);
			const hasCode = oldMessages.some(
				m =>
					m.content &&
					(m.content.includes('```') || m.content.includes('function')),
			);

			// Create a prompt for the LLM to summarize the old messages
			const summaryPrompt: Message[] = [
				{
					role: 'system',
					content: `You are a conversation summarizer for a coding assistant. Create a comprehensive but concise summary of the conversation history.

CRITICAL - Focus on preserving:
1. **Code Changes**: File names, functions modified, and WHY changes were made
2. **Technical Decisions**: Architecture choices, library selections, patterns chosen
3. **Tool Executions**: Commands run and their key results (especially errors/warnings)
4. **Context**: Problem being solved, constraints, requirements discussed
5. **Outcomes**: What worked, what didn't, current state of implementation

${hasToolCalls ? '⚠️  This conversation includes tool executions - preserve command outputs that revealed errors or important information.\n' : ''}${hasCode ? '⚠️  This conversation includes code changes - preserve file names and purpose of changes.\n' : ''}
Format as a structured summary with bullet points. Be specific about file names, function names, and technical details. Eliminate verbose back-and-forth but keep technical substance.`,
				},
				{
					role: 'user',
					content: `Summarize this conversation history, preserving all technical details:\n\n${oldMessages
						.map((msg, idx) => {
							let label = msg.role.toUpperCase();
							if (msg.role === 'tool') label = `TOOL RESULT${msg.name ? ` (${msg.name})` : ''}`;
							else if (msg.tool_calls) label = `${label} (with tool calls)`;

							// Truncate very long messages but indicate truncation
							let content = msg.content || '';
							if (content.length > 2000) {
								content = content.substring(0, 2000) + '\n[...truncated for length]';
							}

							return `[${idx + 1}] ${label}:\n${content}`;
						})
						.join('\n\n---\n\n')}`,
				},
			];

			// Call the LLM to generate a summary
			const response = await client.chat(summaryPrompt, {});

			if (!response.choices?.[0]?.message?.content) {
				return {
					success: false,
					message: 'Failed to generate summary: empty response',
				};
			}

			// Create a new system message with the summary
			const summaryMessage: Message = {
				role: 'system',
				content: `[Conversation History Summary - ${messagesToCompact} messages compacted]\n\n${response.choices[0].message.content}`,
			};

			// Create the new message array: summary + recent messages
			const newMessages: Message[] = [summaryMessage, ...recentMessages];

			// Update the message state
			setMessages(newMessages);

			// Clear and update client context
			await client.clearContext();

			return {
				success: true,
				message: `Successfully compacted ${messagesToCompact} messages into a summary. Kept ${recentMessagesToKeep} recent messages.`,
				tokensSaved: oldMessages.length,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to compact messages: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	};
}
