/**
 * Unified Session Service
 *
 * Provides session identity and key generation for the entire application.
 * Foundation for issue #51 (/resume command).
 *
 * @example
 * ```typescript
 * import { initSession, generateKey, getSession } from '@/session';
 *
 * // Initialize on app start
 * initSession();
 *
 * // Generate unique React keys
 * <Component key={generateKey('error')} />
 * // Produces: "f7a2b3c1-error-1"
 *
 * // Access session info
 * const session = getSession();
 * console.log(session.name); // "Session 12/27/2025, 10:30:00 AM"
 * ```
 */

import type {InitSessionOptions, Session} from './types';

export type {InitSessionOptions, Session} from './types';

let currentSession: Session | null = null;
let keyCounter = 0;

/**
 * Initialize a new session or restore an existing one.
 *
 * @param options - Optional configuration for session initialization
 * @param options.id - Existing session ID to restore (for resume functionality)
 * @param options.name - Custom session name
 * @returns The initialized session object
 *
 * @example
 * ```typescript
 * // New session
 * initSession();
 *
 * // Resume existing session
 * initSession({ id: 'f7a2b3c1', name: 'Previous session' });
 * ```
 */
export function initSession(options?: InitSessionOptions): Session {
	currentSession = {
		id: options?.id ?? crypto.randomUUID().slice(0, 8),
		createdAt: Date.now(),
		name: options?.name ?? `Session ${new Date().toLocaleString()}`,
		workingDirectory: process.cwd(),
	};
	keyCounter = 0;
	return currentSession;
}

/**
 * Get the current session, initializing if needed.
 *
 * @returns The current session object
 */
export function getSession(): Session {
	if (!currentSession) {
		initSession();
	}
	return currentSession!;
}

/**
 * Get the current session ID only.
 *
 * @returns The session ID string
 */
export function getSessionId(): string {
	return getSession().id;
}

/**
 * Generate a unique React component key.
 *
 * Format: {sessionId}-{prefix}-{counter}
 *
 * @param prefix - Descriptive prefix for the key (e.g., 'error', 'tool-result', 'user')
 * @returns A unique key string
 *
 * @example
 * ```typescript
 * generateKey('error')      // "f7a2b3c1-error-1"
 * generateKey('tool-result') // "f7a2b3c1-tool-result-2"
 * generateKey('user')        // "f7a2b3c1-user-3"
 * ```
 */
export function generateKey(prefix: string): string {
	return `${getSessionId()}-${prefix}-${++keyCounter}`;
}

/**
 * Reset the session state (primarily for testing).
 * This clears the current session and resets the key counter.
 */
export function resetSession(): void {
	currentSession = null;
	keyCounter = 0;
}

/**
 * Get the current key counter value (primarily for testing/debugging).
 *
 * @returns The current key counter value
 */
export function getKeyCounter(): number {
	return keyCounter;
}
