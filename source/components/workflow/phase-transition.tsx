/**
 * Phase Transition Component
 *
 * Prompts user between workflow phases for confirmation
 */

import {Box, Text, useInput} from 'ink';
import {memo, useCallback} from 'react';
import {TitledBox} from '@/components/ui/titled-box';
import {useTheme} from '@/hooks/useTheme';
import type {WorkflowPhase} from '@/types/workflow';

interface PhaseTransitionProps {
	fromPhase: WorkflowPhase;
	toPhase: WorkflowPhase;
	summary?: string;
	onProceed: () => void;
	onCancel: () => void;
	width?: number;
}

/**
 * Get display info for phase transitions
 */
function getTransitionInfo(
	from: WorkflowPhase,
	to: WorkflowPhase,
): {title: string; description: string; icon: string} {
	if (from === 'planning' && to === 'plan_review') {
		return {
			title: 'Planning Complete',
			description: 'Review the plan before implementation begins.',
			icon: '📋',
		};
	}
	if (from === 'plan_review' && to === 'implementing') {
		return {
			title: 'Starting Implementation',
			description: 'The coding model will now implement the plan.',
			icon: '⚙️',
		};
	}
	if (from === 'implementing' && to === 'reviewing') {
		return {
			title: 'Implementation Complete',
			description: 'All tasks finished. Starting code review.',
			icon: '🔍',
		};
	}
	if (from === 'reviewing' && to === 'complete') {
		return {
			title: 'Review Approved',
			description: 'All changes have been approved.',
			icon: '✅',
		};
	}
	if (from === 'reviewing' && to === 'revision') {
		return {
			title: 'Revisions Requested',
			description: 'Some changes need to be revised.',
			icon: '🔄',
		};
	}
	if (from === 'revision' && to === 'reviewing') {
		return {
			title: 'Revisions Complete',
			description: 'Ready for another review.',
			icon: '🔍',
		};
	}

	return {
		title: `Phase: ${to}`,
		description: `Transitioning from ${from} to ${to}`,
		icon: '→',
	};
}

/**
 * Phase transition confirmation component
 */
export const PhaseTransition = memo(function PhaseTransition({
	fromPhase,
	toPhase,
	summary,
	onProceed,
	onCancel,
	width = 60,
}: PhaseTransitionProps) {
	const {colors} = useTheme();
	const info = getTransitionInfo(fromPhase, toPhase);

	const handleInput = useCallback(
		(input: string, key: {return?: boolean; escape?: boolean}) => {
			if (key.return) {
				onProceed();
			} else if (key.escape) {
				onCancel();
			}
		},
		[onProceed, onCancel],
	);

	useInput(handleInput);

	return (
		<TitledBox
			title={info.title}
			width={width}
			borderColor={colors.info}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
		>
			{/* Icon and description */}
			<Box marginBottom={1}>
				<Text>
					{info.icon} {info.description}
				</Text>
			</Box>

			{/* Summary if provided */}
			{summary && (
				<Box
					flexDirection="column"
					marginBottom={1}
					borderStyle="single"
					borderColor={colors.secondary}
					paddingX={1}
				>
					<Text color={colors.secondary} bold>
						Summary:
					</Text>
					<Text color={colors.secondary}>{summary}</Text>
				</Box>
			)}

			{/* Action prompt */}
			<Box marginTop={1}>
				<Text color={colors.success} bold>
					[Enter]
				</Text>
				<Text color={colors.secondary}> Proceed </Text>
				<Text color={colors.error} bold>
					[Esc]
				</Text>
				<Text color={colors.secondary}> Cancel</Text>
			</Box>
		</TitledBox>
	);
});

export default PhaseTransition;
