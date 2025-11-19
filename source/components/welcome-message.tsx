import {TitledBox, titleStyles} from '@mishieck/ink-titled-box';
import {Box, Text} from 'ink';
import {memo} from 'react';

import {useTheme} from '@/hooks/useTheme';
import {useResponsiveTerminal} from '@/hooks/useTerminalWidth';

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json once at module load time to avoid repeated file reads
const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'),
) as {version: string};

export default memo(function WelcomeMessage() {
	const {boxWidth, isNarrow, isNormal} = useResponsiveTerminal();
	const {colors} = useTheme();

	return (
		<>
			{/* Narrow terminal: simple text without boxes */}
			{isNarrow ? (
				<>
					<Gradient colors={[colors.primary, colors.tool]}>
						<BigText text="NC" font="tiny" />
					</Gradient>
					<Box
						flexDirection="column"
						marginBottom={1}
						borderStyle="round"
						borderColor={colors.primary}
						paddingY={1}
						paddingX={2}
					>
						<Box marginBottom={1}>
							<Text color={colors.primary} bold>
								✻ Version {packageJson.version}
							</Text>
						</Box>

						<Text color={colors.white}>Quick tips:</Text>
						<Text color={colors.secondary}>• Use natural language</Text>
						<Text color={colors.secondary}>• /help for commands</Text>
						<Text color={colors.secondary}>• Ctrl+C to quit</Text>
					</Box>
				</>
			) : (
				/* Normal/Wide terminal: full version with TitledBox */
				<>
					<Gradient colors={[colors.primary, colors.tool]}>
						<BigText text="Nanocoder" font="tiny" />
					</Gradient>

					<TitledBox
						borderStyle="round"
						titles={[`✻ Welcome to Nanocoder ${packageJson.version}`]}
						titleStyles={titleStyles.pill}
						width={boxWidth}
						borderColor={colors.primary}
						paddingX={2}
						paddingY={1}
						flexDirection="column"
						marginBottom={1}
					>
						<Box paddingBottom={1}>
							<Text color={colors.white}>Tips for getting started:</Text>
						</Box>
						<Box paddingBottom={1} flexDirection="column">
							<Text color={colors.secondary}>
								{isNormal
									? '1. Use natural language to describe your task.'
									: '1. Use natural language to describe what you want to build.'}
							</Text>
							<Text color={colors.secondary}>
								2. Ask for file analysis, editing, bash commands and more.
							</Text>
							<Text color={colors.secondary}>
								{isNormal
									? '3. Be specific for best results.'
									: '3. Be specific as you would with another engineer for best results.'}
							</Text>
							<Text color={colors.secondary}>
								4. Type /exit or press Ctrl+C to quit.
							</Text>
						</Box>
						<Text color={colors.white}>/help for help</Text>
					</TitledBox>
				</>
			)}
		</>
	);
});
