/**
 * Review Display Component
 *
 * Shows the results of a code review phase
 */

import {Box, Text} from 'ink';
import {memo} from 'react';
import {TitledBox} from '@/components/ui/titled-box';
import {useTheme} from '@/hooks/useTheme';
import type {ReviewResult, TaskReviewFeedback} from '@/types/workflow';

interface ReviewDisplayProps {
	review: ReviewResult;
	width?: number;
}

/**
 * Individual task feedback display
 */
function TaskFeedbackItem({
	feedback,
	colors,
}: {
	feedback: TaskReviewFeedback;
	colors: ReturnType<typeof useTheme>['colors'];
}) {
	const statusIcon = feedback.passed ? '✓' : '✗';
	const statusColor = feedback.passed ? colors.success : colors.error;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color={statusColor} bold>
				{statusIcon} Task: {feedback.taskId}
			</Text>

			{/* Criteria results */}
			{feedback.criteriaResults.length > 0 && (
				<Box flexDirection="column" marginLeft={2}>
					{feedback.criteriaResults.map((cr, idx) => (
						<Text key={idx} color={cr.met ? colors.success : colors.error}>
							{cr.met ? '✓' : '✗'} {cr.criterion}
							{cr.notes && <Text color={colors.secondary}> - {cr.notes}</Text>}
						</Text>
					))}
				</Box>
			)}

			{/* Issues */}
			{feedback.issues.length > 0 && (
				<Box flexDirection="column" marginLeft={2}>
					<Text color={colors.warning}>Issues:</Text>
					{feedback.issues.map((issue, idx) => (
						<Text key={idx} color={colors.warning}>
							• {issue}
						</Text>
					))}
				</Box>
			)}

			{/* Suggestions */}
			{feedback.suggestions.length > 0 && (
				<Box flexDirection="column" marginLeft={2}>
					<Text color={colors.info}>Suggestions:</Text>
					{feedback.suggestions.map((suggestion, idx) => (
						<Text key={idx} color={colors.info}>
							• {suggestion}
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}

/**
 * Main review display component
 */
export const ReviewDisplay = memo(function ReviewDisplay({
	review,
	width = 60,
}: ReviewDisplayProps) {
	const {colors} = useTheme();

	const headerColor = review.approved ? colors.success : colors.warning;
	const headerIcon = review.approved ? '✅' : '⚠️';
	const headerText = review.approved ? 'Review Approved' : 'Revisions Needed';

	return (
		<TitledBox
			title="Code Review Results"
			width={width}
			borderColor={headerColor}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
		>
			{/* Header with approval status */}
			<Box marginBottom={1}>
				<Text color={headerColor} bold>
					{headerIcon} {headerText}
				</Text>
				{review.qualityScore !== undefined && (
					<Text color={colors.secondary}>
						{' '}
						(Quality Score: {review.qualityScore}/100)
					</Text>
				)}
			</Box>

			{/* Overall feedback */}
			{review.overallFeedback && (
				<Box
					flexDirection="column"
					marginBottom={1}
					borderStyle="single"
					borderColor={colors.secondary}
					paddingX={1}
				>
					<Text color={colors.secondary}>{review.overallFeedback}</Text>
				</Box>
			)}

			{/* Critical issues */}
			{review.criticalIssues.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Text color={colors.error} bold>
						Critical Issues:
					</Text>
					{review.criticalIssues.map((issue, idx) => (
						<Text key={idx} color={colors.error}>
							• {issue}
						</Text>
					))}
				</Box>
			)}

			{/* Task feedback */}
			{review.taskFeedback.length > 0 && (
				<Box flexDirection="column">
					<Text color={colors.info} bold>
						Task Results:
					</Text>
					<Box flexDirection="column" marginLeft={1}>
						{review.taskFeedback.map(feedback => (
							<TaskFeedbackItem
								key={feedback.taskId}
								feedback={feedback}
								colors={colors}
							/>
						))}
					</Box>
				</Box>
			)}

			{/* Revision tasks */}
			{review.revisionTasks.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color={colors.warning} bold>
						Required Revisions ({review.revisionTasks.length}):
					</Text>
					{review.revisionTasks.map((task, idx) => (
						<Text key={idx} color={colors.warning}>
							• {task.title}: {task.description}
						</Text>
					))}
				</Box>
			)}
		</TitledBox>
	);
});

export default ReviewDisplay;
