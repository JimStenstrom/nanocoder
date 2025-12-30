/**
 * Workflow Status Component
 *
 * Displays the current workflow phase and task progress
 */

import {Box, Text} from 'ink';
import {memo} from 'react';
import {TitledBox} from '@/components/ui/titled-box';
import {ProgressBar} from '@/components/usage/progress-bar';
import {useTheme} from '@/hooks/useTheme';
import type {TaskDefinition, WorkflowUIState} from '@/types/workflow';

interface WorkflowStatusProps {
	state: WorkflowUIState;
	width?: number;
}

/**
 * Get display name for workflow phase
 */
function getPhaseDisplayName(phase: WorkflowUIState['phase']): string {
	const names: Record<WorkflowUIState['phase'], string> = {
		idle: 'Idle',
		planning: 'Planning',
		plan_review: 'Plan Review',
		implementing: 'Implementing',
		reviewing: 'Reviewing',
		revision: 'Revision',
		complete: 'Complete',
	};
	return names[phase];
}

/**
 * Get color for workflow phase
 */
function getPhaseColor(
	phase: WorkflowUIState['phase'],
	colors: ReturnType<typeof useTheme>['colors'],
): string {
	switch (phase) {
		case 'planning':
		case 'plan_review':
			return colors.info;
		case 'implementing':
		case 'revision':
			return colors.warning;
		case 'reviewing':
			return colors.primary;
		case 'complete':
			return colors.success;
		default:
			return colors.secondary;
	}
}

/**
 * Get icon for workflow phase
 */
function getPhaseIcon(phase: WorkflowUIState['phase']): string {
	switch (phase) {
		case 'planning':
			return '📋';
		case 'plan_review':
			return '👀';
		case 'implementing':
			return '⚙️';
		case 'reviewing':
			return '🔍';
		case 'revision':
			return '🔄';
		case 'complete':
			return '✅';
		default:
			return '⏸️';
	}
}

/**
 * Task item display
 */
function TaskItem({
	task,
	colors,
}: {
	task: TaskDefinition;
	colors: ReturnType<typeof useTheme>['colors'];
}) {
	const statusColors: Record<TaskDefinition['status'], string> = {
		pending: colors.secondary,
		in_progress: colors.warning,
		completed: colors.success,
		failed: colors.error,
		needs_revision: colors.warning,
		skipped: colors.secondary,
	};

	const statusIcons: Record<TaskDefinition['status'], string> = {
		pending: '○',
		in_progress: '◐',
		completed: '●',
		failed: '✗',
		needs_revision: '↻',
		skipped: '⊘',
	};

	return (
		<Box>
			<Text color={statusColors[task.status]}>
				{statusIcons[task.status]} {task.title}
			</Text>
		</Box>
	);
}

/**
 * Main workflow status component
 */
export const WorkflowStatus = memo(function WorkflowStatus({
	state,
	width = 60,
}: WorkflowStatusProps) {
	const {colors} = useTheme();

	if (state.phase === 'idle' && !state.planId) {
		return null;
	}

	const {tasks} = state;
	const progressPercent =
		tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100) : 0;

	return (
		<TitledBox
			title="Workflow"
			width={width}
			borderColor={getPhaseColor(state.phase, colors)}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
			marginBottom={1}
		>
			{/* Phase indicator */}
			<Box marginBottom={1}>
				<Text bold color={getPhaseColor(state.phase, colors)}>
					{getPhaseIcon(state.phase)} {getPhaseDisplayName(state.phase)}
				</Text>
				{state.revisionCount > 0 && (
					<Text color={colors.warning}> (Revision {state.revisionCount})</Text>
				)}
			</Box>

			{/* Task progress */}
			{tasks.total > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Box marginBottom={1}>
						<Text color={colors.secondary}>
							Tasks: {tasks.completed}/{tasks.total}
							{tasks.failed > 0 && (
								<Text color={colors.error}> ({tasks.failed} failed)</Text>
							)}
						</Text>
					</Box>
					<Box>
						<ProgressBar
							percent={progressPercent}
							width={Math.min(30, width - 10)}
							color={tasks.failed > 0 ? colors.warning : colors.success}
						/>
						<Text color={colors.secondary}> {progressPercent}%</Text>
					</Box>
				</Box>
			)}

			{/* Current task */}
			{state.currentTask && (
				<Box flexDirection="column">
					<Text color={colors.info} bold>
						Current Task:
					</Text>
					<Box marginLeft={2}>
						<TaskItem task={state.currentTask} colors={colors} />
					</Box>
				</Box>
			)}

			{/* Plan ID for reference */}
			{state.planId && (
				<Box marginTop={1}>
					<Text color={colors.secondary} dimColor>
						Plan: {state.planId.substring(0, 20)}...
					</Text>
				</Box>
			)}
		</TitledBox>
	);
});

export default WorkflowStatus;
