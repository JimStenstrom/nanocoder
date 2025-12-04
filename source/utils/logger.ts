/**
 * File-based logger for nanocoder
 *
 * Provides structured logging that doesn't interfere with the TUI.
 * - debug/info/warn: Write to log file only
 * - error: Write to log file AND surface to UI via message-queue
 *
 * Enable debug logging via NANOCODER_DEBUG=1 or NANOCODER_LOG_LEVEL=debug
 * Log file location: {appDataPath}/logs/nanocoder.log
 */

import {appendFileSync, statSync, mkdirSync, renameSync, existsSync} from 'fs';
import {join, dirname} from 'path';
import {getAppDataPath} from '@/config/paths';
import {formatError} from '@/utils/error-formatter';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const LOG_FILE_NAME = 'nanocoder.log';
const OLD_LOG_FILE_NAME = 'nanocoder.log.old';

let logFilePath: string | null = null;
let logDirCreated = false;
let uiErrorHandler: ((message: string) => void) | null = null;

/**
 * Get the current minimum log level from environment
 */
function getMinLogLevel(): LogLevel {
	if (process.env.NANOCODER_DEBUG === '1' || process.env.NANOCODER_DEBUG === 'true') {
		return 'debug';
	}
	const level = process.env.NANOCODER_LOG_LEVEL?.toLowerCase();
	if (level && level in LOG_LEVELS) {
		return level as LogLevel;
	}
	return 'info'; // Default to info level
}

/**
 * Check if a log level should be logged based on current settings
 */
function shouldLog(level: LogLevel): boolean {
	const minLevel = getMinLogLevel();
	return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

/**
 * Get the log file path, creating the directory if needed
 */
function getLogFilePath(): string {
	if (logFilePath) {
		return logFilePath;
	}

	try {
		const appDataPath = getAppDataPath();
		const logsDir = join(appDataPath, 'logs');

		if (!logDirCreated) {
			mkdirSync(logsDir, {recursive: true});
			logDirCreated = true;
		}

		logFilePath = join(logsDir, LOG_FILE_NAME);
		return logFilePath;
	} catch {
		// Fallback to temp directory if app data path fails
		logFilePath = join('/tmp', LOG_FILE_NAME);
		return logFilePath;
	}
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateLogIfNeeded(filePath: string): void {
	try {
		if (!existsSync(filePath)) {
			return;
		}

		const stats = statSync(filePath);
		if (stats.size >= MAX_LOG_SIZE) {
			const oldLogPath = join(dirname(filePath), OLD_LOG_FILE_NAME);
			// Rename current log to .old (overwrites previous .old)
			renameSync(filePath, oldLogPath);
		}
	} catch {
		// Ignore rotation errors - logging should never crash the app
	}
}

/**
 * Format a log message with timestamp and level
 */
function formatLogMessage(level: LogLevel, module: string, message: string): string {
	const timestamp = new Date().toISOString();
	return `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}\n`;
}

/**
 * Write a message to the log file
 */
function writeToLogFile(level: LogLevel, module: string, message: string): void {
	try {
		const filePath = getLogFilePath();
		rotateLogIfNeeded(filePath);

		const formattedMessage = formatLogMessage(level, module, message);
		appendFileSync(filePath, formattedMessage);
	} catch {
		// Silently fail - logging should never crash the app
	}
}

/**
 * Set the UI error handler (called by message-queue during initialization)
 * This allows errors to be surfaced to the user in the TUI
 */
export function setUIErrorHandler(handler: (message: string) => void): void {
	uiErrorHandler = handler;
}

/**
 * Log a debug message (file only, when debug enabled)
 */
function debug(module: string, message: string): void {
	if (shouldLog('debug')) {
		writeToLogFile('debug', module, message);
	}
}

/**
 * Log an info message (file only)
 */
function info(module: string, message: string): void {
	if (shouldLog('info')) {
		writeToLogFile('info', module, message);
	}
}

/**
 * Log a warning message (file only)
 */
function warn(module: string, message: string): void {
	if (shouldLog('warn')) {
		writeToLogFile('warn', module, message);
	}
}

/**
 * Log an error message (file + UI)
 */
function error(module: string, message: string, showInUI: boolean = true): void {
	writeToLogFile('error', module, message);

	// Also surface to UI if handler is set and showInUI is true
	if (showInUI && uiErrorHandler) {
		uiErrorHandler(message);
	}
}

/**
 * Log an error with the error object formatted
 */
function errorWithCause(module: string, message: string, err: unknown, showInUI: boolean = true): void {
	const fullMessage = `${message}: ${formatError(err)}`;
	error(module, fullMessage, showInUI);
}

/**
 * Log a debug message with the error object formatted
 */
function debugWithError(module: string, message: string, err: unknown): void {
	const fullMessage = `${message}: ${formatError(err)}`;
	debug(module, fullMessage);
}

/**
 * Log a warning with the error object formatted
 */
function warnWithError(module: string, message: string, err: unknown): void {
	const fullMessage = `${message}: ${formatError(err)}`;
	warn(module, fullMessage);
}

/**
 * Get the current log file path (useful for debugging)
 */
function getLogPath(): string {
	return getLogFilePath();
}

export const logger = {
	debug,
	info,
	warn,
	error,
	errorWithCause,
	debugWithError,
	warnWithError,
	getLogPath,
};
