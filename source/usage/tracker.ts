/**
 * Usage tracker
 * Tracks current session usage
 *
 * Uses unified session service (issue #229) for session ID.
 */

import {getModelContextLimit} from '@/models/index';
import {getSessionId} from '@/session';
import type {Message} from '@/types/core';
import type {Tokenizer} from '@/types/tokenization';
import {getLogger} from '@/utils/logging';
import type {CurrentSessionStats, SessionUsage} from '../types/usage';
import {calculateTokenBreakdown} from './calculator';
import {addSession} from './storage';

export class SessionTracker {
	private sessionId: string;
	private startTime: number;
	private provider: string;
	private model: string;

	constructor(provider: string, model: string) {
		const logger = getLogger();
		// Use shared session ID from unified session service
		this.sessionId = getSessionId();
		this.startTime = Date.now();
		this.provider = provider;
		this.model = model;

		logger.debug('SessionTracker created', {
			sessionId: this.sessionId,
			provider,
			model,
		});
	}

	async getCurrentStats(
		messages: Message[],
		tokenizer: Tokenizer,
	): Promise<CurrentSessionStats> {
		const breakdown = calculateTokenBreakdown(messages, tokenizer);
		const contextLimit = await getModelContextLimit(this.model);
		const percentUsed = contextLimit
			? (breakdown.total / contextLimit) * 100
			: 0;

		return {
			tokens: breakdown,
			messageCount: messages.length,
			startTime: this.startTime,
			provider: this.provider,
			model: this.model,
			contextLimit,
			percentUsed,
		};
	}

	saveSession(messages: Message[], tokenizer: Tokenizer): void {
		const breakdown = calculateTokenBreakdown(messages, tokenizer);
		const duration = Date.now() - this.startTime;

		const session: SessionUsage = {
			id: this.sessionId,
			timestamp: this.startTime,
			provider: this.provider,
			model: this.model,
			tokens: breakdown,
			messageCount: messages.length,
			duration,
		};

		addSession(session);
	}

	updateProviderModel(provider: string, model: string): void {
		const logger = getLogger();
		logger.debug('SessionTracker provider/model updated', {
			sessionId: this.sessionId,
			previousProvider: this.provider,
			previousModel: this.model,
			newProvider: provider,
			newModel: model,
		});
		this.provider = provider;
		this.model = model;
	}

	getSessionInfo(): {
		id: string;
		startTime: number;
		provider: string;
		model: string;
	} {
		return {
			id: this.sessionId,
			startTime: this.startTime,
			provider: this.provider,
			model: this.model,
		};
	}
}

let currentSessionTracker: SessionTracker | null = null;

export function initializeSession(provider: string, model: string): void {
	const logger = getLogger();
	logger.debug('Usage session initializing', {provider, model});
	currentSessionTracker = new SessionTracker(provider, model);
}

export function getCurrentSession(): SessionTracker | null {
	return currentSessionTracker;
}

export function clearCurrentSession(): void {
	const logger = getLogger();
	logger.debug('Usage session cleared', {
		previousSessionId: currentSessionTracker?.getSessionInfo().id,
	});
	currentSessionTracker = null;
}
