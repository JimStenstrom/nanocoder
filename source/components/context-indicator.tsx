import {Box, Text} from 'ink';
import {memo} from 'react';
import {useTheme} from '@/hooks/useTheme';
import type {ContextUsage, ContextStatus} from '@/hooks/useContextManager';

interface ContextIndicatorProps {
	/** Context usage information from useContextManager */
	contextUsage: ContextUsage;
	/** Whether to show a compact version */
	compact?: boolean;
}

/**
 * Get color for context status
 */
function getStatusColor(
	status: ContextStatus,
	colors: ReturnType<typeof useTheme>['colors'],
): string {
	switch (status) {
		case 'critical':
			return colors.error;
		case 'warning':
			return colors.warning;
		default:
			return colors.secondary;
	}
}

/**
 * Get status icon for context status
 */
function getStatusIcon(status: ContextStatus): string {
	switch (status) {
		case 'critical':
			return '!';
		case 'warning':
			return '*';
		default:
			return '';
	}
}

/**
 * ContextIndicator Component
 *
 * Displays current context/token usage in a compact format.
 * Shows warning/critical states with appropriate colors.
 *
 * Examples:
 * - Normal: "2.5k / 8k"
 * - Warning (80%+): "* 6.8k / 8k (85%)"
 * - Critical (90%+): "! 7.5k / 8k (94%)"
 */
export default memo(function ContextIndicator({
	contextUsage,
	compact = false,
}: ContextIndicatorProps) {
	const {colors} = useTheme();
	const statusColor = getStatusColor(contextUsage.status, colors);
	const statusIcon = getStatusIcon(contextUsage.status);

	// Don't render if no context limit is known
	if (!contextUsage.hasContextLimit) {
		return null;
	}

	// Compact version: just tokens
	if (compact) {
		return (
			<Text color={statusColor} dimColor={contextUsage.status === 'normal'}>
				{statusIcon && `${statusIcon} `}
				{contextUsage.displayString}
			</Text>
		);
	}

	// Full version with percentage for warning/critical states
	return (
		<Box>
			<Text color={statusColor} dimColor={contextUsage.status === 'normal'}>
				{statusIcon && `${statusIcon} `}
				{contextUsage.displayString}
				{contextUsage.status !== 'normal' && ` (${contextUsage.percentUsed}%)`}
			</Text>
		</Box>
	);
});

/**
 * ContextWarningMessage Component
 *
 * Displays a warning message when context usage is high.
 * Used to alert users before automatic pruning occurs.
 */
export const ContextWarningMessage = memo(function ContextWarningMessage({
	contextUsage,
}: {
	contextUsage: ContextUsage;
}) {
	const {colors} = useTheme();

	if (contextUsage.status !== 'warning') {
		return null;
	}

	return (
		<Box marginBottom={1}>
			<Text color={colors.warning}>
				Context usage at {contextUsage.percentUsed}% ({contextUsage.displayString}).
				Older messages will be automatically pruned at 90% to prevent overflow.
			</Text>
		</Box>
	);
});

/**
 * ContextPrunedMessage Component
 *
 * Displays a notification when messages have been automatically pruned.
 */
export const ContextPrunedMessage = memo(function ContextPrunedMessage({
	removedCount,
}: {
	removedCount: number;
}) {
	const {colors} = useTheme();

	return (
		<Box marginBottom={1}>
			<Text color={colors.info}>
				Pruned {removedCount} older message{removedCount !== 1 ? 's' : ''} to stay within context limits.
				System prompt and recent messages preserved.
			</Text>
		</Box>
	);
});
