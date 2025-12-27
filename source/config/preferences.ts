import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import * as path from 'node:path';
import {homedir} from 'os';
import {migrateFile} from '@/config/migration';
import {getDataDir} from '@/config/paths';
import {logError} from '@/utils/message-queue';

import type {UserPreferences} from '@/types/index';

const PREFERENCES_FILE_NAME = 'preferences.json';

let PREFERENCES_PATH: string | null = null;
let CACHED_DATA_DIR: string | undefined = undefined;

/**
 * Get legacy preferences file paths.
 * Returns paths in priority order (most likely to least likely).
 */
function getLegacyPreferencesPaths(): string[] {
	const home = homedir();
	const oldFileName = 'nanocoder-preferences.json';
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			paths.push(
				path.join(home, 'Library', 'Preferences', 'nanocoder', oldFileName),
			);
			break;
		case 'win32':
			if (process.env.APPDATA) {
				paths.push(path.join(process.env.APPDATA, 'nanocoder', oldFileName));
			}
			break;
		default:
			// Linux
			paths.push(path.join(home, '.config', 'nanocoder', oldFileName));
	}

	// Also check home directory hidden file
	paths.push(path.join(home, `.${oldFileName}`));

	return paths;
}

function getPreferencesPath(): string {
	// Re-compute path if NANOCODER_DATA_DIR has changed (important for tests)
	const currentDataDir = process.env.NANOCODER_DATA_DIR;
	if (!PREFERENCES_PATH || CACHED_DATA_DIR !== currentDataDir) {
		const newPath = path.join(getDataDir(), PREFERENCES_FILE_NAME);

		// Lazy migration from legacy locations
		const legacyPaths = getLegacyPreferencesPaths();
		migrateFile(legacyPaths, newPath);

		PREFERENCES_PATH = newPath;
		CACHED_DATA_DIR = currentDataDir;
	}
	return PREFERENCES_PATH;
}

// Export for testing purposes - allows tests to reset the cache
export function resetPreferencesCache(): void {
	PREFERENCES_PATH = null;
	CACHED_DATA_DIR = undefined;
}

function ensureDataDir(): void {
	const dataDir = getDataDir();
	if (!existsSync(dataDir)) {
		mkdirSync(dataDir, {recursive: true});
	}
}

export function loadPreferences(): UserPreferences {
	try {
		const preferencesPath = getPreferencesPath();
		if (!existsSync(preferencesPath)) {
			return {};
		}
		const data = readFileSync(preferencesPath, 'utf-8');
		return JSON.parse(data) as UserPreferences;
	} catch (error) {
		logError(`Failed to load preferences: ${String(error)}`);
	}
	return {};
}

export function savePreferences(preferences: UserPreferences): void {
	try {
		ensureDataDir();
		writeFileSync(getPreferencesPath(), JSON.stringify(preferences, null, 2));
	} catch (error) {
		logError(`Failed to save preferences: ${String(error)}`);
	}
}

export function updateLastUsed(provider: string, model: string): void {
	const preferences = loadPreferences();
	preferences.lastProvider = provider;
	preferences.lastModel = model;

	// Also save the model for this specific provider
	if (!preferences.providerModels) {
		preferences.providerModels = {};
	}
	preferences.providerModels[provider] = model;

	savePreferences(preferences);
}

export function getLastUsedModel(provider: string): string | undefined {
	const preferences = loadPreferences();
	return preferences.providerModels?.[provider];
}
