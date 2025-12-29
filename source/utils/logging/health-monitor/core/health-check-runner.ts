/**
 * Health check orchestration
 */

import {withNewCorrelationContext} from '../../correlation.js';
import {loggerProvider} from '../../logger-provider.js';
import type {CorrelationContext} from '../../types.js';

const getLogger = () => loggerProvider.getLogger();

import {checkConfigurationSystem} from '../checks/configuration-check.js';
import {checkLoggingSystem} from '../checks/logging-check.js';
import {checkMemory} from '../checks/memory-check.js';
import {checkPerformanceMonitoring} from '../checks/performance-check.js';
import {checkRequestTracking} from '../checks/request-check.js';
import type {
	HealthCheck,
	HealthCheckConfig,
	HealthCheckResult,
} from '../types.js';
import {generateRecommendations} from './scoring.js';

// Get logger instance directly to avoid circular dependencies
const logger = getLogger();

/**
 * Run a comprehensive health check
 */
export async function runHealthCheck(
	config: HealthCheckConfig,
	correlationId: string,
): Promise<HealthCheckResult> {
	return withNewCorrelationContext(async (_context: CorrelationContext) => {
		const startTime = performance.now();

		try {
			logger.debug('Starting health check', {
				correlationId,
				source: 'health-monitor',
			});

			const checks: HealthCheck[] = [];

			// Run all health checks
			checks.push(checkMemory(config));
			checks.push(checkLoggingSystem(config));
			checks.push(checkRequestTracking(config));
			checks.push(checkPerformanceMonitoring(config));
			checks.push(checkConfigurationSystem(config));

			// Calculate overall health
			const totalChecks = checks.length;
			const passedChecks = checks.filter(c => c.status === 'pass').length;
			const failedChecks = checks.filter(c => c.status === 'fail').length;
			const warningChecks = checks.filter(c => c.status === 'warn').length;
			const averageScore =
				checks.reduce((sum, c) => sum + c.score, 0) / totalChecks;

			// Determine overall status
			let status: 'healthy' | 'degraded' | 'unhealthy';
			if (failedChecks > 0) {
				status = 'unhealthy';
			} else if (warningChecks > 0 || averageScore < 80) {
				status = 'degraded';
			} else {
				status = 'healthy';
			}

			const duration = performance.now() - startTime;

			const result: HealthCheckResult = {
				status,
				score: Math.round(averageScore),
				checks,
				timestamp: new Date().toISOString(),
				duration: Math.round(duration),
				correlationId,
				summary: {
					total: totalChecks,
					passed: passedChecks,
					failed: failedChecks,
					warnings: warningChecks,
				},
				recommendations: generateRecommendations(checks, status),
			};

			// Log health check result
			logger.info('Health check completed', {
				status,
				score: result.score,
				duration: `${duration.toFixed(2)}ms`,
				summary: result.summary,
				correlationId,
				source: 'health-monitor',
			});

			return result;
		} catch (error) {
			const duration = performance.now() - startTime;

			logger.error('Health check failed', {
				error: error instanceof Error ? error.message : error,
				duration: `${duration.toFixed(2)}ms`,
				correlationId,
				source: 'health-monitor',
			});

			const result: HealthCheckResult = {
				status: 'unhealthy',
				score: 0,
				checks: [
					{
						name: 'health-check-system',
						status: 'fail',
						score: 0,
						duration,
						error: error instanceof Error ? error.message : String(error),
					},
				],
				timestamp: new Date().toISOString(),
				duration: Math.round(duration),
				correlationId,
				summary: {
					total: 1,
					passed: 0,
					failed: 1,
					warnings: 0,
				},
				recommendations: [
					'Fix health check system errors',
					'Check system resources',
					'Review configuration',
				],
			};

			return result;
		}
	});
}
