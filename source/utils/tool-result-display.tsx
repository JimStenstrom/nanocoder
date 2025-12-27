import {ErrorMessage} from '@/components/message-box';
import ToolMessage from '@/components/tool-message';
import {generateKey} from '@/session';
import type {ToolManager} from '@/tools/tool-manager';
import type {ToolCall, ToolResult} from '@/types/index';
import {parseToolArguments} from '@/utils/tool-args-parser';
import React from 'react';

/**
 * Display tool result with proper formatting
 * Extracted to eliminate duplication between useChatHandler and useToolHandler
 *
 * @param toolCall - The tool call that was executed
 * @param result - The result from tool execution
 * @param toolManager - The tool manager instance (for formatters)
 * @param addToChatQueue - Function to add components to chat queue
 */
export async function displayToolResult(
	toolCall: ToolCall,
	result: ToolResult,
	toolManager: ToolManager | null,
	addToChatQueue: (component: React.ReactNode) => void,
): Promise<void> {
	// Check if this is an error result
	const isError = result.content.startsWith('Error: ');

	if (isError) {
		// Display as error message
		const errorMessage = result.content.replace(/^Error: /, '');
		addToChatQueue(
			<ErrorMessage
				key={generateKey('tool-error')}
				message={errorMessage}
				hideBox={true}
			/>,
		);
		return;
	}

	if (toolManager) {
		const formatter = toolManager.getToolFormatter(result.name);
		if (formatter) {
			try {
				const parsedArgs = parseToolArguments(toolCall.function.arguments);
				const formattedResult = await formatter(parsedArgs, result.content);

				if (React.isValidElement(formattedResult)) {
					addToChatQueue(
						React.cloneElement(formattedResult, {
							key: generateKey('tool-result'),
						}),
					);
				} else {
					addToChatQueue(
						<ToolMessage
							key={generateKey('tool-result')}
							title={`⚒ ${result.name}`}
							message={String(formattedResult)}
							hideBox={true}
						/>,
					);
				}
			} catch {
				// If formatter fails, show raw result
				addToChatQueue(
					<ToolMessage
						key={generateKey('tool-result')}
						title={`⚒ ${result.name}`}
						message={result.content}
						hideBox={true}
					/>,
				);
			}
		} else {
			// No formatter, show raw result
			addToChatQueue(
				<ToolMessage
					key={generateKey('tool-result')}
					title={`⚒ ${result.name}`}
					message={result.content}
					hideBox={true}
				/>,
			);
		}
	}
}
