/**
 * Session Types
 *
 * Defines the session interface used throughout the application.
 * Foundation for issue #51 (/resume command).
 */

/**
 * Session object representing the current application session.
 */
export interface Session {
	/**
	 * Unique session identifier (UUID-based).
	 * Used internally for React keys and references.
	 * Example: "f7a2b3c1"
	 */
	id: string;

	/**
	 * Timestamp when the session was created.
	 * Used for sorting and display purposes.
	 */
	createdAt: number;

	/**
	 * Human-readable session name.
	 * Auto-generated or user-set.
	 * Example: "Fix auth bug" or "Session 12/27/2025, 10:30:00 AM"
	 */
	name: string;

	/**
	 * Working directory when the session started.
	 */
	workingDirectory: string;
}

/**
 * Options for initializing a session.
 */
export interface InitSessionOptions {
	/**
	 * Existing session ID to restore.
	 * If omitted, a new ID will be generated.
	 */
	id?: string;

	/**
	 * Custom session name.
	 * If omitted, a default name will be generated.
	 */
	name?: string;
}
