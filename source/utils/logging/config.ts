/**
 * Environment-based configuration for Pino logger
 */

import {getLogsDir} from '@/config/paths';
import type {EnhancedLoggerConfig, LoggerConfig, LogLevel} from './types.js';

/**
 * Get the default log directory based on platform
 * Now uses unified path from paths.ts (Issue #230)
 */
export function getDefaultLogDirectory(): string {
	return getLogsDir();
}

/**
 * Create development configuration
 */
export function createDevelopmentConfig(): EnhancedLoggerConfig {
	return {
		level: (process.env.NANOCODER_LOG_LEVEL as LogLevel) || 'debug',
		destination: String(process.stdout.fd),
		pretty: true,
		redact: ['apiKey', 'token', 'password', 'secret'],
		correlation: true,
		serialize: false,
		target: 'pino-pretty',
		options: {
			translateTime: 'HH:MM:ss Z',
			ignore: 'pid,hostname',
			messageFormat: undefined,
			customPrettifiers: {},
			levelFirst: false,
			singleLine: false,
		},
	};
}

/**
 * Create production configuration
 */
export function createProductionConfig(): EnhancedLoggerConfig {
	// Check if file logging is explicitly disabled
	const disableFileLogging = process.env.NANOCODER_LOG_DISABLE_FILE === 'true';

	const baseConfig = {
		level: (process.env.NANOCODER_LOG_LEVEL as LogLevel) || 'silent', // Production users shouldn't see internal logs
		pretty: false,
		redact: ['apiKey', 'token', 'password', 'email', 'userId', 'secret'],
		correlation: true,
		serialize: true,
	};

	// If file logging is disabled, only use stdout (for UI)
	if (disableFileLogging) {
		return {
			...baseConfig,
			destination: String(process.stdout.fd),
			target: 'pino-pretty',
			options: {
				colorize: false, // No colors in production
				translateTime: 'HH:MM:ss Z',
				ignore: 'pid,hostname',
				levelFirst: true,
				messageFormat: '{level} - {msg}',
				singleLine: true, // Compact for UI
			},
		};
	}

	// Otherwise use stdout for UI with optional file logging
	// This ensures UI works while still allowing file persistence when needed
	return {
		...baseConfig,
		// Always output to stdout for UI compatibility
		destination: String(process.stdout.fd),
		target: 'pino-pretty',
		options: {
			colorize: false, // No colors in production
			translateTime: 'HH:MM:ss Z',
			ignore: 'pid,hostname', // Reduce UI clutter
			levelFirst: false,
			messageFormat: '{msg}',
			singleLine: true, // Compact for UI
		},
		// Note: File logging will be handled by the multi-transport system in transports.ts
		// when NANOCODER_LOG_TO_FILE=true is set
	};
}

/**
 * Create test configuration
 */
export function createTestConfig(): EnhancedLoggerConfig {
	return {
		level: (process.env.LOG_LEVEL as LogLevel) || 'debug', // Changed from 'silent' to 'debug'
		pretty: false,
		redact: ['apiKey', 'token', 'password'],
		correlation: false,
		serialize: false,
		target: 'pino/file',
		options: {
			destination: '/dev/null',
		},
	};
}

/**
 * Get configuration based on current environment
 *
 * For CLI tools, we default to production (silent) behavior when NODE_ENV is not set.
 * This gives users a clean experience. Developers working on nanocoder itself should
 * explicitly set NODE_ENV=development to see debug logs.
 */
export function getEnvironmentConfig(): EnhancedLoggerConfig {
	const env = process.env.NODE_ENV;

	switch (env) {
		case 'development':
			return createDevelopmentConfig();
		case 'test':
			return createTestConfig();
		default:
			// Default to production (silent) for normal CLI usage
			return createProductionConfig();
	}
}

/**
 * Validate log level
 */
export function validateLogLevel(level: string): boolean {
	const validLevels = [
		'fatal',
		'error',
		'warn',
		'info',
		'http',
		'debug',
		'trace',
		'silent',
	];
	return validLevels.includes(level.toLowerCase());
}

/**
 * Normalize log level string
 */
export function normalizeLogLevel(level: string): string {
	const normalized = level.toLowerCase().trim();

	// Map common aliases
	const aliases: Record<string, string> = {
		warning: 'warn',
		err: 'error',
		information: 'info',
		http: 'http',
	};

	return aliases[normalized] || normalized;
}

/**
 * Create configuration with overrides
 */
export function createConfig(
	overrides: Partial<LoggerConfig> = {},
): EnhancedLoggerConfig {
	const baseConfig = getEnvironmentConfig();

	// Apply overrides with validation
	if (overrides.level) {
		const normalizedLevel = normalizeLogLevel(overrides.level);
		if (!validateLogLevel(normalizedLevel)) {
			console.warn(
				`[WARNING] Invalid log level "${overrides.level}", using default`,
			);
		} else {
			baseConfig.level = normalizedLevel as LogLevel;
		}
	}

	if (overrides.redact) {
		baseConfig.redact = [
			...new Set([...baseConfig.redact, ...overrides.redact]),
		];
	}

	// Merge other properties
	return {
		...baseConfig,
		...overrides,
		options: {
			...baseConfig.options,
			...(overrides as EnhancedLoggerConfig)?.options,
		},
	};
}
