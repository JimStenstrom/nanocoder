import test from 'ava';
import {existsSync, readFileSync, unlinkSync, mkdirSync, rmSync} from 'fs';
import {join} from 'path';
import {logger, setUIErrorHandler} from './logger';

// Use a test-specific data directory
const TEST_DATA_DIR = join('/tmp', 'nanocoder-logger-test-' + process.pid);
const TEST_LOG_DIR = join(TEST_DATA_DIR, 'logs');
const TEST_LOG_FILE = join(TEST_LOG_DIR, 'nanocoder.log');

test.before(() => {
	// Set up test environment
	process.env.NANOCODER_DATA_DIR = TEST_DATA_DIR;
	mkdirSync(TEST_LOG_DIR, {recursive: true});
});

test.afterEach(() => {
	// Clean up log files between tests
	try {
		if (existsSync(TEST_LOG_FILE)) {
			unlinkSync(TEST_LOG_FILE);
		}
		const oldLogFile = join(TEST_LOG_DIR, 'nanocoder.log.old');
		if (existsSync(oldLogFile)) {
			unlinkSync(oldLogFile);
		}
	} catch {
		// Ignore cleanup errors
	}
});

test.after(() => {
	// Clean up test directory
	try {
		rmSync(TEST_DATA_DIR, {recursive: true, force: true});
	} catch {
		// Ignore cleanup errors
	}
	delete process.env.NANOCODER_DATA_DIR;
	delete process.env.NANOCODER_DEBUG;
	delete process.env.NANOCODER_LOG_LEVEL;
});

test.serial('logger.info writes to log file', (t) => {
	logger.info('test-module', 'test info message');

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('[INFO ]'), 'Should contain INFO level');
	t.true(content.includes('[test-module]'), 'Should contain module name');
	t.true(content.includes('test info message'), 'Should contain message');
});

test.serial('logger.warn writes to log file', (t) => {
	logger.warn('test-module', 'test warning message');

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('[WARN ]'), 'Should contain WARN level');
	t.true(content.includes('test warning message'), 'Should contain message');
});

test.serial('logger.error writes to log file', (t) => {
	logger.error('test-module', 'test error message', false);

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('[ERROR]'), 'Should contain ERROR level');
	t.true(content.includes('test error message'), 'Should contain message');
});

test.serial('logger.debug does not write when debug is disabled', (t) => {
	delete process.env.NANOCODER_DEBUG;
	delete process.env.NANOCODER_LOG_LEVEL;

	logger.debug('test-module', 'debug message should not appear');

	// Debug should not create a file if nothing else logged
	if (existsSync(TEST_LOG_FILE)) {
		const content = readFileSync(TEST_LOG_FILE, 'utf-8');
		t.false(content.includes('debug message should not appear'), 'Debug message should not be written');
	} else {
		t.pass('No log file created for debug-only logging when debug disabled');
	}
});

test.serial('logger.debug writes when NANOCODER_DEBUG=1', (t) => {
	process.env.NANOCODER_DEBUG = '1';

	logger.debug('test-module', 'debug message should appear');

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('[DEBUG]'), 'Should contain DEBUG level');
	t.true(content.includes('debug message should appear'), 'Should contain debug message');

	delete process.env.NANOCODER_DEBUG;
});

test.serial('logger.debug writes when NANOCODER_LOG_LEVEL=debug', (t) => {
	process.env.NANOCODER_LOG_LEVEL = 'debug';

	logger.debug('test-module', 'debug via log level');

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('debug via log level'), 'Should contain debug message');

	delete process.env.NANOCODER_LOG_LEVEL;
});

test.serial('logger.errorWithCause formats error correctly', (t) => {
	const testError = new Error('Something went wrong');
	logger.errorWithCause('test-module', 'Operation failed', testError, false);

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('Operation failed: Something went wrong'), 'Should contain formatted error');
});

test.serial('logger.debugWithError formats error correctly when debug enabled', (t) => {
	process.env.NANOCODER_DEBUG = '1';

	const testError = new Error('Debug error');
	logger.debugWithError('test-module', 'Debug operation failed', testError);

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('Debug operation failed: Debug error'), 'Should contain formatted error');

	delete process.env.NANOCODER_DEBUG;
});

test.serial('logger.warnWithError formats error correctly', (t) => {
	const testError = new Error('Warning error');
	logger.warnWithError('test-module', 'Warning operation', testError);

	t.true(existsSync(TEST_LOG_FILE), 'Log file should exist');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	t.true(content.includes('Warning operation: Warning error'), 'Should contain formatted error');
});

test.serial('logger.error calls UI handler when showInUI is true', (t) => {
	let uiMessage = '';
	setUIErrorHandler((message) => {
		uiMessage = message;
	});

	logger.error('test-module', 'UI error message', true);

	t.is(uiMessage, 'UI error message', 'UI handler should receive the message');
});

test.serial('logger.error does not call UI handler when showInUI is false', (t) => {
	let uiCalled = false;
	setUIErrorHandler(() => {
		uiCalled = true;
	});

	logger.error('test-module', 'Silent error message', false);

	t.false(uiCalled, 'UI handler should not be called when showInUI is false');
});

test.serial('logger.getLogPath returns the log file path', (t) => {
	const path = logger.getLogPath();
	t.true(path.includes('nanocoder.log'), 'Should return path containing nanocoder.log');
});

test.serial('log messages include ISO timestamp', (t) => {
	logger.info('test-module', 'timestamp test');

	const content = readFileSync(TEST_LOG_FILE, 'utf-8');
	// ISO timestamp format: 2025-12-04T10:30:00.000Z
	const isoTimestampRegex = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/;
	t.true(isoTimestampRegex.test(content), 'Should contain ISO timestamp');
});
