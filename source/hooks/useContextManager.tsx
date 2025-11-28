import {useMemo, useCallback, useState} from 'react';
import type {Message, LLMClient} from '@/types/core';
import type {Tokenizer} from '@/types/tokenization.js';

/**
 * Context usage status levels
 */
export type ContextStatus = 'normal' | 'warning' | 'critical';

/**
 * Context usage information returned by the hook
 */
export interface ContextUsage {
	/** Current total tokens used */
	currentTokens: number;
	/** Maximum context size from the model */
	maxTokens: number;
	/** Percentage of context used (0-100) */
	percentUsed: number;
	/** Current status level */
	status: ContextStatus;
	/** Formatted string for display (e.g., "2.5k / 8k") */
	displayString: string;
	/** Whether context limit is known */
	hasContextLimit: boolean;
}

/**
 * Result of message pruning operation
 */
export interface PruneResult {
	/** Whether messages were pruned */
	pruned: boolean;
	/** New message list after pruning */
	messages: Message[];
	/** Number of messages removed */
	removedCount: number;
}

interface UseContextManagerProps {
	/** LLM client for getting context size */
	client: LLMClient | null;
	/** Current messages in conversation */
	messages: Message[];
	/** Tokenizer for counting tokens (used by estimateTokens) */
	tokenizer: Tokenizer;
	/** Cached token counts per message */
	getMessageTokens: (message: Message) => number;
	/** Warning threshold percentage (default: 80) */
	warningThreshold?: number;
	/** Critical/auto-prune threshold percentage (default: 90) */
	criticalThreshold?: number;
	/** Minimum messages to keep when pruning (default: 6) */
	minMessagesToKeep?: number;
	/** Target percentage after pruning (default: 70) */
	targetPercentAfterPrune?: number;
	/** Current model name (used to trigger context size refresh on model change) */
	currentModel?: string;
}

/**
 * Format token count for display (e.g., 2500 -> "2.5k", 128000 -> "128k")
 */
function formatTokenCount(tokens: number): string {
	if (tokens >= 1000) {
		const k = tokens / 1000;
		// Show one decimal place if less than 100k, otherwise whole number
		if (k >= 100) {
			return `${Math.round(k)}k`;
		}
		return `${k.toFixed(1).replace(/\.0$/, '')}k`;
	}
	return tokens.toString();
}

/**
 * Hook for managing conversation context and token limits
 *
 * Features:
 * - Track cumulative token usage across the conversation
 * - Warn users at configurable threshold (default 80%)
 * - Auto-prune old messages at critical threshold (default 90%)
 * - Preserve system prompt and recent messages during pruning
 * - Provide formatted context usage for UI display
 */
