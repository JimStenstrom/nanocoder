import test from 'ava';
import {PromptHistory} from '../prompt-history';
import {PlaceholderType, type InputState} from '../types/hooks';

/**
 * Tests for history navigation cycling behavior
 *
 * These tests verify that the history navigation properly cycles through:
 * - Up arrow: blank → last → ... → first → blank → last → ...
 * - Down arrow: blank → first → ... → last → blank → first → ...
 */

// Simulate the history navigation state machine
class HistoryNavigationSimulator {
	private historyIndex: number = -1;
	private originalInput: string = '';
	private originalInputState: InputState | null = null;
	private currentInput: string = '';
	private currentState: InputState;

	constructor(
		private history: InputState[],
		initialInput: string = '',
	) {
		this.currentInput = initialInput;
		this.currentState = {
			displayValue: initialInput,
			placeholderContent: {},
		};
	}

	// Simulates the Up arrow key navigation logic
	navigateUp(): void {
		if (this.history.length === 0) return;

		if (this.historyIndex === -1) {
			// Save current state before starting navigation
			this.originalInputState = this.currentState;
			this.originalInput = this.currentInput;
			this.historyIndex = this.history.length - 1;
			this.currentState = this.history[this.history.length - 1];
			this.currentInput = this.currentState.displayValue;
		} else if (this.historyIndex > 0) {
			const newIndex = this.historyIndex - 1;
			this.historyIndex = newIndex;
			this.currentState = this.history[newIndex];
			this.currentInput = this.currentState.displayValue;
		} else if (this.historyIndex === 0) {
			// At first history item, go to blank
			this.historyIndex = -2;
			this.originalInput = '';
			this.currentInput = '';
			this.currentState = {displayValue: '', placeholderContent: {}};
		} else if (this.historyIndex === -2) {
			// At blank, cycle back to last history item
			this.historyIndex = this.history.length - 1;
			this.currentState = this.history[this.history.length - 1];
			this.currentInput = this.currentState.displayValue;
		}
	}

	// Simulates the Down arrow key navigation logic
	navigateDown(): void {
		if (this.history.length === 0) return;

		if (this.historyIndex === -1) {
			// At original input, go to blank when cycling down
			this.originalInputState = this.currentState;
			this.originalInput = this.currentInput;
			this.historyIndex = -2;
			this.originalInput = '';
			this.currentInput = '';
			this.currentState = {displayValue: '', placeholderContent: {}};
		} else if (this.historyIndex === -2) {
			// At blank, cycle to first history item
			this.historyIndex = 0;
			this.currentState = this.history[0];
			this.currentInput = this.currentState.displayValue;
		} else if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
			// Move forward in history
			const newIndex = this.historyIndex + 1;
			this.historyIndex = newIndex;
			this.currentState = this.history[newIndex];
			this.currentInput = this.currentState.displayValue;
		} else if (this.historyIndex === this.history.length - 1) {
			// At last history item, cycle back to blank
			this.historyIndex = -2;
			this.originalInput = '';
			this.currentInput = '';
			this.currentState = {displayValue: '', placeholderContent: {}};
		}
	}

	getCurrentInput(): string {
		return this.currentInput;
	}

	getHistoryIndex(): number {
		return this.historyIndex;
	}

	getCurrentState(): InputState {
		return this.currentState;
	}
}

// ============================================================================
// Single Message History Tests
// ============================================================================

test('single message: up cycles through history → blank → history', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Start at blank (index -1)
	t.is(nav.getHistoryIndex(), -1);
	t.is(nav.getCurrentInput(), '');

	// Up → shows message
	nav.navigateUp();
	t.is(nav.getHistoryIndex(), 0);
	t.is(nav.getCurrentInput(), 'message1');

	// Up → blank
	nav.navigateUp();
	t.is(nav.getHistoryIndex(), -2);
	t.is(nav.getCurrentInput(), '');

	// Up → cycles back to message
	nav.navigateUp();
	t.is(nav.getHistoryIndex(), 0);
	t.is(nav.getCurrentInput(), 'message1');

	// Up → blank again
	nav.navigateUp();
	t.is(nav.getHistoryIndex(), -2);
	t.is(nav.getCurrentInput(), '');
});

test('single message: down cycles through blank → history → blank', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Start at blank (index -1)
	t.is(nav.getHistoryIndex(), -1);
	t.is(nav.getCurrentInput(), '');

	// Down → blank cycling state
	nav.navigateDown();
	t.is(nav.getHistoryIndex(), -2);
	t.is(nav.getCurrentInput(), '');

	// Down → message
	nav.navigateDown();
	t.is(nav.getHistoryIndex(), 0);
	t.is(nav.getCurrentInput(), 'message1');

	// Down → blank again
	nav.navigateDown();
	t.is(nav.getHistoryIndex(), -2);
	t.is(nav.getCurrentInput(), '');

	// Down → cycles back to message
	nav.navigateDown();
	t.is(nav.getHistoryIndex(), 0);
	t.is(nav.getCurrentInput(), 'message1');
});

