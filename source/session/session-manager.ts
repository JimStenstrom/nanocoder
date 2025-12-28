/**
 * Session Manager (Issue #51)
 *
 * Handles session persistence:
 * - Save/load sessions to disk
 * - List available sessions
 * - Auto-save functionality
 * - Session cleanup
 *
 * Storage structure:
 *   ~/.config/nanocoder/sessions/
 *     index.json          - Session index (metadata only)
 *     {session-id}.json   - Full session data
 */

import {existsSync} from 'fs';
import * as path from 'path';
import {getSessionsDir} from '@/config/paths';
import type {Message} from '@/types/core';
import * as fs from 'fs/promises';
import {sessionService} from './session-service';
import type {
	CreateSessionOptions,
	ListSessionsOptions,
	SessionData,
	SessionIndex,
	SessionMetadata,
} from './types';

const INDEX_FILE = 'index.json';
const MAX_TITLE_LENGTH = 50;
const DEFAULT_SESSION_LIMIT = 50;

/**
 * Generate a session title from the first user message
 */
function generateTitle(messages: Message[]): string {
	const firstUserMessage = messages.find(m => m.role === 'user');
	if (!firstUserMessage) {
		return 'New session';
	}

	const content = firstUserMessage.content.trim();
	if (content.length <= MAX_TITLE_LENGTH) {
		return content;
	}
	return `${content.slice(0, MAX_TITLE_LENGTH - 3)}...`;
}

export class SessionManager {
	private sessionsDir: string;
	private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private autoSaveIntervalMs = 30000; // 30 seconds

	constructor(sessionsDir?: string) {
		this.sessionsDir = sessionsDir ?? getSessionsDir();
	}

	/**
	 * Ensure the sessions directory exists
	 */
	private async ensureSessionsDir(): Promise<void> {
		if (!existsSync(this.sessionsDir)) {
			await fs.mkdir(this.sessionsDir, {recursive: true});
		}
	}

	/**
	 * Get path to session index file
	 */
	private getIndexPath(): string {
		return path.join(this.sessionsDir, INDEX_FILE);
	}

	/**
	 * Get path to a session data file
	 */
	private getSessionPath(sessionId: string): string {
		return path.join(this.sessionsDir, `${sessionId}.json`);
	}

	/**
	 * Load the session index
	 */
	private async loadIndex(): Promise<SessionIndex> {
		const indexPath = this.getIndexPath();
		if (!existsSync(indexPath)) {
			return {version: 1, sessions: {}};
		}

		try {
			const content = await fs.readFile(indexPath, 'utf-8');
			return JSON.parse(content) as SessionIndex;
		} catch {
			// Corrupted index, start fresh
			return {version: 1, sessions: {}};
		}
	}

	/**
	 * Save the session index
	 */
	private async saveIndex(index: SessionIndex): Promise<void> {
		await this.ensureSessionsDir();
		const indexPath = this.getIndexPath();
		await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
	}

	/**
	 * Create a new session
	 */
	async createSession(options: CreateSessionOptions): Promise<SessionMetadata> {
		const identity = sessionService.getSession();
		const now = Date.now();

		const metadata: SessionMetadata = {
			id: identity.id,
			createdAt: identity.createdAt,
			name: options.name ?? 'New session',
			workingDirectory: options.workingDirectory ?? process.cwd(),
			lastAccessedAt: now,
			messageCount: 0,
			provider: options.provider,
			model: options.model,
		};

		// Add to index
		const index = await this.loadIndex();
		index.sessions[identity.id] = metadata;
		await this.saveIndex(index);

		return metadata;
	}

