import {existsSync, mkdirSync, writeFileSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

// ============================================
// Primary Base Path (Issue #230)
// ============================================

/**
 * Get the base directory for all nanocoder files.
 * All subdirectories (config, data, logs, cache, sessions) live under this.
 *
 * Locations:
 * - macOS/Linux: ~/.config/nanocoder/
 * - Windows: %APPDATA%\nanocoder\
 *
 * Override with NANOCODER_HOME_DIR environment variable.
 */
export function getBasePath(): string {
	if (process.env.NANOCODER_HOME_DIR) {
		return process.env.NANOCODER_HOME_DIR;
	}

	switch (process.platform) {
		case 'win32':
			return join(
				process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
				'nanocoder',
			);
		default:
			// darwin & linux unified under ~/.config/nanocoder/
			return join(homedir(), '.config', 'nanocoder');
	}
}

// ============================================
// Global Subdirectory Helpers
// ============================================

/**
 * Get the config directory for configuration files.
 * Contains: agents.config.json, rules.json (future)
 */
export function getConfigDir(): string {
	if (process.env.NANOCODER_CONFIG_DIR) {
		return process.env.NANOCODER_CONFIG_DIR;
	}
	return join(getBasePath(), 'config');
}

/**
 * Get the data directory for user data files.
 * Contains: preferences.json, usage.json, history
 */
export function getDataDir(): string {
	if (process.env.NANOCODER_DATA_DIR) {
		return process.env.NANOCODER_DATA_DIR;
	}
	return join(getBasePath(), 'data');
}

/**
 * Get the logs directory for log files.
 * Contains: nanocoder-YYYY-MM-DD.log
 */
export function getLogsDir(): string {
	if (process.env.NANOCODER_LOG_DIR) {
		return process.env.NANOCODER_LOG_DIR;
	}
	return join(getBasePath(), 'logs');
}

/**
 * Get the cache directory for cached data.
 * Contains: models.json
 */
export function getCacheDir(): string {
	return join(getBasePath(), 'cache');
}

/**
 * Get the sessions directory for session storage.
 * Contains: session data for /resume command (issue #51)
 */
export function getSessionsDir(): string {
	return join(getBasePath(), 'sessions');
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
 * @deprecated Use getDataDir() instead. Will be removed in future version.
 * Legacy function that returned platform-specific app data directory.
 */
export function getAppDataPath(): string {
	// Allow explicit override via environment variable
	if (process.env.NANOCODER_DATA_DIR) {
		return process.env.NANOCODER_DATA_DIR;
	}

	// Check XDG_DATA_HOME first (works cross-platform for testing)
	if (process.env.XDG_DATA_HOME) {
		return join(process.env.XDG_DATA_HOME, 'nanocoder');
	}

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
			baseAppDataPath = join(homedir(), '.local', 'share');
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
			baseConfigPath = join(homedir(), 'Library', 'Preferences');
			break;
		default:
			baseConfigPath =
				process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
	}
	return join(baseConfigPath, 'nanocoder');
}
