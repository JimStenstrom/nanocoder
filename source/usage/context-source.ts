import type {ApiUsage, ApiUsageSnapshot, ContextSource} from '@/types/core';

export interface ContextUsageResult {
	percent: number;
	source: ContextSource;
}

export interface ResolvedContextTokens {
	tokens: number;
	source: ContextSource;
}

function isFiniteNumber(value: number | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Derive the context tokens occupied from a provider-reported usage object, or
 * `undefined` when the report isn't usable as a context numerator.
 *
 * Preference order:
 *   1. `inputTokens + outputTokens` — the prompt the model saw plus the reply
 *      just appended to history, which together equal the context now occupied.
 *   2. `totalTokens` — when the provider reports only a lump sum (no split).
 *
 * `inputTokens` (or a reported `totalTokens`) is required: a lone `outputTokens`
 * value describes only the reply and must NOT masquerade as the whole context,
 * which would otherwise show a confidently-wrong near-zero percentage. Non-finite
 * fields (NaN/Infinity) are treated as absent.
 */
function apiContextTokens(usage: ApiUsage): number | undefined {
	if (isFiniteNumber(usage.inputTokens)) {
		const output = isFiniteNumber(usage.outputTokens) ? usage.outputTokens : 0;
		return usage.inputTokens + output;
	}
	if (isFiniteNumber(usage.totalTokens)) {
		return usage.totalTokens;
	}
	return undefined;
}

/**
 * Resolve the context-occupancy token count and whether it is API-reported or
 * estimated.
 *
 * API usage is preferred only while it is "fresh" — no new messages have been
 * appended since it was captured (`atMessageCount` still matches the current
 * conversation length) and it carries a usable numerator. Otherwise we fall
 * back to the live client-side estimate so the figure never lags the
 * conversation (e.g. right after the user types a new message, before the next
 * response refreshes the snapshot).
 */
export function resolveContextTokens(params: {
	estimatedTotalTokens: number;
	apiSnapshot: ApiUsageSnapshot | null;
	currentMessageCount: number;
}): ResolvedContextTokens {
	const {estimatedTotalTokens, apiSnapshot, currentMessageCount} = params;

	const apiTotal =
		apiSnapshot !== null && apiSnapshot.atMessageCount === currentMessageCount
			? apiContextTokens(apiSnapshot)
			: undefined;

	return apiTotal !== undefined
		? {tokens: apiTotal, source: 'api'}
		: {tokens: estimatedTotalTokens, source: 'estimate'};
}

/**
 * Decide the context-usage percentage and whether it is API-reported or
 * estimated, by resolving the occupancy tokens (see {@link resolveContextTokens})
 * against the context limit.
 */
export function resolveContextUsage(params: {
	estimatedTotalTokens: number;
	apiSnapshot: ApiUsageSnapshot | null;
	currentMessageCount: number;
	contextLimit: number;
}): ContextUsageResult {
	const {contextLimit, ...rest} = params;

	// Guard the exported helper against a zero/invalid limit; callers normally
	// pass a positive limit (the hook bails when it can't resolve one).
	if (!(contextLimit > 0)) {
		return {percent: 0, source: 'estimate'};
	}

	const {tokens, source} = resolveContextTokens(rest);
	return {percent: Math.round((tokens / contextLimit) * 100), source};
}