export function useContextManager({
	client,
	messages,
	tokenizer,
	getMessageTokens,
	warningThreshold = 80,
	criticalThreshold = 90,
	minMessagesToKeep = 6,
	targetPercentAfterPrune = 70,
	currentModel,
}: UseContextManagerProps) {
	// Track if warning has been shown to avoid repeated warnings
	const [warningShown, setWarningShown] = useState(false);

	/**
	 * Get the model's context size limit
	 * Re-fetches when client or model changes
	 */
	const maxContextSize = useMemo(() => {
		if (!client) return 0;
		return client.getContextSize();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- currentModel triggers refresh when model changes
	}, [client, currentModel]);

	/**
	 * Calculate total tokens for current conversation
	 * Includes all messages (system, user, assistant, tool)
	 */
	const totalTokens = useMemo(() => {
		if (messages.length === 0) return 0;

		return messages.reduce((total, message) => {
			return total + getMessageTokens(message);
		}, 0);
	}, [messages, getMessageTokens]);

	/**
	 * Calculate context usage percentage
	 */
	const percentUsed = useMemo(() => {
		if (maxContextSize === 0) return 0;
		return Math.round((totalTokens / maxContextSize) * 100);
	}, [totalTokens, maxContextSize]);

	/**
	 * Determine current context status
	 */
	const status: ContextStatus = useMemo(() => {
		if (percentUsed >= criticalThreshold) return 'critical';
		if (percentUsed >= warningThreshold) return 'warning';
		return 'normal';
	}, [percentUsed, warningThreshold, criticalThreshold]);

	/**
	 * Get formatted display string for context usage
	 */
	const displayString = useMemo(() => {
		if (maxContextSize === 0) {
			return `${formatTokenCount(totalTokens)} tokens`;
		}
		return `${formatTokenCount(totalTokens)} / ${formatTokenCount(maxContextSize)}`;
	}, [totalTokens, maxContextSize]);

	/**
	 * Full context usage information
	 */
	const contextUsage: ContextUsage = useMemo(
		() => ({
			currentTokens: totalTokens,
			maxTokens: maxContextSize,
			percentUsed,
			status,
			displayString,
			hasContextLimit: maxContextSize > 0,
		}),
		[totalTokens, maxContextSize, percentUsed, status, displayString],
	);

	/**
	 * Prune old messages to reduce context usage
	 *
	 * Strategy:
	 * 1. Never prune system messages (keep all at the beginning)
	 * 2. Keep the most recent N message pairs (user + assistant)
	 * 3. Remove older messages from the middle
	 *
	 * @returns PruneResult with pruned messages and metadata
	 */
	const pruneMessages = useCallback(
		(currentMessages: Message[]): PruneResult => {
			// Early return for empty messages or unknown context size
			if (currentMessages.length === 0 || maxContextSize === 0) {
				return {pruned: false, messages: currentMessages, removedCount: 0};
			}

			// Calculate current token count for the messages being passed
			const currentTokenCount = currentMessages.reduce(
				(total, msg) => total + getMessageTokens(msg),
				0,
			);

			// Check if we actually need to prune (at or above critical threshold)
			const currentPercent = (currentTokenCount / maxContextSize) * 100;
			if (currentPercent < criticalThreshold) {
				return {pruned: false, messages: currentMessages, removedCount: 0};
			}

			// Separate system messages from conversation messages
			const systemMessages = currentMessages.filter(m => m.role === 'system');
			const conversationMessages = currentMessages.filter(
				m => m.role !== 'system',
			);

			// If we don't have enough messages to prune, return as-is
			if (conversationMessages.length <= minMessagesToKeep) {
				return {pruned: false, messages: currentMessages, removedCount: 0};
			}

			// Calculate how many messages to keep (aim for target% of context after pruning)
			const targetTokens = (maxContextSize * targetPercentAfterPrune) / 100;

			// Count tokens in system messages (these are always kept)
			const systemTokens = systemMessages.reduce(
				(total, msg) => total + getMessageTokens(msg),
				0,
			);

			// Calculate available tokens for conversation messages
			const availableTokens = targetTokens - systemTokens;

			// Keep messages from the end until we hit the token limit
			const keptMessages: Message[] = [];
			let keptTokens = 0;

			// Start from the most recent messages and work backwards
			for (let i = conversationMessages.length - 1; i >= 0; i--) {
				const msg = conversationMessages[i];
				const msgTokens = getMessageTokens(msg);

				// Always keep at least minMessagesToKeep messages
				if (keptMessages.length < minMessagesToKeep) {
					keptMessages.unshift(msg);
					keptTokens += msgTokens;
					continue;
				}

				// Check if adding this message would exceed our target
				if (keptTokens + msgTokens <= availableTokens) {
					keptMessages.unshift(msg);
					keptTokens += msgTokens;
				} else {
					// Stop adding messages once we exceed the target
					break;
				}
			}

			// Combine system messages with kept conversation messages
			const prunedMessages = [...systemMessages, ...keptMessages];
			const removedCount = currentMessages.length - prunedMessages.length;

			return {
				pruned: removedCount > 0,
				messages: prunedMessages,
				removedCount,
			};
		},
		[maxContextSize, minMessagesToKeep, getMessageTokens, targetPercentAfterPrune, criticalThreshold],
	);

	/**
	 * Check if pruning is needed (at or above critical threshold)
	 */
	const needsPruning = useMemo(() => {
		return percentUsed >= criticalThreshold && maxContextSize > 0;
	}, [percentUsed, criticalThreshold, maxContextSize]);

	/**
	 * Check if warning should be shown
	 */
	const shouldShowWarning = useMemo(() => {
		return (
			status === 'warning' && !warningShown && maxContextSize > 0
		);
	}, [status, warningShown, maxContextSize]);

	/**
	 * Mark warning as shown
	 */
	const markWarningShown = useCallback(() => {
		setWarningShown(true);
	}, []);

	/**
	 * Reset warning state (call when conversation is cleared)
	 */
	const resetWarningState = useCallback(() => {
		setWarningShown(false);
	}, []);

	/**
	 * Estimate tokens for a new message before adding it
	 */
	const estimateTokens = useCallback(
		(content: string): number => {
			return tokenizer.countTokens({role: 'user', content});
		},
		[tokenizer],
	);

	/**
	 * Check if adding a message would exceed critical threshold
	 */
	const wouldExceedLimit = useCallback(
		(additionalTokens: number): boolean => {
			if (maxContextSize === 0) return false;
			const newTotal = totalTokens + additionalTokens;
			const newPercent = (newTotal / maxContextSize) * 100;
			return newPercent >= criticalThreshold;
		},
		[totalTokens, maxContextSize, criticalThreshold],
	);

	return {
		// Context usage information
		contextUsage,

		// Pruning functionality
		pruneMessages,
		needsPruning,

		// Warning state
		shouldShowWarning,
		markWarningShown,
		resetWarningState,

		// Utility functions
		estimateTokens,
		wouldExceedLimit,

		// Direct access to computed values
		totalTokens,
		maxContextSize,
		percentUsed,
		status,
	};
}
