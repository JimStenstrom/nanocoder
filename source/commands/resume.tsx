/**
 * /resume command
 * Resume a previous chat session
 */

import {TitledBox} from '@/components/ui/titled-box';
import {useTerminalWidth} from '@/hooks/useTerminalWidth';
import {useTheme} from '@/hooks/useTheme';
import {generateKey, sessionManager} from '@/session';
import type {SessionMetadata} from '@/session';
import type {Command} from '@/types/commands';
import {Box, Text} from 'ink';
import React from 'react';

interface ResumeListProps {
	sessions: SessionMetadata[];
	onSelect?: (sessionId: string) => void;
}

function ResumeList({sessions}: ResumeListProps) {
	const boxWidth = useTerminalWidth();
	const {colors} = useTheme();

	const formatDate = (timestamp: number): string => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

	return (
		<TitledBox
			title="/resume"
			width={boxWidth}
			borderColor={colors.primary}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
			marginBottom={1}
		>
			<Box marginBottom={1}>
				<Text color={colors.primary} bold>
					Recent Sessions
				</Text>
			</Box>

			{sessions.length === 0 ? (
				<Text color={colors.secondary}>No saved sessions found.</Text>
			) : (
				<>
					<Text color={colors.secondary}>
						Use /resume {'<id>'} or /resume last to restore a session.
					</Text>
					<Box marginTop={1} flexDirection="column">
						{sessions.map((session, index) => (
							<Box key={session.id} marginBottom={1}>
								<Text color={colors.white}>
									{index + 1}. [{session.id}]{' '}
									<Text color={colors.primary}>{session.name}</Text>
								</Text>
								<Text color={colors.secondary}>
									{' '}
									- {session.messageCount} msgs,{' '}
									{formatDate(session.lastAccessedAt)}
								</Text>
							</Box>
						))}
					</Box>
				</>
			)}
		</TitledBox>
	);
}

export const resumeCommand: Command = {
	name: 'resume',
	description: 'Resume a previous chat session',
	handler: async (_args: string[], _messages, _metadata) => {
		// This handler only shows the session list.
		// Actual session restoration with message loading is handled by
		// handleResumeCommand in app-util.ts which has access to setMessages.
		const sessions = await sessionManager.listSessions({limit: 10});
		return React.createElement(ResumeList, {
			key: generateKey('resume-list'),
			sessions,
		});
	},
};
