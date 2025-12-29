import {colors} from '@/config/index';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';

/**
 * Minimal field interface for WizardFieldInput.
 * Compatible with both provider and MCP template fields.
 */
export interface WizardField {
	name: string;
	prompt: string;
	required?: boolean;
	default?: string;
	sensitive?: boolean;
}

export interface WizardFieldInputProps {
	field: WizardField;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	error?: string | null;
	inputKey?: number;
	showDefault?: boolean;
}

/**
 * Reusable field input component for wizard steps.
 *
 * Handles:
 * - Regular text input
 * - Masked input for sensitive fields
 * - Field prompt display
 * - Required field indicator
 * - Default value display
 * - Error message display
 */
export function WizardFieldInput({
	field,
	value,
	onChange,
	onSubmit,
	error,
	inputKey = 0,
	showDefault = false,
}: WizardFieldInputProps) {
	return (
		<Box flexDirection="column">
			<Box>
				<Text>
					{field.prompt}
					{field.required && <Text color={colors.error}> *</Text>}
					{showDefault && field.default && (
						<Text dimColor> [{field.default}]</Text>
					)}
					: {field.sensitive && '****'}
				</Text>
			</Box>

			<Box marginBottom={1} borderStyle="round" borderColor={colors.secondary}>
				<TextInput
					key={inputKey}
					value={value}
					onChange={onChange}
					onSubmit={onSubmit}
					mask={field.sensitive ? '*' : undefined}
				/>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color={colors.error}>{error}</Text>
				</Box>
			)}
		</Box>
	);
}
