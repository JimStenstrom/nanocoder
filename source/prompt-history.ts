import {existsSync, mkdirSync} from 'fs';
import * as nodePath from 'node:path';
import {homedir} from 'os';
import {migrateFile} from '@/config/migration';
import {getDataDir} from '@/config/paths';
import {MAX_PROMPT_HISTORY_SIZE} from '@/constants';
import {logError} from '@/utils/message-queue';
import fs from 'fs/promises';
import type {InputState} from './types/hooks';

const ENTRY_SEPARATOR = '\n---ENTRY_SEPARATOR---\n';
const JSON_FORMAT_MARKER = '---JSON_FORMAT---';
const HISTORY_FILE_NAME = 'history';

/**
 * Get legacy history file paths.
 * Returns paths in priority order (most likely to least likely).
 */
function getLegacyHistoryPaths(): string[] {
	const home = homedir();
	const oldFileName = '.nano-coder-history';
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			paths.push(
				nodePath.join(home, 'Library', 'Preferences', 'nanocoder', oldFileName),
			);
			break;
		case 'win32':
			if (process.env.APPDATA) {
				paths.push(
					nodePath.join(process.env.APPDATA, 'nanocoder', oldFileName),
				);
			}
			break;
		default:
			// Linux
			paths.push(nodePath.join(home, '.config', 'nanocoder', oldFileName));
	}

	// Also check home directory hidden file
	paths.push(nodePath.join(home, oldFileName));

	return paths;
}

function getDefaultHistoryPath(): string {
	const newPath = nodePath.join(getDataDir(), HISTORY_FILE_NAME);

	// Lazy migration from legacy locations
	const legacyPaths = getLegacyHistoryPaths();
	migrateFile(legacyPaths, newPath);

	return newPath;
}

function ensureDataDir(): void {
	const dataDir = getDataDir();
	if (!existsSync(dataDir)) {
		mkdirSync(dataDir, {recursive: true});
	}
}

export class PromptHistory {
	private history: InputState[] = [];
	private currentIndex: number = -1;
	private readonly historyFile: string;
	private savePromise: Promise<void> = Promise.resolve();

	constructor(historyFile?: string) {
		this.historyFile = historyFile ?? getDefaultHistoryPath();
	}

	async loadHistory(): Promise<void> {
		try {
			const content = await fs.readFile(this.historyFile, 'utf8');

			if (content.startsWith(JSON_FORMAT_MARKER)) {
				// New JSON format with InputState objects
				const jsonContent = content.slice(JSON_FORMAT_MARKER.length);
				this.history = JSON.parse(jsonContent) as InputState[];
			} else if (content.includes(ENTRY_SEPARATOR)) {
				// Legacy format with separator - migrate to InputState
				const stringEntries = content
					.split(ENTRY_SEPARATOR)
					.filter(entry => entry.trim() !== '');
				this.history = this.migrateStringArrayToInputState(stringEntries);
			} else {
				// Very old format - single lines - migrate to InputState
				const stringEntries = content
					.split('\n')
					.filter(line => line.trim() !== '');
				this.history = this.migrateStringArrayToInputState(stringEntries);
			}
			this.currentIndex = -1;
		} catch {
			// File doesn't exist yet, start with empty history
			this.history = [];
			this.currentIndex = -1;
		}
	}

	private migrateStringArrayToInputState(
		stringEntries: string[],
	): InputState[] {
		return stringEntries.map(entry => ({
			displayValue: entry,
			placeholderContent: {},
		}));
	}

	async saveHistory(): Promise<void> {
		// Chain this save onto the previous save to prevent concurrent writes
		this.savePromise = this.savePromise.then(async () => {
			try {
				ensureDataDir();
				const jsonContent = JSON.stringify(this.history, null, 2);
				await fs.writeFile(
					this.historyFile,
					JSON_FORMAT_MARKER + jsonContent,
					'utf8',
				);
			} catch (error) {
				// Silently fail to avoid disrupting the user experience
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error';
				logError(`Failed to save prompt history: ${errorMessage}`);
			}
		});
		return this.savePromise;
	}

	addPrompt(inputState: InputState): void;
	addPrompt(prompt: string): void;
	addPrompt(input: InputState | string): void {
		let inputState: InputState;

		if (typeof input === 'string') {
			const trimmed = input.trim();
			if (!trimmed) return;
			inputState = {
				displayValue: trimmed,
				placeholderContent: {},
			};
		} else {
			if (!input.displayValue.trim()) return;
			inputState = input;
		}

		// Remove duplicate if it exists (compare by displayValue)
		const existingIndex = this.history.findIndex(
			entry => entry.displayValue === inputState.displayValue,
		);
		if (existingIndex !== -1) {
			this.history.splice(existingIndex, 1);
		}

		// Add to the end
		this.history.push(inputState);

		// Keep only the last MAX_PROMPT_HISTORY_SIZE entries
		if (this.history.length > MAX_PROMPT_HISTORY_SIZE) {
			this.history = this.history.slice(-MAX_PROMPT_HISTORY_SIZE);
		}

		this.currentIndex = -1;
		void this.saveHistory(); // Fire and forget
	}

	getPrevious(): InputState | null {
		if (this.history.length === 0) return null;

		if (this.currentIndex === -1) {
			this.currentIndex = this.history.length - 1;
		} else if (this.currentIndex > 0) {
			this.currentIndex--;
		}

		return this.history[this.currentIndex] ?? null;
	}

	getNext(): InputState | null {
		if (this.history.length === 0 || this.currentIndex === -1) return null;

		if (this.currentIndex < this.history.length - 1) {
			this.currentIndex++;
			return this.history[this.currentIndex] ?? null;
		} else {
			this.currentIndex = -1;
			return null; // Changed from empty string to null for consistency
		}
	}

	// Legacy methods for backward compatibility
	getPreviousString(): string | null {
		const result = this.getPrevious();
		return result?.displayValue ?? null;
	}

	getNextString(): string | null {
		const result = this.getNext();
		return result?.displayValue ?? '';
	}

	resetIndex(): void {
		this.currentIndex = -1;
	}

	getHistory(): InputState[] {
		return [...this.history];
	}

	// Legacy method for backward compatibility
	getHistoryStrings(): string[] {
		return this.history.map(entry => entry.displayValue);
	}
}

export const promptHistory = new PromptHistory();
