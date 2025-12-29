/**
 * Migration utilities for file storage consolidation (Issue #230)
 *
 * Provides lazy migration: files are migrated on first access from
 * legacy locations to the new unified directory structure.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {homedir} from 'os';

import {getLogger} from '@/utils/logging';

export interface MigrationResult {
	migrated: boolean;
	from?: string;
	to: string;
	error?: string;
}

/**
 * Migrate a file from legacy locations to new location.
 * Uses lazy migration: only migrates on first access.
 *
 * @param legacyPaths - Array of legacy file paths to check (in priority order)
 * @param newPath - The new target path for the file
 * @returns MigrationResult indicating what happened
 */
export function migrateFile(
	legacyPaths: string[],
	newPath: string,
): MigrationResult {
	const logger = getLogger();
	const newDir = path.dirname(newPath);

	// If new path exists, no migration needed
	if (fs.existsSync(newPath)) {
		return {migrated: false, to: newPath};
	}

	// Check each legacy location
	for (const legacyPath of legacyPaths) {
		if (!legacyPath || !fs.existsSync(legacyPath)) continue;

		try {
			// Ensure new directory exists
			if (!fs.existsSync(newDir)) {
				fs.mkdirSync(newDir, {recursive: true});
			}

			// Try atomic rename first
			try {
				fs.renameSync(legacyPath, newPath);
				logger.info('File migrated to new location', {
					from: legacyPath,
					to: newPath,
				});
			} catch {
				// Cross-device fallback: copy then delete
				fs.copyFileSync(legacyPath, newPath);
				fs.unlinkSync(legacyPath);
				logger.info('File migrated (copy) to new location', {
					from: legacyPath,
					to: newPath,
				});
			}

			// Clean up empty parent directories
			cleanupEmptyDir(path.dirname(legacyPath));

			return {migrated: true, from: legacyPath, to: newPath};
		} catch (error) {
			logger.warn('Migration failed', {
				from: legacyPath,
				to: newPath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return {migrated: false, to: newPath};
}

/**
 * Migrate an entire directory (e.g., logs) from legacy to new location.
 *
 * @param legacyPaths - Array of legacy directory paths to check
 * @param newDir - The new target directory
 * @returns Object with count of migrated files and errors
 */
export function migrateDirectory(
	legacyPaths: string[],
	newDir: string,
): {migrated: number; errors: number} {
	const logger = getLogger();
	let migrated = 0;
	let errors = 0;

	for (const legacyDir of legacyPaths) {
		if (!legacyDir || !fs.existsSync(legacyDir)) continue;

		try {
			const files = fs.readdirSync(legacyDir);

			if (!fs.existsSync(newDir)) {
				fs.mkdirSync(newDir, {recursive: true});
			}

			for (const file of files) {
				const oldPath = path.join(legacyDir, file);
				const newPath = path.join(newDir, file);

				// Skip if already exists in new location
				if (fs.existsSync(newPath)) continue;

				try {
					if (fs.statSync(oldPath).isFile()) {
						try {
							fs.renameSync(oldPath, newPath);
						} catch {
							// Cross-device fallback
							fs.copyFileSync(oldPath, newPath);
							fs.unlinkSync(oldPath);
						}
						migrated++;
					}
				} catch (e) {
					logger.warn('Failed to migrate file', {
						file: oldPath,
						error: String(e),
					});
					errors++;
				}
			}

			// Clean up empty legacy directory
			cleanupEmptyDir(legacyDir);
		} catch (error) {
			logger.warn('Directory migration failed', {
				dir: legacyDir,
				error: String(error),
			});
			errors++;
		}
	}

	if (migrated > 0) {
		logger.info('Directory migration complete', {migrated, errors});
	}

	return {migrated, errors};
}

/**
 * Remove directory if empty, and recurse up to parent.
 * Stops at home directory or if directory is not empty.
 *
 * @param dirPath - The directory to potentially clean up
 */
export function cleanupEmptyDir(dirPath: string): void {
	const logger = getLogger();
	const home = homedir();

	try {
		// Don't delete home or above
		if (dirPath === home || !dirPath.startsWith(home)) return;

		// Don't try to clean if doesn't exist
		if (!fs.existsSync(dirPath)) return;

		const files = fs.readdirSync(dirPath);
		if (files.length === 0) {
			fs.rmdirSync(dirPath);
			logger.debug('Removed empty directory', {path: dirPath});

			// Recurse to parent
			cleanupEmptyDir(path.dirname(dirPath));
		}
	} catch {
		// Directory not empty or can't be removed - that's fine
	}
}

// ============================================
// Legacy Path Helpers
// ============================================

/**
 * Get legacy config paths for a specific file.
 * Returns paths in priority order (most likely to least likely).
 */
export function getLegacyConfigPaths(fileName: string): string[] {
	// Skip legacy paths if user has explicitly set custom paths via env vars
	if (process.env.NANOCODER_HOME || process.env.NANOCODER_CONFIG_DIR) {
		return [];
	}

	const home = homedir();
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			paths.push(
				path.join(home, 'Library', 'Preferences', 'nanocoder', fileName),
			);
			break;
		case 'win32':
			if (process.env.APPDATA) {
				paths.push(path.join(process.env.APPDATA, 'nanocoder', fileName));
			}
			break;
		default:
			// Linux
			paths.push(path.join(home, '.config', 'nanocoder', fileName));
	}

	return paths;
}

/**
 * Get legacy data paths for a specific file.
 * Returns paths in priority order.
 */
export function getLegacyDataPaths(fileName: string): string[] {
	// Skip legacy paths if user has explicitly set custom paths via env vars
	if (process.env.NANOCODER_HOME || process.env.NANOCODER_DATA_DIR) {
		return [];
	}

	const home = homedir();
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			// Check both old locations
			paths.push(
				path.join(
					home,
					'Library',
					'Application Support',
					'nanocoder',
					fileName,
				),
				path.join(home, 'Library', 'Preferences', 'nanocoder', fileName),
			);
			break;
		case 'win32':
			if (process.env.APPDATA) {
				paths.push(path.join(process.env.APPDATA, 'nanocoder', fileName));
			}
			break;
		default:
			// Linux
			paths.push(
				path.join(home, '.local', 'share', 'nanocoder', fileName),
				path.join(home, '.config', 'nanocoder', fileName),
			);
	}

	return paths;
}

/**
 * Get legacy cache paths for a specific file.
 */
export function getLegacyCachePaths(fileName: string): string[] {
	// Skip legacy paths if user has explicitly set custom paths via env vars
	// This allows tests and custom deployments to avoid migration behavior
	if (process.env.NANOCODER_HOME || process.env.NANOCODER_CACHE_DIR) {
		return [];
	}

	const home = homedir();
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			paths.push(path.join(home, 'Library', 'Caches', 'nanocoder', fileName));
			break;
		case 'win32':
			if (process.env.LOCALAPPDATA) {
				paths.push(path.join(process.env.LOCALAPPDATA, 'nanocoder', fileName));
			}
			break;
		default:
			// Linux
			paths.push(path.join(home, '.cache', 'nanocoder', fileName));
	}

	return paths;
}

/**
 * Get legacy log directory paths.
 */
export function getLegacyLogDirs(): string[] {
	const home = homedir();
	const paths: string[] = [];

	switch (process.platform) {
		case 'darwin':
			paths.push(
				path.join(home, 'Library', 'Preferences', 'nanocoder', 'logs'),
			);
			break;
		case 'win32':
			if (process.env.APPDATA) {
				paths.push(path.join(process.env.APPDATA, 'nanocoder', 'logs'));
			}
			break;
		default:
			// Linux
			paths.push(path.join(home, '.config', 'nanocoder', 'logs'));
	}

	return paths;
}
