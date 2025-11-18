import React from 'react';
import {Command, Message} from '@/types/index';
import InfoMessage from '@/components/info-message';
import {createTokenizer} from '@/tokenization/index';
import {calculateTokenBreakdown} from '@/usage/calculator';
import type {Tokenizer} from '@/types/tokenization';

interface CompactionAnalysis {
	mode: 'preview' | 'default' | 'aggressive' | 'conservative';
	totalMessages: number;
	messagesToCompact: number;
	messagesToKeep: number;
	currentTokens: number;
	estimatedTokensAfterCompaction: number;
	estimatedSavings: number;
	estimatedSavingsPercent: number;
}

/**
 * Classifies messages to identify those that should always be preserved
 */
function classifyMessages(messages: Message[]): {
	criticalMessages: Set<number>;
} {
	const criticalMessages = new Set<number>();

	messages.forEach((msg, idx) => {
		// Preserve tool calls and their results by keeping them in recent messages
		if (msg.role === 'tool' || msg.tool_call_id || msg.tool_calls) {
			criticalMessages.add(idx);
			// Also preserve the message before and after tool calls for context
			if (idx > 0) criticalMessages.add(idx - 1);
			if (idx < messages.length - 1) criticalMessages.add(idx + 1);
		}

		// Preserve system messages (they're usually important)
		if (msg.role === 'system') {
			criticalMessages.add(idx);
		}
	});

	return {criticalMessages};
}

/**
 * Analyzes messages to determine which can be compacted
 */
function analyzeMessagesForCompaction(
	messages: Message[],
	mode: 'default' | 'aggressive' | 'conservative',
	tokenizer: Tokenizer,
	getMessageTokens: (message: Message) => number,
): CompactionAnalysis {
	const totalMessages = messages.length;
	const breakdown = calculateTokenBreakdown(
		messages,
		tokenizer,
		getMessageTokens,
	);
	const currentTokens = breakdown.total;

	// Classify messages to find critical ones
	const {criticalMessages} = classifyMessages(messages);

	// Determine how many recent messages to keep based on mode
	let recentMessagesToKeep: number;
	let compactionRatio: number; // Estimated token reduction ratio

	switch (mode) {
		case 'aggressive':
			recentMessagesToKeep = Math.min(5, Math.floor(totalMessages * 0.1));
			compactionRatio = 0.15; // Keep 15% of original tokens
			break;
		case 'conservative':
			recentMessagesToKeep = Math.min(20, Math.floor(totalMessages * 0.4));
			compactionRatio = 0.4; // Keep 40% of original tokens
			break;
		case 'default':
		default:
			recentMessagesToKeep = Math.min(10, Math.floor(totalMessages * 0.25));
			compactionRatio = 0.25; // Keep 25% of original tokens
			break;
	}

	// Ensure we keep critical messages in recent set
	const minKeep = Math.max(
		recentMessagesToKeep,
		Math.max(...Array.from(criticalMessages), 0) + 1,
	);
	recentMessagesToKeep = Math.min(minKeep, totalMessages);

	// Always keep at least the most recent messages
	const messagesToCompact = Math.max(0, totalMessages - recentMessagesToKeep);
	const messagesToKeep = totalMessages - messagesToCompact;

	// Calculate tokens in messages to be compacted
	let tokensToCompact = 0;
	let tokensToKeep = 0;

	for (let i = 0; i < messages.length; i++) {
		const tokens = getMessageTokens(messages[i]);
		if (i < messagesToCompact) {
			tokensToCompact += tokens;
		} else {
			tokensToKeep += tokens;
		}
	}

	// Estimate tokens after compaction
	// Summary will be ~compactionRatio of original compacted tokens
	const estimatedSummaryTokens = Math.ceil(tokensToCompact * compactionRatio);
	const estimatedTokensAfterCompaction = estimatedSummaryTokens + tokensToKeep;
	const estimatedSavings = currentTokens - estimatedTokensAfterCompaction;
	const estimatedSavingsPercent = Math.round(
		(estimatedSavings / currentTokens) * 100,
	);

	return {
		mode: 'preview',
		totalMessages,
		messagesToCompact,
		messagesToKeep,
		currentTokens,
		estimatedTokensAfterCompaction,
		estimatedSavings,
		estimatedSavingsPercent,
	};
}

/**
 * Formats the compaction analysis results
 */
