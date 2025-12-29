import {Box} from 'ink';
import React from 'react';
import ChatQueue from '@/components/chat-queue';

export interface ChatHistoryProps {
	/** Whether the chat has started (ready to display) */
	startChat: boolean;
	/** Static components that are frozen at the top (welcome, status) */
	staticComponents: React.ReactNode[];
	/** Dynamic components added during the chat session */
	queuedComponents: React.ReactNode[];
}

/**
 * Chat history component that displays frozen and dynamic chat content.
 *
 * IMPORTANT: This component should NEVER be conditionally unmounted.
 * It contains ink's Static component which holds frozen terminal output.
 * Unmounting causes the Static content to be destroyed and recreated,
 * leading to memory issues and visual glitches.
 *
 * Use ChatInput separately for the input area, which can mount/unmount freely.
 */
export function ChatHistory({
	startChat,
	staticComponents,
	queuedComponents,
}: ChatHistoryProps): React.ReactElement {
	return (
		<Box flexGrow={1} flexDirection="column" minHeight={0}>
			{startChat && (
				<ChatQueue
					staticComponents={staticComponents}
					queuedComponents={queuedComponents}
				/>
			)}
		</Box>
	);
}
