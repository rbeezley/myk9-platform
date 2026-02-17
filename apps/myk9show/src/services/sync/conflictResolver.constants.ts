import type { ConflictResolverConfig, ConflictMetrics } from './conflictResolver.types';

/** Default configuration for the conflict resolver */
export const DEFAULT_CONFLICT_RESOLVER_CONFIG: ConflictResolverConfig = {
  defaultStrategy: 'newest_wins',
  autoResolveThreshold: 0.8,
  maxConflictAge: 24 * 60 * 60 * 1000, // 24 hours
  enableSmartMerging: true,
  enableFieldLevelResolution: true,
  enableUserPreferences: true,
};

/** Interval in ms for the cleanup routine (1 hour) */
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Create a fresh metrics object with all counters zeroed */
export function createInitialMetrics(): ConflictMetrics {
  return {
    totalConflicts: 0,
    resolvedConflicts: 0,
    autoResolvedConflicts: 0,
    manualResolvedConflicts: 0,
    conflictsByStrategy: {
      local_wins: 0,
      remote_wins: 0,
      server_wins: 0,
      merge_automatic: 0,
      merge_manual: 0,
      newest_wins: 0,
      user_decides: 0,
      escalate: 0,
      retry_later: 0,
      ignore: 0,
      rollback: 0,
    },
    averageResolutionTime: 0,
    conflictsByEntity: {},
  };
}
