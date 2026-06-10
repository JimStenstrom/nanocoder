import test from 'ava';
import type {InputState, PastePlaceholderContent} from '../types/hooks';
import {PlaceholderType} from '../types/hooks';
import {
	findPlaceholderAtPosition,
	handleAtomicDeletion,
	wouldPartiallyDeletePlaceholder,
} from './atomic-deletion';

console.log(`\natomic-deletion.spec.ts`);

// Tests for atomic placeholder deletion
test('handleAtomicDeletion removes placeholder when backspaced', t => {
	const previousState: InputState = {
		displayValue: 'Analyze this: [Paste #123: 500 chars] code',
		placeholderContent: {
			'123': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #123: 500 chars]',
				content: 'console.log("hello world");',
				originalSize: 500,
			} as PastePlaceholderContent,
		},
	};

	// Simulate backspacing from the end of the placeholder
	const newText = 'Analyze this: [Paste #123: 500 char code';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'Analyze this:  code');
	t.deepEqual(result!.placeholderContent, {});
});

test('handleAtomicDeletion removes placeholder when deleted from middle', t => {
	const previousState: InputState = {
		displayValue: 'Before [Paste #456: 200 chars] after',
		placeholderContent: {
			'456': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #456: 200 chars]',
				content: 'function test() { return true; }',
				originalSize: 200,
			} as PastePlaceholderContent,
		},
	};

	// Simulate deleting part of the placeholder
	const newText = 'Before [Paste #456: 200 ch after';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'Before  after');
	t.deepEqual(result!.placeholderContent, {});
});

test('handleAtomicDeletion preserves other placeholders', t => {
	const previousState: InputState = {
		displayValue:
			'First [Paste #111: 100 chars] second [Paste #222: 200 chars]',
		placeholderContent: {
			'111': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #111: 100 chars]',
				content: 'first content',
				originalSize: 100,
			} as PastePlaceholderContent,
			'222': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #222: 200 chars]',
				content: 'second content',
				originalSize: 200,
			} as PastePlaceholderContent,
		},
	};

	// Delete part of first placeholder
	const newText = 'First [Paste #111: 100 ch second [Paste #222: 200 chars]';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'First  second [Paste #222: 200 chars]');
	t.deepEqual(result!.placeholderContent, {
		'222': {
			type: PlaceholderType.PASTE,
			displayText: '[Paste #222: 200 chars]',
			content: 'second content',
			originalSize: 200,
		} as PastePlaceholderContent,
	});
});

test('handleAtomicDeletion returns null for normal deletions', t => {
	const previousState: InputState = {
		displayValue: 'Normal text here',
		placeholderContent: {},
	};

	const newText = 'Normal text her';

	const result = handleAtomicDeletion(previousState, newText);

	t.is(result, null);
});

test('handleAtomicDeletion returns null for additions', t => {
	const previousState: InputState = {
		displayValue: 'Short text',
		placeholderContent: {},
	};

	const newText = 'Short text with more';

	const result = handleAtomicDeletion(previousState, newText);

	t.is(result, null);
});

test('findPlaceholderAtPosition finds placeholder ID', t => {
	const text = 'Before [Paste #789: 300 chars] after';

	// Position inside the placeholder
	const result1 = findPlaceholderAtPosition(text, 10); // Inside "[Paste #789: 300 chars]"
	t.is(result1, '789');

	// Position outside the placeholder
	const result2 = findPlaceholderAtPosition(text, 0); // In "Before"
	t.is(result2, null);

	// Position after placeholder
	const result3 = findPlaceholderAtPosition(text, 35); // In "after"
	t.is(result3, null);
});

