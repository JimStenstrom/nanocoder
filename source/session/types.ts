/**
 * Session Types
 *
 * A session represents a single conversation with context.
 * Sessions are automatically persisted and can be resumed.
 */

import type {Message} from '@/types/core';

/**
 * Core session identity - lightweight, always in memory
 */
export interface SessionIdentity {
	/** Unique session ID (short UUID format: "f7a2b3c1") */
	id: string;
	/** When the session was created */
	createdAt: number;
}

/**
 * Session metadata - stored in index, used for listing
 */
export interface SessionMetadata extends SessionIdentity {
	/** Human-readable name (auto-generated from first message or user-provided) */
	name: string;
	/** Working directory when session started */
	workingDirectory: string;
	/** Last time session was accessed/modified */
	lastAccessedAt: number;
	/** Number of messages in the session */
	messageCount: number;
	/** AI provider used */
	provider: string;
	/** Model used */
	model: string;
}

/**
 * Full session data - loaded when resuming
 */
export interface SessionData extends SessionMetadata {
	/** Full conversation history */
	messages: Message[];
	/** Files that were modified during the session (for context) */
	modifiedFiles?: string[];
}

/**
 * Session index - lightweight file listing all sessions
 */
export interface SessionIndex {
	/** Schema version for future migrations */
	version: 1;
	/** All sessions, keyed by ID */
	sessions: Record<string, SessionMetadata>;
}

/**
 * Options for listing sessions
 */
export interface ListSessionsOptions {
	/** Maximum number of sessions to return */
	limit?: number;
	/** Sort order */
	sortBy?: 'lastAccessedAt' | 'createdAt' | 'messageCount';
	/** Sort direction */
	sortOrder?: 'asc' | 'desc';
	/** Filter by working directory */
	workingDirectory?: string;
}

/**
 * Options for creating a session
 */
export interface CreateSessionOptions {
	/** Custom name (otherwise auto-generated) */
	name?: string;
	/** Working directory (defaults to cwd) */
	workingDirectory?: string;
	/** Provider name */
	provider: string;
	/** Model name */
	model: string;
}
