import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import {colors} from '@/config/index';
import {NavigationHints, SELECTION_HINTS} from './navigation-hints';

export interface EditDeleteMenuProps {
	itemName: string;
	itemType?: string;
	onEdit: () => void;
	onDelete: () => void;
}

interface MenuOption {
	label: string;
	value: 'edit' | 'delete';
}

/**
 * Reusable edit/delete confirmation menu for wizard items.
 *
 * Displays:
 * - Item name with "What would you like to do?" prompt
 * - Edit and Delete options
 * - Navigation hints
 */
export function EditDeleteMenu({
	itemName,
	itemType = 'item',
	onEdit,
	onDelete,
}: EditDeleteMenuProps) {
	const options: MenuOption[] = [
		{label: `Edit this ${itemType}`, value: 'edit'},
		{label: `Delete this ${itemType}`, value: 'delete'},
	];

	const handleSelect = (item: MenuOption) => {
		if (item.value === 'edit') {
			onEdit();
		} else {
			onDelete();
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color={colors.primary}>
					{itemName} - What would you like to do?
				</Text>
			</Box>
			<SelectInput items={options} onSelect={handleSelect} />
			<Box marginTop={1}>
				<NavigationHints hints={SELECTION_HINTS} />
			</Box>
		</Box>
	);
}
