import test from 'ava';

import {
	generateKey,
	getKeyCounter,
	getSession,
	getSessionId,
	initSession,
	resetSession,
} from './index';

// Reset session before each test to ensure isolation
test.beforeEach(() => {
	resetSession();
});

// initSession tests
test('initSession creates a new session with generated ID', t => {
	const session = initSession();

	t.truthy(session.id);
	t.is(session.id.length, 8);
	t.truthy(session.createdAt);
	t.truthy(session.name);
	t.truthy(session.workingDirectory);
});

test('initSession uses provided ID when restoring', t => {
	const session = initSession({id: 'abc12345'});

	t.is(session.id, 'abc12345');
});

test('initSession uses provided name', t => {
	const session = initSession({name: 'My Custom Session'});

	t.is(session.name, 'My Custom Session');
});

test('initSession resets key counter', t => {
	initSession();
	generateKey('test');
	generateKey('test');
	t.is(getKeyCounter(), 2);

	initSession();
	t.is(getKeyCounter(), 0);
});

test('initSession generates unique IDs for different sessions', t => {
	const session1 = initSession();
	const id1 = session1.id;

	const session2 = initSession();
	const id2 = session2.id;

	t.not(id1, id2);
});

// getSession tests
test('getSession returns current session', t => {
	const created = initSession();
	const retrieved = getSession();

	t.is(retrieved.id, created.id);
	t.is(retrieved.createdAt, created.createdAt);
});

test('getSession initializes session if none exists', t => {
	// No initSession called
	const session = getSession();

	t.truthy(session);
	t.truthy(session.id);
});

// getSessionId tests
test('getSessionId returns session ID', t => {
	const session = initSession();
	const id = getSessionId();

	t.is(id, session.id);
});

test('getSessionId initializes session if none exists', t => {
	// No initSession called
	const id = getSessionId();

	t.truthy(id);
	t.is(id.length, 8);
});

// generateKey tests
test('generateKey produces correct format', t => {
	initSession({id: 'test1234'});
	const key = generateKey('error');

	t.is(key, 'test1234-error-1');
});

test('generateKey increments counter', t => {
	initSession({id: 'test1234'});

	const key1 = generateKey('error');
	const key2 = generateKey('error');
	const key3 = generateKey('tool-result');

	t.is(key1, 'test1234-error-1');
	t.is(key2, 'test1234-error-2');
	t.is(key3, 'test1234-tool-result-3');
});

test('generateKey produces unique keys', t => {
	initSession();

	const keys = new Set<string>();
	for (let i = 0; i < 1000; i++) {
		keys.add(generateKey('test'));
	}

	t.is(keys.size, 1000);
});

test('generateKey initializes session if none exists', t => {
	// No initSession called
	const key = generateKey('error');

	t.regex(key, /^[a-f0-9]{8}-error-1$/);
});

// resetSession tests
test('resetSession clears session and counter', t => {
	initSession({id: 'test1234'});
	generateKey('test');
	generateKey('test');

	resetSession();

	t.is(getKeyCounter(), 0);
	// getSession will create a new session with different ID
	const newSession = getSession();
	t.not(newSession.id, 'test1234');
});

// Session object properties tests
test('session has correct working directory', t => {
	const session = initSession();

	t.is(session.workingDirectory, process.cwd());
});

test('session createdAt is recent timestamp', t => {
	const before = Date.now();
	const session = initSession();
	const after = Date.now();

	t.true(session.createdAt >= before);
	t.true(session.createdAt <= after);
});

test('session name defaults to formatted date', t => {
	const session = initSession();

	t.true(session.name.startsWith('Session '));
});

// Integration test
test('full session workflow', t => {
	// Initialize session
	const session = initSession({name: 'Test Session'});
	t.is(session.name, 'Test Session');

	// Generate some keys
	const key1 = generateKey('user');
	const key2 = generateKey('assistant');
	const key3 = generateKey('error');

	t.is(key1, `${session.id}-user-1`);
	t.is(key2, `${session.id}-assistant-2`);
	t.is(key3, `${session.id}-error-3`);

	// Verify session is accessible
	const retrieved = getSession();
	t.is(retrieved.id, session.id);

	// Reset and verify new session
	resetSession();
	const newSession = initSession();
	t.not(newSession.id, session.id);
	t.is(getKeyCounter(), 0);
});

// Resume session test
test('resume session preserves ID but resets counter', t => {
	// Original session
	initSession({id: 'original1'});
	generateKey('test');
	generateKey('test');
	t.is(getKeyCounter(), 2);

	// Simulate resume with same ID
	resetSession();
	initSession({id: 'original1', name: 'Resumed Session'});

	t.is(getSessionId(), 'original1');
	t.is(getKeyCounter(), 0);
	t.is(getSession().name, 'Resumed Session');

	// New keys continue from 1, not 3
	const key = generateKey('test');
	t.is(key, 'original1-test-1');
});
