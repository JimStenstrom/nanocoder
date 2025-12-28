/**
 * Centralized path management for nanocoder
 *
 * Platform Standards:
 * - macOS: ~/Library/Application Support/, ~/Library/Caches/, ~/Library/Logs/
 *   Per Apple File System Programming Guide
 * - Linux: XDG Base Directory Specification
 *   ~/.config/, ~/.local/share/, ~/.cache/, ~/.local/state/
 * - Windows: %APPDATA%, %LOCALAPPDATA%
 *   Per Microsoft App Data Documentation
 *
 * Environment Variable Overrides (highest priority):
 * - NANOCODER_HOME: Override base path for all directories
 * - NANOCODER_CONFIG_DIR: Override config directory only
 * - NANOCODER_DATA_DIR: Override data directory only
 * - NANOCODER_CACHE_DIR: Override cache directory only
 * - NANOCODER_LOG_DIR: Override logs directory only
 */

import {existsSync, mkdirSync, writeFileSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

// ============================================
// Platform-Native Path Functions
// ============================================

/**
 * Get the config directory for configuration files.
 * Contains: agents.config.json, rules.json
 *
 * Platform locations:
 * - macOS: ~/Library/Application Support/nanocoder/
 * - Linux: ~/.config/nanocoder/ (XDG_CONFIG_HOME)
 * - Windows: %APPDATA%\nanocoder\
 */
export function getConfigDir(): string {
	// Explicit override takes highest priority
	if (process.env.NANOCODER_CONFIG_DIR) {
		return process.env.NANOCODER_CONFIG_DIR;
	}

	// NANOCODER_HOME override for all paths
	if (process.env.NANOCODER_HOME) {
		return join(process.env.NANOCODER_HOME, 'config');
	}

	switch (process.platform) {
		case 'darwin':
			return join(homedir(), 'Library', 'Application Support', 'nanocoder');
		case 'win32':
			return join(
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
				'nanocoder',
			);
		default:
			// Linux: Use XDG_CONFIG_HOME (only checked on Linux per XDG spec)
			return join(
				process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
				'nanocoder',
			);
	}
}

/**
 * Get the data directory for user data files.
 * Contains: preferences.json, usage.json, history, sessions, commands
 *
 * Platform locations:
 * - macOS: ~/Library/Application Support/nanocoder/
 * - Linux: ~/.local/share/nanocoder/ (XDG_DATA_HOME)
 * - Windows: %APPDATA%\nanocoder\
 */
export function getDataDir(): string {
	// Explicit override takes highest priority
	if (process.env.NANOCODER_DATA_DIR) {
		return process.env.NANOCODER_DATA_DIR;
	}

	// NANOCODER_HOME override for all paths
	if (process.env.NANOCODER_HOME) {
		return join(process.env.NANOCODER_HOME, 'data');
	}

	switch (process.platform) {
		case 'darwin':
			return join(homedir(), 'Library', 'Application Support', 'nanocoder');
		case 'win32':
			return join(
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
				'nanocoder',
			);
		default:
			// Linux: Use XDG_DATA_HOME (only checked on Linux per XDG spec)
			return join(
				process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
				'nanocoder',
			);
	}
}

/**
 * Get the cache directory for cached/regenerable data.
 * Contains: models.json
 *
 * Platform locations:
 * - macOS: ~/Library/Caches/nanocoder/
 * - Linux: ~/.cache/nanocoder/ (XDG_CACHE_HOME)
 * - Windows: %LOCALAPPDATA%\nanocoder\cache\
 */
export function getCacheDir(): string {
	// Explicit override takes highest priority
	if (process.env.NANOCODER_CACHE_DIR) {
		return process.env.NANOCODER_CACHE_DIR;
	}

	// NANOCODER_HOME override for all paths
	if (process.env.NANOCODER_HOME) {
		return join(process.env.NANOCODER_HOME, 'cache');
	}

	switch (process.platform) {
		case 'darwin':
			return join(homedir(), 'Library', 'Caches', 'nanocoder');
		case 'win32':
			return join(
				process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
				'nanocoder',
				'cache',
			);
		default:
			// Linux: Use XDG_CACHE_HOME (only checked on Linux per XDG spec)
			return join(
				process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'),
				'nanocoder',
			);
	}
}

/**
 * Get the logs directory for log files.
 * Contains: nanocoder-YYYY-MM-DD.log
 *
 * Platform locations:
 * - macOS: ~/Library/Logs/nanocoder/
 * - Linux: ~/.local/state/nanocoder/logs/ (XDG_STATE_HOME)
 * - Windows: %APPDATA%\nanocoder\logs\
 */
export function getLogsDir(): string {
	// Explicit override takes highest priority
	if (process.env.NANOCODER_LOG_DIR) {
		return process.env.NANOCODER_LOG_DIR;
	}

	// NANOCODER_HOME override for all paths
	if (process.env.NANOCODER_HOME) {
		return join(process.env.NANOCODER_HOME, 'logs');
	}

	switch (process.platform) {
		case 'darwin':
			return join(homedir(), 'Library', 'Logs', 'nanocoder');
		case 'win32':
			return join(
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
				'nanocoder',
				'logs',
			);
		default:
			// Linux: Use XDG_STATE_HOME for logs (only checked on Linux per XDG spec)
			return join(
				process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
				'nanocoder',
				'logs',
			);
	}
}

/**
 * Get the sessions directory for session storage.
 * Contains: session data for /resume command (issue #51)
 */
export function getSessionsDir(): string {
	return join(getDataDir(), 'sessions');
}

/**
 * Get the global commands directory.
 * Contains: user's global custom commands
 */
export function getGlobalCommandsDir(): string {
	return join(getDataDir(), 'commands');
}

// ============================================
// Project-local Paths (.nanocoder/ in CWD)
// ============================================

/**
 * Get the project-local config directory path.
 * Returns the path to .nanocoder/ in the specified directory.
 */
export function getProjectConfigDir(cwd: string = process.cwd()): string {
	return join(cwd, '.nanocoder');
}

/**
 * Get the project-local sessions directory.
 */
export function getProjectSessionsDir(cwd: string = process.cwd()): string {
	return join(getProjectConfigDir(cwd), 'sessions');
}

/**
 * Get the project-local commands directory.
 */
export function getProjectCommandsDir(cwd: string = process.cwd()): string {
	return join(getProjectConfigDir(cwd), 'commands');
}

/**
 * Check if project-local .nanocoder/ folder exists.
 */
export function hasProjectConfig(cwd: string = process.cwd()): boolean {
	return existsSync(join(cwd, '.nanocoder'));
}

/**
 * Initialize project-local .nanocoder/ folder with .gitignore.
 * Creates the folder and adds a .gitignore for local-only files.
 */
export function initProjectConfig(cwd: string = process.cwd()): void {
	const projectDir = join(cwd, '.nanocoder');
	if (!existsSync(projectDir)) {
		mkdirSync(projectDir, {recursive: true});
		// Create .gitignore for local-only files
		writeFileSync(
			join(projectDir, '.gitignore'),
			'# Local overrides - not committed\nsettings.local.json\nrules.local.json\n',
		);
	}
}

// ============================================
// Deprecated - Backward Compatibility
// ============================================

/**
 * @deprecated Use getBasePath() is removed. Use getConfigDir() or getDataDir() instead.
 * This function provided a unified base path which is no longer the architecture.
 */

/**
 * @deprecated Use getDataDir() instead. Will be removed in future version.
 * Legacy function that returned platform-specific app data directory.
 */
export function getAppDataPath(): string {
	// Allow explicit override via environment variable
	if (process.env.NANOCODER_DATA_DIR) {
		return process.env.NANOCODER_DATA_DIR;
	}

	// NOTE: XDG_DATA_HOME check removed from here - it was incorrectly
	// checked for all platforms. XDG is now only checked in Linux case.

	// Platform-specific app data directories
	let baseAppDataPath: string;
	switch (process.platform) {
		case 'win32': {
			baseAppDataPath =
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
			break;
		}
		case 'darwin': {
			baseAppDataPath = join(homedir(), 'Library', 'Application Support');
			break;
		}
		default: {
			// Linux: Check XDG_DATA_HOME only here
			baseAppDataPath =
				process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
		}
	}
	return join(baseAppDataPath, 'nanocoder');
}

/**
 * @deprecated Use getConfigDir() instead. Will be removed in future version.
 * Legacy function that returned platform-specific config directory.
 */
export function getConfigPath(): string {
	// Allow explicit override via environment variable
	if (process.env.NANOCODER_CONFIG_DIR) {
		return process.env.NANOCODER_CONFIG_DIR;
	}

	// Platform-specific defaults
	let baseConfigPath: string;
	switch (process.platform) {
		case 'win32':
			baseConfigPath =
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
			break;
		case 'darwin':
			// Fixed: Use Application Support instead of Preferences
			// Preferences is for .plist files only per Apple HIG
			baseConfigPath = join(homedir(), 'Library', 'Application Support');
			break;
		default:
			baseConfigPath =
				process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
	}
	return join(baseConfigPath, 'nanocoder');
}
