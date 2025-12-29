import {Box, Text} from 'ink';
import React from 'react';
import type {useTheme} from '@/hooks/useTheme';
import type {DevelopmentMode} from '@/types/core';
import {DEVELOPMENT_MODE_LABELS} from '@/types/core';

interface DevelopmentModeIndicatorProps {
	developmentMode: DevelopmentMode;
	colors: ReturnType<typeof useTheme>['colors'];
}

/**
 * Development mode indicator component
 * Shows the current development mode (normal/auto-accept/plan) and instructions
 * Always visible to help users understand the current mode
 */
export const DevelopmentModeIndicator = React.memo(
	({developmentMode, colors}: DevelopmentModeIndicatorProps) => {
		return (
			<Box marginTop={1}>
				<Text
					color={
						developmentMode === 'normal'
							? colors.secondary
							: developmentMode === 'auto-accept'
								? colors.info
								: colors.warning
					}
				>
					<Text bold>{DEVELOPMENT_MODE_LABELS[developmentMode]}</Text>{' '}
					<Text dimColor>(Shift+Tab to cycle)</Text>
				</Text>
			</Box>
		);
	},
);

DevelopmentModeIndicator.displayName = 'DevelopmentModeIndicator';
