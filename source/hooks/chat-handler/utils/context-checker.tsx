import {WarningMessage} from '@/components/message-box';
import {
	TOKEN_THRESHOLD_CRITICAL_PERCENT,
	TOKEN_THRESHOLD_WARNING_PERCENT,
} from '@/constants';
import {getModelContextLimit} from '@/models/index';
import {createTokenizer} from '@/tokenization/index';
import type {Message} from '@/types/core';
import {calculateTokenBreakdown} from '@/usage/calculator';
import type React from 'react';

/**
 * Checks context usage and displays warning if approaching limit.
 * Shows different warnings based on TOKEN_THRESHOLD thresholds.
 *
 * @param allMessages - All messages to check token count for
 * @param systemMessage - System message to include in count
 * @param currentProvider - Current LLM provider name
 * @param currentModel - Current model name
 * @param addToChatQueue - Callback to add warning message to chat
 * @param getNextComponentKey - Function to generate unique React keys
 */
export const checkContextUsage = async (
	allMessages: Message[],
	systemMessage: Message,
	currentProvider: string,
	currentModel: string,
	addToChatQueue: (component: React.ReactNode) => void,
	getNextComponentKey: () => number,
): Promise<void> => {
	try {
		const contextLimit = await getModelContextLimit(currentModel);
		if (!contextLimit) return; // Unknown limit, skip check

		const tokenizer = createTokenizer(currentProvider, currentModel);
		const breakdown = calculateTokenBreakdown(
			[systemMessage, ...allMessages],
			tokenizer,
		);

		// Clean up tokenizer if needed
		if (tokenizer.free) {
			tokenizer.free();
		}

		const percentUsed = (breakdown.total / contextLimit) * 100;

		// Show warning on every message once past threshold
		if (percentUsed >= TOKEN_THRESHOLD_CRITICAL_PERCENT) {
			addToChatQueue(
				<WarningMessage
					key={`context-warning-${getNextComponentKey()}`}
					message={`Context ${Math.round(
						percentUsed,
					)}% full (${breakdown.total.toLocaleString()}/${contextLimit.toLocaleString()} tokens). Consider using /clear to start fresh.`}
					hideBox={true}
				/>,
			);
		} else if (percentUsed >= TOKEN_THRESHOLD_WARNING_PERCENT) {
			addToChatQueue(
				<WarningMessage
					key={`context-warning-${getNextComponentKey()}`}
					message={`Context ${Math.round(
						percentUsed,
					)}% full (${breakdown.total.toLocaleString()}/${contextLimit.toLocaleString()} tokens).`}
					hideBox={true}
				/>,
			);
		}
	} catch {
		// Silently ignore errors in context checking - it's not critical
	}
};
