import {InfoMessage} from '@/components/message-box';
import {Command} from '@/types/index';
import {clearCurrentSession, getCurrentSession} from '@/usage/tracker';
import {getLogger} from '@/utils/logging';
import React from 'react';

export const exitCommand: Command = {
	name: 'exit',
	description: 'Exit the application',
	handler: (_args: string[], messages, metadata) => {
		const logger = getLogger();
		logger.debug('Exit command triggered', {
			messageCount: messages.length,
			hasTokenizer: !!metadata?.tokenizer,
		});

		// Save session usage before exit
		const usageSession = getCurrentSession();
		if (usageSession && metadata?.tokenizer) {
			try {
				usageSession.saveSession(messages, metadata.tokenizer);
				clearCurrentSession();
			} catch (error) {
				logger.error('Failed to save session on exit', {
					error: error instanceof Error ? error.message : String(error),
					sessionId: usageSession.getSessionInfo().id,
					messageCount: messages.length,
				});
				// Still clear to avoid memory leak
				clearCurrentSession();
			}
		} else {
			logger.debug('Session not saved on exit', {
				hasSession: !!usageSession,
				hasTokenizer: !!metadata?.tokenizer,
			});
		}

		// Return InfoMessage component first, then exit after a short delay
		setTimeout(() => {
			logger.debug('Calling process.exit(0)');
			process.exit(0);
		}, 500); // 500ms delay to allow message to render

		return Promise.resolve(
			React.createElement(InfoMessage, {
				message: 'Goodbye! 👋',
				hideTitle: true,
			}),
		);
	},
};
