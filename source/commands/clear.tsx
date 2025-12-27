import {SuccessMessage} from '@/components/message-box';
import {generateKey} from '@/session';
import {Command} from '@/types/index';
import React from 'react';

function Clear() {
	return (
		<SuccessMessage hideBox={true} message="Chat Cleared."></SuccessMessage>
	);
}

export const clearCommand: Command = {
	name: 'clear',
	description: 'Clear the chat history and model context',
	handler: (_args: string[]) => {
		// Return info message saying chat was cleared
		return Promise.resolve(
			React.createElement(Clear, {
				key: generateKey('clear'),
			}),
		);
	},
};
