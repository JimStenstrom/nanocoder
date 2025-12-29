/**
 * Log query interface for searching and analyzing log data
 * Provides powerful filtering, searching, and analytics capabilities
 */

// Re-export global storage instance (used by logging system)
export {globalLogStorage} from './storage/log-storage';
// Re-export types (may be used for type annotations)
export type {
	AggregationOptions,
	AggregationResult,
	LogEntry,
	LogQuery,
	QueryResult,
} from './types';

/**
 * Internal exports - import directly from specific modules if needed:
 * - LogStorage: './storage/log-storage'
 * - LogQueryBuilder, createLogQuery: './query/query-builder'
 * - logQueries: './utils/helpers'
 */
