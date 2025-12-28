/**
 * Session Service (Issue #229)
 *
 * Provides:
 * 1. Session identity - unique ID for current session
 * 2. Unified key generation - replaces scattered Date.now() calls
 * 3. Foundation for session persistence
 *
 * This is a singleton - one session per app instance.
 */

import type {SessionIdentity} from './types';

/**
 * Generate a short unique ID (8 hex chars)
 * More collision-resistant than Date.now() within same millisecond
 */
function generateSessionId(): string {
	const timestamp = Date.now().toString(16);
	const random = Math.random().toString(16).slice(2, 6);
	return `${timestamp.slice(-4)}${random}`;
}

class SessionService {
	private session: SessionIdentity | null = null;
	private keyCounters: Map<string, number> = new Map();

	/**
	 * Initialize a new session
	 * Call this once at app startup
	 */
	initialize(): SessionIdentity {
		this.session = {
			id: generateSessionId(),
			createdAt: Date.now(),
		};
		this.keyCounters.clear();
		return this.session;
	}

	/**
	 * Get current session identity
	 * Throws if not initialized
	 */
	getSession(): SessionIdentity {
		if (!this.session) {
			throw new Error('Session not initialized. Call initialize() first.');
		}
		return this.session;
	}

	/**
	 * Get session ID (convenience method)
	 */
	getSessionId(): string {
		return this.getSession().id;
	}

	/**
	 * Check if session is initialized
	 */
	isInitialized(): boolean {
		return this.session !== null;
	}

	/**
	 * Generate a unique key for React components
	 * Replaces scattered Date.now() calls with collision-resistant keys
	 *
	 * Format: {sessionId}-{prefix}-{counter}
	 * Example: "f7a2b3c1-error-42"
	 *
	 * @param prefix - Category prefix (e.g., 'error', 'message', 'tool')
	 */
	generateKey(prefix: string): string {
		const sessionId = this.getSessionId();
		const count = (this.keyCounters.get(prefix) ?? 0) + 1;
		this.keyCounters.set(prefix, count);
		return `${sessionId}-${prefix}-${count}`;
	}

	/**
	 * Generate a unique key without requiring initialization
	 * Fallback for edge cases during startup
	 */
	generateKeyUnsafe(prefix: string): string {
		if (!this.session) {
			// Fallback to timestamp-based key if session not initialized
			return `init-${prefix}-${Date.now()}`;
		}
		return this.generateKey(prefix);
	}

	/**
	 * Restore a session (for /resume command)
	 * @param identity - Previously saved session identity
	 */
	restore(identity: SessionIdentity): void {
		this.session = identity;
		this.keyCounters.clear();
	}

	/**
	 * Reset the service (for testing)
	 */
	reset(): void {
		this.session = null;
		this.keyCounters.clear();
	}
}

// Singleton instance
export const sessionService = new SessionService();

// Convenience exports
export const initializeSession = () => sessionService.initialize();
export const getSessionId = () => sessionService.getSessionId();
export const generateKey = (prefix: string) =>
	sessionService.generateKey(prefix);
export const generateKeyUnsafe = (prefix: string) =>
	sessionService.generateKeyUnsafe(prefix);
