import { MUTATION_OPERATIONS, type PendingMutation } from './types';

export const MUTATION_BACKUP_STORAGE_KEY = 'replication_mutation_backup';

export interface MutationBackupParseResult {
  /** Pending (not-yet-synced) mutations — restored into the active queue. */
  mutations: PendingMutation[];
  /**
   * Dead-lettered mutations (`status === 'failed'`) — restored into the failed
   * store, NOT the active queue, so they don't auto-retry but survive a DB wipe
   * for the judge to review (retry/discard). Previously these were discarded,
   * so a circuit-breaker DB delete destroyed them permanently.
   */
  failedMutations: PendingMutation[];
  malformedCount: number;
  failedCount: number;
  error?: Error;
}

export type MutationBackupStorage = Pick<Storage, 'removeItem' | 'setItem'>;

function isBackupMutation(value: unknown): value is PendingMutation {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const hasValidOwner =
    !Object.prototype.hasOwnProperty.call(candidate, 'authUserId') ||
    (typeof candidate.authUserId === 'string' && candidate.authUserId.trim().length > 0);
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tableName === 'string' &&
    typeof candidate.operation === 'string' &&
    MUTATION_OPERATIONS.includes(candidate.operation as PendingMutation['operation']) &&
    typeof candidate.rowId === 'string' &&
    hasValidOwner
  );
}

export function parseMutationBackup(raw: string | null): MutationBackupParseResult {
  if (!raw) {
    return { mutations: [], failedMutations: [], malformedCount: 0, failedCount: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      mutations: [],
      failedMutations: [],
      malformedCount: 0,
      failedCount: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { mutations: [], failedMutations: [], malformedCount: 0, failedCount: 0 };
  }

  const valid = parsed.filter(isBackupMutation);
  const mutations = valid.filter(mutation => mutation.status !== 'failed');
  const failedMutations = valid.filter(mutation => mutation.status === 'failed');

  return {
    mutations,
    failedMutations,
    malformedCount: parsed.length - valid.length,
    failedCount: failedMutations.length,
  };
}

export function writeMutationBackup(
  storage: MutationBackupStorage,
  mutations: PendingMutation[]
): void {
  if (mutations.length > 0) {
    storage.setItem(MUTATION_BACKUP_STORAGE_KEY, JSON.stringify(mutations));
  } else {
    storage.removeItem(MUTATION_BACKUP_STORAGE_KEY);
  }
}
