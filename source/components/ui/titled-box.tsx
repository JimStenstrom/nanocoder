import type {BoxProps} from 'ink';
import {Box, Text} from 'ink';
import React from 'react';

export interface TitledBoxProps extends Omit<BoxProps, 'borderStyle'> {
	/** Title to display in the top border */
	title: string;
	/** Border color */
	borderColor?: string;
	/** Children to render inside the box */
	children: React.ReactNode;
}

/**
 * A simple titled box component that displays a title in pill style
 * above a bordered box. Replacement for @mishieck/ink-titled-box.
 */
export function TitledBox({
	title,
	borderColor,
	children,
	width,
	paddingX,
	paddingY,
	flexDirection,
	marginBottom,
	...boxProps
}: TitledBoxProps) {
	return (
		<Box
			flexDirection="column"
			width={width}
			marginBottom={marginBottom}
			{...boxProps}
		>
			{/* Title row with pill styling */}
			<Box>
				<Text backgroundColor={borderColor} color="black" bold>
					{' '}
					{title}{' '}
				</Text>
			</Box>

			{/* Content box with border */}
			<Box
				borderStyle="round"
				borderColor={borderColor}
				paddingX={paddingX}
				paddingY={paddingY}
				flexDirection={flexDirection}
				width={width}
			>
				{children}
			</Box>
		</Box>
	);
}
