/**
 * Usage data storage
 * Persists usage statistics to the data directory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {getLegacyDataPaths, migrateFile} from '@/config/migration';
import {getDataDir} from '@/config/paths';
import {MAX_DAILY_AGGREGATES, MAX_USAGE_SESSIONS} from '@/constants';
import {logWarning} from '@/utils/message-queue';
import type {DailyAggregate, SessionUsage, UsageData} from '../types/usage';

const USAGE_FILE_NAME = 'usage.json';

function getUsageFilePath(): string {
	const newPath = path.join(getDataDir(), USAGE_FILE_NAME);

	// Lazy migration from legacy locations
	const legacyPaths = getLegacyDataPaths(USAGE_FILE_NAME);
	migrateFile(legacyPaths, newPath);

	return newPath;
}

function ensureDataDir(): void {
	const dataDir = getDataDir();
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, {recursive: true});
	}
}

function createEmptyUsageData(): UsageData {
	return {
		sessions: [],
		dailyAggregates: [],
		totalLifetime: 0,
		lastUpdated: Date.now(),
	};
}

export function readUsageData(): UsageData {
	try {
		const filePath = getUsageFilePath();

		if (!fs.existsSync(filePath)) {
			return createEmptyUsageData();
		}

		const content = fs.readFileSync(filePath, 'utf-8');
		const data = JSON.parse(content) as UsageData;

		return data;
	} catch (error) {
		logWarning('Failed to read usage data:', true, {
			context: {error},
		});
		return createEmptyUsageData();
	}
}

export function writeUsageData(data: UsageData): void {
	try {
		ensureDataDir();

		data.lastUpdated = Date.now();

		const filePath = getUsageFilePath();
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
	} catch (error) {
		logWarning('Failed to write usage data:', true, {
			context: {error},
		});
	}
}

export function addSession(session: SessionUsage): void {
	const data = readUsageData();

	// Add session to the beginning (most recent first)
	data.sessions.unshift(session);

	// Keep only last MAX_USAGE_SESSIONS
	if (data.sessions.length > MAX_USAGE_SESSIONS) {
		data.sessions = data.sessions.slice(0, MAX_USAGE_SESSIONS);
	}

	// Update lifetime total
	data.totalLifetime += session.tokens.total;

	// Update daily aggregate
	updateDailyAggregate(data, session);

	writeUsageData(data);
}

function updateDailyAggregate(data: UsageData, session: SessionUsage): void {
	const dateParts = new Date(session.timestamp).toISOString().split('T');
	const dateStr = dateParts[0] || new Date().toISOString().split('T')[0] || '';

	// Find or create daily aggregate
	let dailyAggregate = data.dailyAggregates.find(agg => agg.date === dateStr);

	if (!dailyAggregate) {
		dailyAggregate = {
			date: dateStr,
			sessions: 0,
			totalTokens: 0,
			providers: {},
			models: {},
		};
		data.dailyAggregates.push(dailyAggregate);
	}

	// Update aggregate
	dailyAggregate.sessions += 1;
	dailyAggregate.totalTokens += session.tokens.total;

	// Update provider stats
	dailyAggregate.providers[session.provider] =
		(dailyAggregate.providers[session.provider] || 0) + session.tokens.total;

	// Update model stats
	dailyAggregate.models[session.model] =
		(dailyAggregate.models[session.model] || 0) + session.tokens.total;

	// Sort by date (newest first) and keep only last MAX_DAILY_AGGREGATES
	data.dailyAggregates.sort((a, b) => b.date.localeCompare(a.date));
	if (data.dailyAggregates.length > MAX_DAILY_AGGREGATES) {
		data.dailyAggregates = data.dailyAggregates.slice(0, MAX_DAILY_AGGREGATES);
	}
}

export function getTodayAggregate(): DailyAggregate | null {
	const data = readUsageData();
	const todayParts = new Date().toISOString().split('T');
	const today = todayParts[0] || '';

	return data.dailyAggregates.find(agg => agg.date === today) || null;
}

export function getLastNDaysAggregate(days: number): {
	totalTokens: number;
	totalSessions: number;
	avgTokensPerDay: number;
} {
	const data = readUsageData();
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - days);
	const cutoffParts = cutoffDate.toISOString().split('T');
	const cutoffStr = cutoffParts[0] || '';

	const relevantAggregates = data.dailyAggregates.filter(
		agg => agg.date >= cutoffStr,
	);

	const totalTokens = relevantAggregates.reduce(
		(sum, agg) => sum + agg.totalTokens,
		0,
	);
	const totalSessions = relevantAggregates.reduce(
		(sum, agg) => sum + agg.sessions,
		0,
	);

	return {
		totalTokens,
		totalSessions,
		avgTokensPerDay: Math.round(totalTokens / (days || 1)),
	};
}

/**
 * Clear all usage data
 */
export function clearUsageData(): void {
	try {
		const filePath = getUsageFilePath();
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch (error) {
		logWarning('Failed to clear usage data:', true, {
			context: {error},
		});
	}
}