	/**
	 * Save session data (messages and metadata)
	 */
	async saveSession(
		messages: Message[],
		provider: string,
		model: string,
		modifiedFiles?: string[],
	): Promise<void> {
		await this.ensureSessionsDir();

		const identity = sessionService.getSession();
		const now = Date.now();

		// Load current index
		const index = await this.loadIndex();
		let metadata = index.sessions[identity.id];

		// Create metadata if this is first save
		if (!metadata) {
			metadata = {
				id: identity.id,
				createdAt: identity.createdAt,
				name: generateTitle(messages),
				workingDirectory: process.cwd(),
				lastAccessedAt: now,
				messageCount: messages.length,
				provider,
				model,
			};
		} else {
			// Update existing metadata
			metadata.lastAccessedAt = now;
			metadata.messageCount = messages.length;
			metadata.provider = provider;
			metadata.model = model;
			// Update title if it was auto-generated and we have more context now
			if (metadata.name === 'New session' && messages.length > 0) {
				metadata.name = generateTitle(messages);
			}
		}

		// Save full session data
		const sessionData: SessionData = {
			...metadata,
			messages,
			modifiedFiles,
		};

		const sessionPath = this.getSessionPath(identity.id);
		await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));

		// Update index
		index.sessions[identity.id] = metadata;
		await this.saveIndex(index);
	}

	/**
	 * Load a session by ID
	 */
	async loadSession(sessionId: string): Promise<SessionData | null> {
		const sessionPath = this.getSessionPath(sessionId);
		if (!existsSync(sessionPath)) {
			return null;
		}

		try {
			const content = await fs.readFile(sessionPath, 'utf-8');
			const sessionData = JSON.parse(content) as SessionData;

			// Update last accessed time
			const index = await this.loadIndex();
			if (index.sessions[sessionId]) {
				index.sessions[sessionId].lastAccessedAt = Date.now();
				await this.saveIndex(index);
			}

			return sessionData;
		} catch {
			return null;
		}
	}

	/**
	 * List available sessions
	 */
	async listSessions(
		options: ListSessionsOptions = {},
	): Promise<SessionMetadata[]> {
		const {
			limit = DEFAULT_SESSION_LIMIT,
			sortBy = 'lastAccessedAt',
			sortOrder = 'desc',
			workingDirectory,
		} = options;

		const index = await this.loadIndex();
		let sessions = Object.values(index.sessions);

		// Filter by working directory if specified
		if (workingDirectory) {
			sessions = sessions.filter(s => s.workingDirectory === workingDirectory);
		}

		// Sort
		sessions.sort((a, b) => {
			const aVal = a[sortBy];
			const bVal = b[sortBy];
			const diff = sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
			return diff;
		});

		// Limit
		return sessions.slice(0, limit);
	}

	/**
	 * Get the most recent session
	 */
	async getLastSession(): Promise<SessionData | null> {
		const sessions = await this.listSessions({limit: 1});
		if (sessions.length === 0) {
			return null;
		}
		return this.loadSession(sessions[0].id);
	}

	/**
	 * Delete a session
	 */
	async deleteSession(sessionId: string): Promise<boolean> {
		const index = await this.loadIndex();

		if (!index.sessions[sessionId]) {
			return false;
		}

		// Remove from index
		delete index.sessions[sessionId];
		await this.saveIndex(index);

		// Delete session file
		const sessionPath = this.getSessionPath(sessionId);
		if (existsSync(sessionPath)) {
			await fs.unlink(sessionPath);
		}

		return true;
	}

	/**
	 * Start auto-save timer
	 */
	startAutoSave(
		getState: () => {messages: Message[]; provider: string; model: string},
	): void {
		this.stopAutoSave();

		this.autoSaveTimer = setInterval(async () => {
			const {messages, provider, model} = getState();
			if (messages.length > 0) {
				await this.saveSession(messages, provider, model);
			}
		}, this.autoSaveIntervalMs);
	}

	/**
	 * Stop auto-save timer
	 */
	stopAutoSave(): void {
		if (this.autoSaveTimer) {
			clearInterval(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}
	}

	/**
	 * Clean up old sessions beyond the limit
	 */
	async cleanup(maxSessions: number = 100): Promise<number> {
		const index = await this.loadIndex();
		const sessions = Object.values(index.sessions);

		if (sessions.length <= maxSessions) {
			return 0;
		}

		// Sort by last accessed, oldest first
		sessions.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

		// Delete oldest sessions
		const toDelete = sessions.slice(0, sessions.length - maxSessions);
		for (const session of toDelete) {
			await this.deleteSession(session.id);
		}

		return toDelete.length;
	}
}

// Default instance
export const sessionManager = new SessionManager();