test('wouldPartiallyDeletePlaceholder detects partial deletion', t => {
	const text = 'Text [Paste #123: 100 chars] more';
	//       01234567890123456789012345678901234
	//       0         1         2         3
	// Placeholder is at position 5-28 (length 23)

	// Partial deletion from middle of placeholder
	const result1 = wouldPartiallyDeletePlaceholder(text, 8, 5); // Delete "Paste"
	t.true(result1);

	// Complete deletion of placeholder - delete from position 5, length 23
	const result2 = wouldPartiallyDeletePlaceholder(text, 5, 23); // Delete entire "[Paste #123: 100 chars]"
	t.false(result2);

	// Deletion outside placeholder
	const result3 = wouldPartiallyDeletePlaceholder(text, 0, 4); // Delete "Text"
	t.false(result3);
});

// Integration test showing complete flow
test('atomic deletion works with multiple placeholders', t => {
	const previousState: InputState = {
		displayValue:
			'Compare [Paste #111: 50 chars] with [Paste #222: 100 chars] output',
		placeholderContent: {
			'111': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #111: 50 chars]',
				content: 'first code block',
				originalSize: 50,
			} as PastePlaceholderContent,
			'222': {
				type: PlaceholderType.PASTE,
				displayText: '[Paste #222: 100 chars]',
				content: 'second code block with more content',
				originalSize: 100,
			} as PastePlaceholderContent,
		},
	};

	// Delete part of second placeholder
	const newText =
		'Compare [Paste #111: 50 chars] with [Paste #222: 100 ch output';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'Compare [Paste #111: 50 chars] with  output');
	t.deepEqual(result!.placeholderContent, {
		'111': {
			type: PlaceholderType.PASTE,
			displayText: '[Paste #111: 50 chars]',
			content: 'first code block',
			originalSize: 50,
		} as PastePlaceholderContent,
	});
});

// --- Image placeholders ---

function imageState(): InputState {
	return {
		displayValue: 'fix this [Image #1: shot.png] please',
		placeholderContent: {
			image_1: {
				type: PlaceholderType.IMAGE,
				displayText: '[Image #1: shot.png]',
				filePath: '/tmp/shot.png',
				mediaType: 'image/png',
				fileSize: 1024,
			},
		},
	};
}

test('handleAtomicDeletion removes an image placeholder when backspaced', t => {
	const previousState = imageState();
	// Backspace deleted the closing bracket of the indicator
	const newText = 'fix this [Image #1: shot.png please';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'fix this  please');
	t.deepEqual(result!.placeholderContent, {});
});

test('handleAtomicDeletion removes an image placeholder deleted from the middle', t => {
	const previousState = imageState();
	// A selection delete removed part of the indicator's interior
	const newText = 'fix this [Image # shot.png] please';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, 'fix this  please');
	t.deepEqual(result!.placeholderContent, {});
});

test('handleAtomicDeletion leaves image placeholders alone for outside deletions', t => {
	const previousState = imageState();
	// Deleted the trailing "e" of "please" — nowhere near the indicator
	const newText = 'fix this [Image #1: shot.png] pleas';

	const result = handleAtomicDeletion(previousState, newText);

	t.is(result, null);
});

test('handleAtomicDeletion keeps other image placeholders intact', t => {
	const previousState: InputState = {
		displayValue: '[Image #1: a.png] and [Image #2: b.png]',
		placeholderContent: {
			image_1: {
				type: PlaceholderType.IMAGE,
				displayText: '[Image #1: a.png]',
				filePath: '/tmp/a.png',
				mediaType: 'image/png',
				fileSize: 1,
			},
			image_2: {
				type: PlaceholderType.IMAGE,
				displayText: '[Image #2: b.png]',
				filePath: '/tmp/b.png',
				mediaType: 'image/png',
				fileSize: 2,
			},
		},
	};
	// Backspaced into the second indicator
	const newText = '[Image #1: a.png] and [Image #2: b.png';

	const result = handleAtomicDeletion(previousState, newText);

	t.truthy(result);
	t.is(result!.displayValue, '[Image #1: a.png] and ');
	t.deepEqual(Object.keys(result!.placeholderContent), ['image_1']);
});