function formatAnalysis(analysis: CompactionAnalysis): string {
	const {
		totalMessages,
		messagesToCompact,
		messagesToKeep,
		currentTokens,
		estimatedTokensAfterCompaction,
		estimatedSavings,
		estimatedSavingsPercent,
		mode,
	} = analysis;

	if (messagesToCompact === 0) {
		return `✓ No compaction needed

Current state: ${totalMessages} message${totalMessages === 1 ? '' : 's'} (${currentTokens.toLocaleString()} tokens)
Your conversation is already minimal.`;
	}

	const modeDescriptions = {
		preview: 'Preview Mode',
		default: 'Balanced (25% retention)',
		aggressive: 'Aggressive (10% retention)',
		conservative: 'Conservative (40% retention)',
	};

	return `Context Compaction Analysis
Mode: ${modeDescriptions[mode]}

📊 Message Distribution:
   • ${messagesToCompact} message${messagesToCompact === 1 ? '' : 's'} → will be summarized
   • ${messagesToKeep} message${messagesToKeep === 1 ? '' : 's'} → will be preserved in full
   • ${totalMessages} total messages

💾 Token Usage:
   • Current:    ${currentTokens.toLocaleString()} tokens
   • After:      ~${estimatedTokensAfterCompaction.toLocaleString()} tokens
   • Savings:    ~${estimatedSavings.toLocaleString()} tokens (-${estimatedSavingsPercent}%)

ℹ️  What happens during compaction:
   • Recent ${messagesToKeep} messages kept unchanged (includes your latest work)
   • Older ${messagesToCompact} messages compressed into a detailed summary
   • Tool results, code changes, and decisions are preserved in summary
   • This operation uses your LLM to generate the summary

To apply this compaction:
   /compact apply [mode]

Available modes: default | aggressive | conservative`;
}

/**
 * Component to display compaction results
 */
function CompactionResult({analysis}: {analysis: CompactionAnalysis}) {
	return (
		<InfoMessage
			hideBox={true}
			message={formatAnalysis(analysis)}
		></InfoMessage>
	);
}

export const compactCommand: Command = {
	name: 'compact',
	description:
		'Compact conversation history to reduce token usage. Usage: /compact [preview|apply] [default|aggressive|conservative]',
	handler: (
		args: string[],
		messages: Message[],
		metadata: {
			provider: string;
			model: string;
			tokens: number;
			getMessageTokens: (message: Message) => number;
		},
	) => {
		const {provider, model, getMessageTokens} = metadata;

		// Parse arguments
		const action = args[0] || 'preview';
		const mode = (args[1] || 'default') as
			| 'default'
			| 'aggressive'
			| 'conservative';

		// Validate mode
		if (!['default', 'aggressive', 'conservative'].includes(mode)) {
			return Promise.resolve(
				React.createElement(InfoMessage, {
					key: `compact-error-${Date.now()}`,
					message: `Invalid mode: ${mode}. Use: default, aggressive, or conservative`,
					hideBox: true,
				}),
			);
		}

		// Validate action
		if (!['preview', 'apply'].includes(action)) {
			return Promise.resolve(
				React.createElement(InfoMessage, {
					key: `compact-error-${Date.now()}`,
					message: `Invalid action: ${action}. Use: preview or apply`,
					hideBox: true,
				}),
			);
		}

		// Check if there are messages to compact
		if (messages.length === 0) {
			return Promise.resolve(
				React.createElement(InfoMessage, {
					key: `compact-empty-${Date.now()}`,
					message: 'No messages in conversation history.',
					hideBox: true,
				}),
			);
		}

		// Create tokenizer for accurate counting
		const tokenizer = createTokenizer(provider, model);

		try {
			// Analyze messages
			const analysis = analyzeMessagesForCompaction(
				messages,
				mode,
				tokenizer,
				getMessageTokens,
			);

			if (action === 'preview') {
				analysis.mode = 'preview';
				return Promise.resolve(
					React.createElement(CompactionResult, {
						key: `compact-preview-${Date.now()}`,
						analysis,
					}),
				);
			} else {
				// For 'apply' action, we need special handling in appUtils.ts
				// For now, return a message indicating this is not yet implemented
				// The actual implementation will be added in appUtils.ts
				analysis.mode = mode;
				return Promise.resolve(
					React.createElement(InfoMessage, {
						key: `compact-apply-${Date.now()}`,
						message: `Compaction with mode "${mode}" is being processed...`,
						hideBox: true,
					}),
				);
			}
		} finally {
			// Clean up tokenizer
			if (tokenizer.free) {
				tokenizer.free();
			}
		}
	},
};
