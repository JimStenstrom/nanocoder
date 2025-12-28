/**
 * /resume command
 * Resume a previous chat session
 */

import {TitledBox} from '@/components/ui/titled-box';
import {useTerminalWidth} from '@/hooks/useTerminalWidth';
import {useTheme} from '@/hooks/useTheme';
import {generateKey, sessionManager, sessionService} from '@/session';
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

interface ResumeSuccessProps {
	sessionName: string;
	messageCount: number;
}

function ResumeSuccess({sessionName, messageCount}: ResumeSuccessProps) {
	const boxWidth = useTerminalWidth();
	const {colors} = useTheme();

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
			<Text color={colors.primary}>
				Session restored: {sessionName} ({messageCount} messages)
			</Text>
		</TitledBox>
	);
}

interface ResumeErrorProps {
	message: string;
}

function ResumeError({message}: ResumeErrorProps) {
	const boxWidth = useTerminalWidth();
	const {colors} = useTheme();

	return (
		<TitledBox
			title="/resume"
			width={boxWidth}
			borderColor={colors.error}
			paddingX={2}
			paddingY={1}
			flexDirection="column"
			marginBottom={1}
		>
			<Text color={colors.error}>{message}</Text>
		</TitledBox>
	);
}

export const resumeCommand: Command = {
	name: 'resume',
	description: 'Resume a previous chat session',
	handler: async (args: string[], _messages, _metadata) => {
		const subcommand = args[0];

		// /resume - list sessions
		if (!subcommand) {
			const sessions = await sessionManager.listSessions({limit: 10});
			return React.createElement(ResumeList, {
				key: generateKey('resume-list'),
				sessions,
			});
		}

		// /resume last - resume most recent session
		if (subcommand === 'last') {
			const session = await sessionManager.getLastSession();
			if (!session) {
				return React.createElement(ResumeError, {
					key: generateKey('resume-error'),
					message: 'No previous session found.',
				});
			}

			// Restore session identity
			sessionService.restore({
				id: session.id,
				createdAt: session.createdAt,
			});

			return React.createElement(ResumeSuccess, {
				key: generateKey('resume-success'),
				sessionName: session.name,
				messageCount: session.messageCount,
			});
		}

		// /resume <id> or /resume <number>
		let sessionId = subcommand;

		// If it's a number, get session by index
		const index = Number.parseInt(subcommand, 10);
		if (!Number.isNaN(index) && index > 0) {
			const sessions = await sessionManager.listSessions({limit: index});
			if (sessions.length < index) {
				return React.createElement(ResumeError, {
					key: generateKey('resume-error'),
					message: `Session #${index} not found. Only ${sessions.length} sessions available.`,
				});
			}
			sessionId = sessions[index - 1].id;
		}

		// Load session by ID
		const session = await sessionManager.loadSession(sessionId);
		if (!session) {
			return React.createElement(ResumeError, {
				key: generateKey('resume-error'),
				message: `Session '${sessionId}' not found.`,
			});
		}

		// Restore session identity
		sessionService.restore({
			id: session.id,
			createdAt: session.createdAt,
		});

		return React.createElement(ResumeSuccess, {
			key: generateKey('resume-success'),
			sessionName: session.name,
			messageCount: session.messageCount,
		});
	},
};
