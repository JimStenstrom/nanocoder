import {Command} from '@/types/index';
import {Text} from 'ink';
import React from 'react';

// Note: The /setup-config command is handled via app-util.ts which calls
// onEnterConfigWizardMode() directly, not through this command handler.
// This export exists for command registration only.
export const setupConfigCommand: Command = {
	name: 'setup-config',
	description: 'Launch interactive configuration wizard',
	handler: () => {
		// This handler is never called - the command is intercepted in app-util.ts
		// and handled via the mode system (onEnterConfigWizardMode)
		return Promise.resolve(React.createElement(Text, {}, ''));
	},
};
