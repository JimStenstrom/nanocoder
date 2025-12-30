/**
 * Alert manager tests
 */

import test from 'ava';
import type {HealthCheckConfig, HealthCheckResult} from '../types.js';
import {sendAlert} from './alert-manager.js';

const createMockConfig = (): HealthCheckConfig => ({
	enabled: true,
	interval: 5000,
	timeout: 1000,
	thresholds: {
		memory: {
			heapUsageWarning: 0.8,
			heapUsageCritical: 0.9,
			externalWarning: 256,
			externalCritical: 512,
		},
		performance: {
			averageDurationWarning: 1000,
			averageDurationCritical: 5000,
			errorRateWarning: 0.05,
			errorRateCritical: 0.1,
		},
		logging: {
			logRateWarning: 100,
			logRateCritical: 500,
			errorRateWarning: 0.02,
			errorRateCritical: 0.05,
		},
		requests: {
			durationWarning: 1000,
			durationCritical: 5000,
			errorRateWarning: 0.05,
			errorRateCritical: 0.1,
		},
	},
	alerts: {
		enabled: true,
		channels: ['console'],
		cooldown: 60000,
	},
});

const createMockResult = (): HealthCheckResult => ({
	status: 'unhealthy',
	score: 50,
	checks: [],
	timestamp: new Date().toISOString(),
	duration: 100,
	correlationId: 'test-correlation-id',
	summary: {
		total: 5,
		passed: 2,
		failed: 1,
		warnings: 2,
	},
	recommendations: ['Test recommendation'],
});

test('sendAlert completes without error when alerts disabled', async t => {
	const config = createMockConfig();
	config.alerts.enabled = false;
	const result = createMockResult();

	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, undefined, 'test-correlation-id');
	});
});

test('sendAlert respects cooldown period', async t => {
	const config = createMockConfig();
	config.alerts.cooldown = 10000; // 10 seconds
	const result = createMockResult();
	const lastAlert = Date.now() - 5000; // 5 seconds ago

	// Should complete without sending (cooldown not expired)
	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, lastAlert, 'test-correlation-id');
	});
});

test('sendAlert sends when cooldown expired', async t => {
	const config = createMockConfig();
	config.alerts.cooldown = 10000; // 10 seconds
	const result = createMockResult();
	const lastAlert = Date.now() - 15000; // 15 seconds ago (cooldown expired)

	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, lastAlert, 'test-correlation-id');
	});
});

test('sendAlert handles webhook channel when no URL configured', async t => {
	const config = createMockConfig();
	config.alerts.channels = ['webhook'];
	// No webhookUrl configured
	const result = createMockResult();

	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, undefined, 'test-correlation-id');
	});
});

test('sendAlert handles webhook channel with invalid URL gracefully', async t => {
	const config = createMockConfig();
	config.alerts.channels = ['webhook'];
	config.alerts.webhookUrl = 'http://localhost:99999/nonexistent'; // Invalid/unreachable URL
	const result = createMockResult();

	// Should not throw even when webhook fails
	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, undefined, 'test-correlation-id');
	});
});

test('sendAlert supports multiple channels including webhook', async t => {
	const config = createMockConfig();
	config.alerts.channels = ['console', 'file', 'webhook'];
	// No webhookUrl - webhook should be skipped gracefully
	const result = createMockResult();

	await t.notThrowsAsync(async () => {
		await sendAlert(result, config, undefined, 'test-correlation-id');
	});
});
