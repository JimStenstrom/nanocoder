import {InfoMessage} from '@/components/message-box';
import {Command} from '@/types/index';
import {clearCurrentSession, getCurrentSession} from '@/usage/tracker';
import React from 'react';

export const exitCommand: Command = {
	name: 'exit',
	description: 'Exit the application',
	handler: (_args: string[], messages, metadata) => {
		// Save session usage before exit
		const usageSession = getCurrentSession();
		if (usageSession && metadata?.tokenizer) {
			usageSession.saveSession(messages, metadata.tokenizer);
			clearCurrentSession();
		}

		// Return InfoMessage component first, then exit after a short delay
		setTimeout(() => {
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
