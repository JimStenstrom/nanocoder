import {useCallback, useState} from 'react';

export interface UseEditDeleteOptions<T> {
	items: T[];
	onEdit: (item: T, index: number) => void;
	onDelete: (item: T, index: number) => void;
}

export interface UseEditDeleteReturn<T> {
	selectedIndex: number | null;
	selectedItem: T | null;
	showConfirmation: boolean;
	selectItem: (index: number) => void;
	confirmEdit: () => void;
	confirmDelete: () => void;
	cancel: () => void;
}

/**
 * Hook to manage edit/delete workflow state for wizard items.
 *
 * Handles:
 * - Item selection
 * - Edit/delete confirmation flow
 * - State cleanup after actions
 */
export function useEditDelete<T>({
	items,
	onEdit,
	onDelete,
}: UseEditDeleteOptions<T>): UseEditDeleteReturn<T> {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [showConfirmation, setShowConfirmation] = useState(false);

	const selectedItem =
		selectedIndex !== null && selectedIndex < items.length
			? items[selectedIndex]
			: null;

	const selectItem = useCallback((index: number) => {
		setSelectedIndex(index);
		setShowConfirmation(true);
	}, []);

	const confirmEdit = useCallback(() => {
		if (selectedIndex !== null && selectedItem !== null) {
			onEdit(selectedItem, selectedIndex);
		}
		setSelectedIndex(null);
		setShowConfirmation(false);
	}, [selectedIndex, selectedItem, onEdit]);

	const confirmDelete = useCallback(() => {
		if (selectedIndex !== null && selectedItem !== null) {
			onDelete(selectedItem, selectedIndex);
		}
		setSelectedIndex(null);
		setShowConfirmation(false);
	}, [selectedIndex, selectedItem, onDelete]);

	const cancel = useCallback(() => {
		setSelectedIndex(null);
		setShowConfirmation(false);
	}, []);

	return {
		selectedIndex,
		selectedItem,
		showConfirmation,
		selectItem,
		confirmEdit,
		confirmDelete,
		cancel,
	};
}
