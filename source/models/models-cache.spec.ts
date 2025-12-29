import test from 'ava';
import { unlink, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CachedModelsData } from './models-types.js';
import {
	readCache,
	writeCache,
} from './models-cache.js';

// Use environment variable to isolate cache directory for tests
const testCacheDir = join(tmpdir(), `nanocoder-test-cache-${Date.now()}`);
const actualCachePath = join(testCacheDir, 'models.json');

// ============================================================================
// Setup and Teardown
// ============================================================================

test.before(() => {
	// Set NANOCODER_HOME to isolate tests from real user data
	// This prevents migration from finding legacy files in ~/Library/Caches/nanocoder/
	process.env.NANOCODER_HOME = testCacheDir;
	// Also set explicit cache dir for extra certainty
	process.env.NANOCODER_CACHE_DIR = testCacheDir;
	mkdirSync(testCacheDir, {recursive: true});
});

test.after.always(() => {
	// Clean up test cache directory
	if (existsSync(testCacheDir)) {
		rmSync(testCacheDir, {recursive: true, force: true});
	}
	// Clean up environment
	delete process.env.NANOCODER_CACHE_DIR;
	delete process.env.NANOCODER_HOME;
});

test.afterEach.always(async () => {
	// Clean up test cache file after each test
	if (actualCachePath && existsSync(actualCachePath)) {
		try {
			await unlink(actualCachePath);
		} catch {
			// Ignore cleanup errors
		}
	}
});

// ============================================================================
// Tests for readCache
// ============================================================================

test.serial('readCache returns null when cache file does not exist', async t => {
	// Ensure cache file doesn't exist
	if (existsSync(actualCachePath)) {
		await unlink(actualCachePath);
	}

	const result = await readCache();
	t.is(result, null);
});

test.serial('readCache returns valid cached data', async t => {
	const mockData: CachedModelsData = {
		data: { models: [] } as any,
		fetchedAt: Date.now() - 1000,
		expiresAt: Date.now() + 1000000, // Not expired
	};

	// Ensure directory exists
	const dir = join(actualCachePath, '..');
	try {
		await mkdir(dir, { recursive: true });
	} catch {
		// Directory may already exist
	}

	await writeFile(actualCachePath, JSON.stringify(mockData), 'utf-8');

	const result = await readCache();

	t.truthy(result);
	t.deepEqual(result?.data, mockData.data);
	t.is(result?.fetchedAt, mockData.fetchedAt);
	t.is(result?.expiresAt, mockData.expiresAt);
});

test.serial('readCache returns null when cache is expired', async t => {
	const expiredData: CachedModelsData = {
		data: { models: [] } as any,
		fetchedAt: Date.now() - 1000000,
		expiresAt: Date.now() - 1000, // Expired
	};

	// Ensure directory exists
	const dir = join(actualCachePath, '..');
	try {
		await mkdir(dir, { recursive: true });
	} catch {
		// Directory may already exist
	}

	await writeFile(actualCachePath, JSON.stringify(expiredData), 'utf-8');

	const result = await readCache();

	t.is(result, null);
});

test.serial('readCache returns null on JSON parse error', async t => {
	// Ensure directory exists
	const dir = join(actualCachePath, '..');
	try {
		await mkdir(dir, { recursive: true });
	} catch {
		// Directory may already exist
	}

	await writeFile(actualCachePath, 'invalid json{{{', 'utf-8');

	const result = await readCache();

	t.is(result, null);
});

// ============================================================================
// Tests for writeCache
// ============================================================================

test.serial('writeCache writes cache data correctly', async t => {
	const mockData = { models: [{ id: 'test-model' }] } as any;

	await writeCache(mockData);

	// Verify the file was written
	const exists = existsSync(actualCachePath);
	t.true(exists);

	// Verify the content
	const content = await readFile(actualCachePath, 'utf-8');
	const writtenData = JSON.parse(content) as CachedModelsData;

	t.truthy(writtenData.data);
	t.truthy(writtenData.fetchedAt);
	t.truthy(writtenData.expiresAt);
	t.true(writtenData.expiresAt > Date.now());
});

test.serial('writeCache creates directory if it does not exist', async t => {
	const mockData = { models: [] } as any;

	// This should not throw even if directory doesn't exist
	await t.notThrowsAsync(async () => {
		await writeCache(mockData);
	});

	// Verify the file was created
	t.true(existsSync(actualCachePath));
});

// ============================================================================
// Integration-like tests
// ============================================================================

test.serial('cache expiration is calculated correctly', async t => {
	const mockData = { models: [] } as any;
	const now = Date.now();

	await writeCache(mockData);

	const content = await readFile(actualCachePath, 'utf-8');
	const writtenData = JSON.parse(content) as CachedModelsData;

	// Get the expiration constant
	const { CACHE_MODELS_EXPIRATION_MS } = await import('@/constants');

	// Expiration should be roughly CACHE_MODELS_EXPIRATION_MS in the future
	t.true(writtenData.expiresAt >= now + CACHE_MODELS_EXPIRATION_MS - 100);
	t.true(writtenData.expiresAt <= now + CACHE_MODELS_EXPIRATION_MS + 100);
});

test.serial('readCache and writeCache round-trip correctly', async t => {
	const originalData = {
		models: [
			{ id: 'model1', name: 'Test Model 1' },
			{ id: 'model2', name: 'Test Model 2' },
		],
	} as any;

	// Write the cache
	await writeCache(originalData);

	// Read it back
	const readResult = await readCache();

	t.truthy(readResult);
	t.deepEqual(readResult?.data, originalData);
});

test.serial('writeCache overwrites existing cache', async t => {
	// Write first cache
	const firstData = { models: [{ id: 'model1' }] } as any;
	await writeCache(firstData);

	// Write second cache (should overwrite)
	const secondData = { models: [{ id: 'model2' }, { id: 'model3' }] } as any;
	await writeCache(secondData);

	// Read back
	const readResult = await readCache();

	t.truthy(readResult);
	t.deepEqual(readResult?.data, secondData);
});
