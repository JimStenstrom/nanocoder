/**
 * Cache management for models.dev data
 * Stores model database in cache directory for fast lookup
 */

import {constants} from 'node:fs';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {getLegacyCachePaths, migrateFile} from '@/config/migration';
import {getCacheDir} from '@/config/paths';
import {CACHE_MODELS_EXPIRATION_MS} from '@/constants';
import {formatError} from '@/utils/error-formatter';
import {getLogger} from '@/utils/logging';
import type {CachedModelsData, ModelsDevDatabase} from './models-types.js';

const CACHE_FILE_NAME = 'models.json';

function getCacheFilePath(): string {
	const newPath = path.join(getCacheDir(), CACHE_FILE_NAME);

	// Lazy migration from legacy locations
	const legacyPaths = getLegacyCachePaths(CACHE_FILE_NAME);
	migrateFile(legacyPaths, newPath);

	return newPath;
}

async function ensureCacheDir(): Promise<void> {
	const dir = getCacheDir();

	try {
		await access(dir, constants.F_OK);
	} catch {
		await mkdir(dir, {recursive: true});
	}
}

export async function readCache(): Promise<CachedModelsData | null> {
	try {
		const cachePath = getCacheFilePath();

		await access(cachePath, constants.F_OK);

		const content = await readFile(cachePath, 'utf-8');
		const cached = JSON.parse(content) as CachedModelsData;

		// Check if cache is expired
		if (Date.now() > cached.expiresAt) {
			return null;
		}

		return cached;
	} catch (error) {
		// If there's any error reading cache, return null to trigger fresh fetch
		const logger = getLogger();
		logger.warn({error: formatError(error)}, 'Failed to read models cache');
		return null;
	}
}

export async function writeCache(data: ModelsDevDatabase): Promise<void> {
	try {
		await ensureCacheDir();

		const cached: CachedModelsData = {
			data,
			fetchedAt: Date.now(),
			expiresAt: Date.now() + CACHE_MODELS_EXPIRATION_MS,
		};

		const cachePath = getCacheFilePath();
		await writeFile(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
	} catch (error) {
		const logger = getLogger();
		logger.warn({error: formatError(error)}, 'Failed to write models cache');
	}
}
