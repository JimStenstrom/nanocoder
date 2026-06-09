/**
 * Usage display component for /usage command
 */

import {Box, Text} from 'ink';
import {TitledBoxWithPreferences} from '@/components/ui/titled-box';
import {useTerminalWidth} from '@/hooks/useTerminalWidth';
import {useTheme} from '@/hooks/useTheme';
import type {ContextSource, Message} from '@/types/core.js';
import type {TokenBreakdown} from '@/types/usage.js';
import {formatTokenCount, getUsageStatusColor} from '@/usage/calculator.js';
import {ProgressBar} from './progress-bar.js';

interface UsageDisplayProps {
	provider: string;
	model: string;
	contextLimit: number | null;
	currentTokens: number;
	breakdown: TokenBreakdown;
	messages: Message[];
	tokenizerName: string;
	getMessageTokens: (message: Message) => number;
	/**
	 * Whether the figures are the provider's API-reported counts or the
	 * client-side estimate. Controls the title marker. Defaults to `estimate`.
	 */
	source?: ContextSource;
}

export function UsageDisplay({
	provider,
	model,
	contextLimit,
	currentTokens,
	breakdown,
	messages,
	tokenizerName,
	getMessageTokens,
	source = 'estimate',
}: UsageDisplayProps) {
	const boxWidth = useTerminalWidth();
	const {colors} = useTheme();

	// Calculate percentages
	const percentUsed = contextLimit ? (currentTokens / contextLimit) * 100 : 0;
	const statusColor = getUsageStatusColor(percentUsed);
	const availableTokens = contextLimit ? contextLimit - currentTokens : 0;

	// Get the actual color from theme
	const progressColor =
		statusColor === 'success'
			? colors.success
			: statusColor === 'warning'
				? colors.warning
				: colors.error;

	// Calculate category percentages for breakdown bars
	const systemPercent = currentTokens
		? (breakdown.system / currentTokens) * 100
		: 0;
	const userPercent = currentTokens
		? (breakdown.userMessages / currentTokens) * 100
		: 0;
	const assistantPercent = currentTokens
		? (breakdown.assistantMessages / currentTokens) * 100
		: 0;
	const toolMessagesPercent = currentTokens
		? (breakdown.toolResults / currentTokens) * 100
		: 0;
	const toolDefsPercent = currentTokens
		? (breakdown.toolDefinitions / currentTokens) * 100
		: 0;

	// Calculate recent activity stats using cached token counts
	const last5Messages = messages.slice(-5);
	const last5TokenCount = last5Messages.reduce(
		(sum, msg) => sum + getMessageTokens(msg),
		0,
	);

	// Find largest message using cached token counts
	const largestMessageTokens =
		messages.length > 0
			? Math.max(...messages.map(msg => getMessageTokens(msg)))
			: 0;

	// Responsive layout calculations based on terminal width
	// For narrow terminals, reduce space for bars
	const barMaxWidth = Math.max(10, Math.min(30, boxWidth - 20));
	const mainProgressWidth = Math.max(20, Math.min(60, boxWidth - 12));

	return (
		<TitledBoxWithPreferences
			title={
				source === 'api'
					? 'Context Usage (API-reported)'
					: 'Context Usage (estimated)'
			}
			width={boxWidth}
			borderColor={colors.info}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
			marginBottom={1}
		>
			{/* Overall Usage */}
			<Box marginBottom={1}>
				<Text color={colors.primary} bold>
					Overall Usage
				</Text>
			</Box>
			<Box marginBottom={0}>
				<ProgressBar
					percent={percentUsed}
					width={mainProgressWidth}
					color={progressColor}
				/>
				<Text color={colors.text} bold>
					{' '}
					{Math.round(percentUsed)}%
				</Text>
			</Box>
			<Box marginBottom={1}>
				<Text color={colors.secondary}>
					{formatTokenCount(currentTokens)} /{' '}
					{contextLimit ? formatTokenCount(contextLimit) : 'Unknown'} tokens
				</Text>
			</Box>

			{/* Category Breakdown */}
			<Box marginTop={1} marginBottom={1}>
				<Text color={colors.primary} bold>
					Breakdown by Category
				</Text>
			</Box>

			{/* System Prompt */}
			<Box flexDirection="column" marginBottom={1}>
				<Box marginBottom={0}>
					<Text color={colors.info}>System Prompt:</Text>
				</Box>
				<Box flexDirection="row">
					<ProgressBar
						percent={systemPercent}
						width={barMaxWidth}
						color={colors.info}
					/>
					<Box marginLeft={1}>
						<Text color={colors.text}>
							{Math.round(systemPercent)}% ({formatTokenCount(breakdown.system)}
							)
						</Text>
					</Box>
				</Box>
			</Box>

			{/* User Messages */}
			<Box flexDirection="column" marginBottom={1}>
				<Box marginBottom={0}>
					<Text color={colors.secondary}>User Messages:</Text>
				</Box>
				<Box flexDirection="row">
					<ProgressBar
						percent={userPercent}
						width={barMaxWidth}
						color={colors.info}
					/>
					<Box marginLeft={1}>
						<Text color={colors.text}>
							{Math.round(userPercent)}% (
							{formatTokenCount(breakdown.userMessages)})
						</Text>
					</Box>
				</Box>
			</Box>

			{/* Assistant Messages */}
			<Box flexDirection="column" marginBottom={1}>
				<Box marginBottom={0}>
					<Text color={colors.secondary}>Assistant Messages:</Text>
				</Box>
				<Box flexDirection="row">
					<ProgressBar
						percent={assistantPercent}
						width={barMaxWidth}
						color={colors.info}
					/>
					<Box marginLeft={1}>
						<Text color={colors.text}>
							{Math.round(assistantPercent)}% (
							{formatTokenCount(breakdown.assistantMessages)})
						</Text>
					</Box>
				</Box>
			</Box>

			{/* Tool Messages */}
			<Box flexDirection="column" marginBottom={1}>
				<Box marginBottom={0}>
					<Text color={colors.secondary}>Tool Messages:</Text>
				</Box>
				<Box flexDirection="row">
					<ProgressBar
						percent={toolMessagesPercent}
						width={barMaxWidth}
						color={colors.info}
					/>
					<Box marginLeft={1}>
						<Text color={colors.text}>
							{Math.round(toolMessagesPercent)}% (
							{formatTokenCount(breakdown.toolResults)})
						</Text>
					</Box>
				</Box>
			</Box>

			{/* Tool Definitions */}
			<Box flexDirection="column" marginBottom={1}>
				<Box marginBottom={0}>
					<Text color={colors.secondary}>Tool Definitions:</Text>
				</Box>
				<Box flexDirection="row">
					<ProgressBar
						percent={toolDefsPercent}
						width={barMaxWidth}
						color={colors.info}
					/>
					<Box marginLeft={1}>
						<Text color={colors.text}>
							{Math.round(toolDefsPercent)}% (
							{formatTokenCount(breakdown.toolDefinitions)})
						</Text>
					</Box>
				</Box>
			</Box>

			{/* Available Tokens */}
			<Box marginTop={1} marginBottom={1}>
				<Text color={colors.secondary}>
					Available:{' '}
					<Text color={colors.success}>
						{formatTokenCount(availableTokens)} tokens
					</Text>
				</Text>
			</Box>

			{/* Model Information */}
			<Box marginTop={1} marginBottom={1}>
				<Text color={colors.primary} bold>
					Model Information
				</Text>
			</Box>
			<Box>
				<Text color={colors.secondary}>
					Provider: <Text color={colors.text}>{provider}</Text>
				</Text>
			</Box>
			<Box>
				<Text color={colors.secondary}>
					Model: <Text color={colors.text}>{model}</Text>
				</Text>
			</Box>
			<Box>
				<Text color={colors.secondary}>
					Context Limit:{' '}
					<Text color={colors.text}>
						{contextLimit ? formatTokenCount(contextLimit) : 'Unknown'}
					</Text>
				</Text>
			</Box>
			<Box marginBottom={1}>
				<Text color={colors.secondary}>
					Tokenizer: <Text color={colors.text}>{tokenizerName}</Text>
				</Text>
			</Box>

			{/* Recent Activity — always per-message client-side estimates (there
			    is no API-reported per-message breakdown), so mark them explicitly
			    when the rest of the panel shows API-reported figures. */}
			<Box marginTop={1} marginBottom={1}>
				<Text color={colors.primary} bold>
					{source === 'api' ? 'Recent Activity (estimated)' : 'Recent Activity'}
				</Text>
			</Box>
			<Box>
				<Text color={colors.secondary}>
					Last 5 messages:{' '}
					<Text color={colors.text}>
						{formatTokenCount(last5TokenCount)} tokens
					</Text>
				</Text>
			</Box>
			<Box>
				<Text color={colors.secondary}>
					Largest message:{' '}
					<Text color={colors.text}>
						{formatTokenCount(largestMessageTokens)} tokens
					</Text>
				</Text>
			</Box>
		</TitledBoxWithPreferences>
	);
}
