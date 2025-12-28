/**
 * Session Module
 *
 * Provides session identity, key generation, and persistence.
 *
 * Usage:
 *
 *   // At app startup
 *   import { initializeSession } from '@/session';
 *   initializeSession();
 *
 *   // Generate React keys (replaces Date.now())
 *   import { generateKey } from '@/session';
 *   const key = generateKey('message'); // "f7a2b3c1-message-1"
 *
 *   // Save/load sessions
 *   import { sessionManager } from '@/session';
 *   await sessionManager.saveSession(messages, provider, model);
 *   const session = await sessionManager.loadSession(sessionId);
 */

// Types
export type {
	SessionIdentity,
	SessionMetadata,
	SessionData,
	SessionIndex,
	ListSessionsOptions,
	CreateSessionOptions,
} from './types';

// Session Service (identity & key generation)
export {
	sessionService,
	initializeSession,
	getSessionId,
	generateKey,
	generateKeyUnsafe,
} from './session-service';

// Session Manager (persistence)
export {SessionManager, sessionManager} from './session-manager';
