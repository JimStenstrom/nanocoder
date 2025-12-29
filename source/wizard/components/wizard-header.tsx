import {Box, Text} from 'ink';
import {colors} from '@/config/index';

export interface WizardHeaderProps {
	title: string;
	subtitle?: string;
	fieldProgress?: {
		current: number;
		total: number;
	};
}

/**
 * Consistent header component for wizard configuration screens.
 *
 * Displays:
 * - Bold primary title
 * - Optional subtitle
 * - Optional field progress indicator (Field X/Y)
 */
export function WizardHeader({
	title,
	subtitle,
	fieldProgress,
}: WizardHeaderProps) {
	return (
		<Box marginBottom={1}>
			<Text bold color={colors.primary}>
				{title}
			</Text>
			{fieldProgress && (
				<Text dimColor>
					{' '}
					(Field {fieldProgress.current}/{fieldProgress.total})
				</Text>
			)}
			{subtitle && <Text dimColor> {subtitle}</Text>}
		</Box>
	);
}
