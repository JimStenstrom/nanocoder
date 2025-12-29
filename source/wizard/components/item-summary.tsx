import {Box, Text} from 'ink';
import {colors} from '@/config/index';

export interface ItemSummaryProps {
	items: string[];
	label?: string;
}

/**
 * Component to display a summary of added items.
 *
 * Used to show "Added: X, Y, Z" or "X provider(s) already added"
 */
export function ItemSummary({items, label = 'Added'}: ItemSummaryProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<Box marginBottom={1}>
			<Text color={colors.success}>
				{label}: {items.join(', ')}
			</Text>
		</Box>
	);
}

export interface ItemCountSummaryProps {
	count: number;
	singular: string;
	plural: string;
	suffix?: string;
}

/**
 * Component to display a count summary.
 *
 * Used to show "X provider(s) already added" style messages.
 */
export function ItemCountSummary({
	count,
	singular,
	plural,
	suffix = 'already added',
}: ItemCountSummaryProps) {
	if (count === 0) {
		return null;
	}

	const noun = count === 1 ? singular : plural;

	return (
		<Box marginBottom={1}>
			<Text color={colors.success}>
				{count} {noun} {suffix}
			</Text>
		</Box>
	);
}
