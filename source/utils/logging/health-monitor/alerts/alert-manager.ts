/**
 * Alert management and sending
 */

import {request} from 'undici';
import {loggerProvider} from '../../logger-provider.js';
import type {HealthCheckConfig, HealthCheckResult} from '../types.js';

// Get logger instance directly to avoid circular dependencies
const getLogger = () => loggerProvider.getLogger();
const logger = getLogger();

// Default timeout for webhook requests (10 seconds)
const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Send health alert
 */
export async function sendAlert(
	result: HealthCheckResult,
	config: HealthCheckConfig,
	lastAlert: number | undefined,
	correlationId: string,
): Promise<void> {
	if (!config.alerts.enabled) return;

	// Check cooldown
	if (lastAlert && Date.now() - lastAlert < config.alerts.cooldown) {
		return;
	}

	const alertMessage = `Health Alert: ${result.status.toUpperCase()} - Score: ${
		result.score
	}/100`;
	const alertDetails = {
		status: result.status,
		score: result.score,
		summary: result.summary,
		recommendations: result.recommendations,
		timestamp: result.timestamp,
		correlationId,
	};

	// Send to configured channels
	for (const channel of config.alerts.channels) {
		switch (channel) {
			case 'console':
				logger.error(alertMessage, {
					...alertDetails,
					source: 'health-monitor-alert',
				});
				break;

			case 'file':
				// Could implement file-based alerting
				logger.warn(alertMessage, {
					...alertDetails,
					source: 'health-monitor-alert',
				});
				break;

			case 'webhook':
				if (config.alerts.webhookUrl) {
					try {
						const webhookPayload = {
							type: 'health_alert',
							...alertDetails,
						};

						const response = await request(config.alerts.webhookUrl, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'X-Correlation-ID': correlationId,
							},
							body: JSON.stringify(webhookPayload),
							bodyTimeout: WEBHOOK_TIMEOUT_MS,
							headersTimeout: WEBHOOK_TIMEOUT_MS,
						});

						if (response.statusCode >= 200 && response.statusCode < 300) {
							logger.info('Webhook alert sent successfully', {
								url: config.alerts.webhookUrl,
								statusCode: response.statusCode,
								correlationId,
								source: 'health-monitor-alert',
							});
						} else {
							logger.warn('Webhook alert returned non-success status', {
								url: config.alerts.webhookUrl,
								statusCode: response.statusCode,
								correlationId,
								source: 'health-monitor-alert',
							});
						}
					} catch (error) {
						logger.error('Failed to send webhook alert', {
							url: config.alerts.webhookUrl,
							error: error instanceof Error ? error.message : error,
							correlationId,
							source: 'health-monitor-alert',
						});
					}
				}
				break;
		}
	}
}
