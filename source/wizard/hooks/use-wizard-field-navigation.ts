import {useCallback, useState} from 'react';

export interface TemplateField {
	name: string;
	prompt: string;
	required?: boolean;
	default?: string;
	sensitive?: boolean;
	validator?: (value: string) => string | null;
}

export interface UseWizardFieldNavigationOptions {
	fields: TemplateField[];
	initialValues?: Record<string, string>;
	onComplete: (values: Record<string, string>) => void;
	onCancel: () => void;
}

export interface UseWizardFieldNavigationReturn {
	currentFieldIndex: number;
	currentField: TemplateField | null;
	fieldValues: Record<string, string>;
	currentValue: string;
	error: string | null;
	inputKey: number;
	setCurrentValue: (value: string) => void;
	setError: (error: string | null) => void;
	submitCurrentField: () => boolean;
	goToNextField: () => void;
	goToPreviousField: () => boolean;
	goToField: (index: number) => void;
	isFirstField: boolean;
	isLastField: boolean;
	reset: () => void;
}

/**
 * Hook to manage field-by-field navigation in wizard steps.
 *
 * Handles:
 * - Field value tracking
 * - Field validation
 * - Forward/backward navigation
 * - Input key management for cursor reset
 */
export function useWizardFieldNavigation({
	fields,
	initialValues = {},
	onComplete,
	onCancel,
}: UseWizardFieldNavigationOptions): UseWizardFieldNavigationReturn {
	const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
	const [fieldValues, setFieldValues] =
		useState<Record<string, string>>(initialValues);
	const [currentValue, setCurrentValue] = useState(
		initialValues[fields[0]?.name] || fields[0]?.default || '',
	);
	const [error, setError] = useState<string | null>(null);
	const [inputKey, setInputKey] = useState(0);

	const currentField = fields[currentFieldIndex] || null;
	const isFirstField = currentFieldIndex === 0;
	const isLastField = currentFieldIndex === fields.length - 1;

	const submitCurrentField = useCallback((): boolean => {
		if (!currentField) return false;

		const trimmedValue = currentValue.trim();

		// Validate required fields
		if (currentField.required && !trimmedValue) {
			setError('This field is required');
			return false;
		}

		// Validate with custom validator
		if (currentField.validator && trimmedValue) {
			const validationError = currentField.validator(trimmedValue);
			if (validationError) {
				setError(validationError);
				return false;
			}
		}

		// Save answer
		const newValues = {
			...fieldValues,
			[currentField.name]: trimmedValue,
		};
		setFieldValues(newValues);
		setError(null);

		// Check if this was the last field
		if (isLastField) {
			onComplete(newValues);
			return true;
		}

		// Move to next field
		const nextField = fields[currentFieldIndex + 1];
		setCurrentFieldIndex(currentFieldIndex + 1);
		setCurrentValue(newValues[nextField?.name] || nextField?.default || '');
		setInputKey(prev => prev + 1);

		return true;
	}, [
		currentField,
		currentValue,
		fieldValues,
		isLastField,
		fields,
		currentFieldIndex,
		onComplete,
	]);

	const goToNextField = useCallback(() => {
		if (currentFieldIndex < fields.length - 1) {
			const nextField = fields[currentFieldIndex + 1];
			setCurrentFieldIndex(currentFieldIndex + 1);
			setCurrentValue(fieldValues[nextField?.name] || nextField?.default || '');
			setInputKey(prev => prev + 1);
			setError(null);
		}
	}, [currentFieldIndex, fields, fieldValues]);

	const goToPreviousField = useCallback((): boolean => {
		if (currentFieldIndex > 0) {
			const prevField = fields[currentFieldIndex - 1];
			setCurrentFieldIndex(currentFieldIndex - 1);
			setCurrentValue(fieldValues[prevField?.name] || prevField?.default || '');
			setInputKey(prev => prev + 1);
			setError(null);
			return true;
		}
		// At first field, trigger cancel
		onCancel();
		return false;
	}, [currentFieldIndex, fields, fieldValues, onCancel]);

	const goToField = useCallback(
		(index: number) => {
			if (index >= 0 && index < fields.length) {
				const field = fields[index];
				setCurrentFieldIndex(index);
				setCurrentValue(fieldValues[field?.name] || field?.default || '');
				setInputKey(prev => prev + 1);
				setError(null);
			}
		},
		[fields, fieldValues],
	);

	const reset = useCallback(() => {
		setCurrentFieldIndex(0);
		setFieldValues(initialValues);
		setCurrentValue(initialValues[fields[0]?.name] || fields[0]?.default || '');
		setError(null);
		setInputKey(prev => prev + 1);
	}, [fields, initialValues]);

	return {
		currentFieldIndex,
		currentField,
		fieldValues,
		currentValue,
		error,
		inputKey,
		setCurrentValue,
		setError,
		submitCurrentField,
		goToNextField,
		goToPreviousField,
		goToField,
		isFirstField,
		isLastField,
		reset,
	};
}