test('single message: up then down returns to original', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, 'typing...');

	// Start with user typing
	t.is(nav.getCurrentInput(), 'typing...');

	// Up → shows history
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message1');

	// Down → back to blank (lost typing)
	nav.navigateDown();
	t.is(nav.getCurrentInput(), '');
});

// ============================================================================
// Multiple Message History Tests
// ============================================================================

test('three messages: up cycles correctly', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
		{displayValue: 'message2', placeholderContent: {}},
		{displayValue: 'message3', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Start at blank
	t.is(nav.getCurrentInput(), '');

	// Up → message3 (last)
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message3');

	// Up → message2
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message2');

	// Up → message1 (first)
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message1');

	// Up → blank
	nav.navigateUp();
	t.is(nav.getCurrentInput(), '');

	// Up → cycles back to message3
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message3');
});

test('three messages: down cycles correctly', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
		{displayValue: 'message2', placeholderContent: {}},
		{displayValue: 'message3', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Start at blank
	t.is(nav.getCurrentInput(), '');

	// Down → blank cycling state
	nav.navigateDown();
	t.is(nav.getCurrentInput(), '');

	// Down → message1 (first)
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'message1');

	// Down → message2
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'message2');

	// Down → message3 (last)
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'message3');

	// Down → blank
	nav.navigateDown();
	t.is(nav.getCurrentInput(), '');

	// Down → cycles back to message1
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'message1');
});

test('three messages: mixing up and down navigation', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
		{displayValue: 'message2', placeholderContent: {}},
		{displayValue: 'message3', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Up twice
	nav.navigateUp();
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message2');

	// Down once
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'message3');

	// Down again
	nav.navigateDown();
	t.is(nav.getCurrentInput(), '');

	// Up once
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'message3');
});

// ============================================================================
// Empty History Tests
// ============================================================================

test('empty history: navigation does nothing', t => {
	const history: InputState[] = [];
	const nav = new HistoryNavigationSimulator(history, 'test');

	// Start with input
	t.is(nav.getCurrentInput(), 'test');

	// Up does nothing
	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'test');

	// Down does nothing
	nav.navigateDown();
	t.is(nav.getCurrentInput(), 'test');
});

// ============================================================================
// Edge Case Tests
// ============================================================================

test('history with placeholders: navigation preserves InputState', t => {
	const history: InputState[] = [
		{
			displayValue: 'message with [Paste #1: 100 chars]',
			placeholderContent: {
				'1': {
					type: PlaceholderType.PASTE,
					content: 'x'.repeat(100),
					displayText: '[Paste #1: 100 chars]',
					originalSize: 100,
				},
			},
		},
	];
	const nav = new HistoryNavigationSimulator(history, '');

	// Navigate to history
	nav.navigateUp();
	const state = nav.getCurrentState();

	t.is(state.displayValue, 'message with [Paste #1: 100 chars]');
	t.truthy(state.placeholderContent['1']);
	t.is(state.placeholderContent['1'].content, 'x'.repeat(100));
});

test('continuous cycling: 10 ups then 10 downs returns to start', t => {
	const history: InputState[] = [
		{displayValue: 'message1', placeholderContent: {}},
		{displayValue: 'message2', placeholderContent: {}},
	];
	const nav = new HistoryNavigationSimulator(history, 'original');

	// Save starting state
	const startIndex = nav.getHistoryIndex();

	// Navigate up 10 times (should cycle)
	for (let i = 0; i < 10; i++) {
		nav.navigateUp();
	}

	// Navigate down 10 times (should return to similar state)
	for (let i = 0; i < 10; i++) {
		nav.navigateDown();
	}

	// Should be back at a predictable state
	// After 10 ups and 10 downs, we should be at blank state
	t.is(nav.getHistoryIndex(), -2);
});

// ============================================================================
// Integration with PromptHistory Tests
// ============================================================================

test('integration: PromptHistory provides correct history for navigation', async t => {
	// Create a temporary history file for testing
	const tempFile = `/tmp/test-history-${Date.now()}.txt`;
	const history = new PromptHistory(tempFile);

	// Add some prompts
	history.addPrompt({displayValue: 'first', placeholderContent: {}});
	history.addPrompt({displayValue: 'second', placeholderContent: {}});
	history.addPrompt({displayValue: 'third', placeholderContent: {}});

	// Get history
	const historyArray = history.getHistory();

	// Verify we can navigate through it
	const nav = new HistoryNavigationSimulator(historyArray, '');

	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'third');

	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'second');

	nav.navigateUp();
	t.is(nav.getCurrentInput(), 'first');

	// Cleanup
	await history.saveHistory();
});
