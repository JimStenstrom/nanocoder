/**
 * Task List Component
 *
 * Displays the list of tasks in the execution plan
 */

import {Box, Text} from 'ink';
import {memo} from 'react';
import {TitledBox} from '@/components/ui/titled-box';
import {useTheme} from '@/hooks/useTheme';
import type {ExecutionPlan, TaskDefinition} from '@/types/workflow';

interface TaskListProps {
	plan: ExecutionPlan;
	showDetails?: boolean;
	maxTasks?: number;
	width?: number;
}

/**
 * Get status icon for a task
 */
function getStatusIcon(status: TaskDefinition['status']): string {
	const icons: Record<TaskDefinition['status'], string> = {
		pending: '○',
		in_progress: '◐',
		completed: '●',
		failed: '✗',
		needs_revision: '↻',
		skipped: '⊘',
	};
	return icons[status];
}

/**
 * Get priority indicator
 */
function getPriorityIndicator(priority: TaskDefinition['priority']): string {
	const indicators: Record<TaskDefinition['priority'], string> = {
		critical: '!!!',
		high: '!!',
		medium: '!',
		low: '',
	};
	return indicators[priority];
}

/**
 * Single task item
 */
function TaskItem({
	task,
	index,
	showDetails,
	colors,
}: {
	task: TaskDefinition;
	index: number;
	showDetails: boolean;
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

	const priorityColors: Record<TaskDefinition['priority'], string> = {
		critical: colors.error,
		high: colors.warning,
		medium: colors.info,
		low: colors.secondary,
	};

	return (
		<Box flexDirection="column" marginBottom={showDetails ? 1 : 0}>
			{/* Main task line */}
			<Box>
				<Text color={statusColors[task.status]}>
					{getStatusIcon(task.status)}
				</Text>
				<Text color={colors.secondary}> {index + 1}. </Text>
				<Text color={statusColors[task.status]}>{task.title}</Text>
				{getPriorityIndicator(task.priority) && (
					<Text color={priorityColors[task.priority]}>
						{' '}
						[{getPriorityIndicator(task.priority)}]
					</Text>
				)}
			</Box>

			{/* Details if enabled */}
			{showDetails && (
				<Box flexDirection="column" marginLeft={3}>
					{/* Description */}
					{task.description && (
						<Text color={colors.secondary} wrap="wrap">
							{task.description.substring(0, 100)}
							{task.description.length > 100 ? '...' : ''}
						</Text>
					)}

					{/* Target files */}
					{task.targetFiles.length > 0 && (
						<Text color={colors.secondary}>
							Files: {task.targetFiles.slice(0, 3).join(', ')}
							{task.targetFiles.length > 3
								? ` +${task.targetFiles.length - 3} more`
								: ''}
						</Text>
					)}

					{/* Dependencies */}
					{task.dependencies.length > 0 && (
						<Text color={colors.secondary}>
							Depends on: {task.dependencies.join(', ')}
						</Text>
					)}

					{/* Acceptance criteria count */}
					{task.acceptanceCriteria.length > 0 && (
						<Text color={colors.secondary}>
							Criteria: {task.acceptanceCriteria.length}
						</Text>
					)}

					{/* Result summary if completed */}
					{task.result && (
						<Text
							color={
								task.status === 'completed' ? colors.success : colors.error
							}
						>
							→ {task.result.summary.substring(0, 80)}
							{task.result.summary.length > 80 ? '...' : ''}
						</Text>
					)}

					{/* Revision notes if needs revision */}
					{task.revisionNotes && (
						<Text color={colors.warning}>
							Revision: {task.revisionNotes.substring(0, 80)}
							{task.revisionNotes.length > 80 ? '...' : ''}
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}

/**
 * Main task list component
 */
export const TaskList = memo(function TaskList({
	plan,
	showDetails = false,
	maxTasks,
	width = 60,
}: TaskListProps) {
	const {colors} = useTheme();

	const tasksToShow = maxTasks ? plan.tasks.slice(0, maxTasks) : plan.tasks;
	const hiddenCount = maxTasks ? Math.max(0, plan.tasks.length - maxTasks) : 0;

	const completed = plan.tasks.filter(t => t.status === 'completed').length;
	const failed = plan.tasks.filter(t => t.status === 'failed').length;
	const inProgress = plan.tasks.filter(t => t.status === 'in_progress').length;

	return (
		<TitledBox
			title={`Tasks (${completed}/${plan.tasks.length})`}
			width={width}
			borderColor={colors.info}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
		>
			{/* Summary stats */}
			<Box marginBottom={1}>
				<Text color={colors.success}>✓ {completed}</Text>
				<Text color={colors.secondary}> | </Text>
				{inProgress > 0 && (
					<>
						<Text color={colors.warning}>◐ {inProgress}</Text>
						<Text color={colors.secondary}> | </Text>
					</>
				)}
				{failed > 0 && (
					<>
						<Text color={colors.error}>✗ {failed}</Text>
						<Text color={colors.secondary}> | </Text>
					</>
				)}
				<Text color={colors.secondary}>
					○ {plan.tasks.length - completed - failed - inProgress}
				</Text>
			</Box>

			{/* Task list */}
			<Box flexDirection="column">
				{tasksToShow.map((task, idx) => (
					<TaskItem
						key={task.id}
						task={task}
						index={idx}
						showDetails={showDetails}
						colors={colors}
					/>
				))}
			</Box>

			{/* Hidden count */}
			{hiddenCount > 0 && (
				<Box marginTop={1}>
					<Text color={colors.secondary}>... and {hiddenCount} more tasks</Text>
				</Box>
			)}
		</TitledBox>
	);
});

export default TaskList;
