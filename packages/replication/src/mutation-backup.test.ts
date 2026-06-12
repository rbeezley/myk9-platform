import { describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from './types';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';

function mutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: overrides.id ?? 'mut-1',
    tableName: overrides.tableName ?? 'entries',
    operation: overrides.operation ?? 'UPDATE',
    rowId: overrides.rowId ?? 'entry-1',
    data: overrides.data ?? { id: overrides.rowId ?? 'entry-1' },
    timestamp: overrides.timestamp ?? 1,
    retries: overrides.retries ?? 0,
    status: overrides.status ?? 'pending',
    error: overrides.error,
    failedAt: overrides.failedAt,
    nextRetryAt: overrides.nextRetryAt,
  };
}

describe('parseMutationBackup', () => {
  it('parses valid backup JSON into pending mutations', () => {
    const backup = [mutation({ id: 'mut-1' }), mutation({ id: 'mut-2', operation: 'INSERT' })];

    const result = parseMutationBackup(JSON.stringify(backup));

    expect(result.mutations.map(m => m.id)).toEqual(['mut-1', 'mut-2']);
    expect(result.malformedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('returns an empty result with an error for malformed JSON', () => {
    const result = parseMutationBackup('invalid json {{{');

    expect(result.mutations).toEqual([]);
    expect(result.malformedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('returns no mutations for missing, non-array, and empty-array payloads', () => {
    expect(parseMutationBackup(null).mutations).toEqual([]);
    expect(parseMutationBackup(JSON.stringify({ id: 'not-array' })).mutations).toEqual([]);
    expect(parseMutationBackup(JSON.stringify([])).mutations).toEqual([]);
  });

  it('discards malformed mutation rows and counts them', () => {
    const valid = mutation({ id: 'valid' });
    const malformed = [
      null,
      { id: 123, tableName: 'entries', operation: 'UPDATE', rowId: 'e1' },
      { id: 'bad-operation', tableName: 'entries', operation: 'UPSERT', rowId: 'e1' },
      { id: 'missing-row-id', tableName: 'entries', operation: 'UPDATE' },
    ];

    const result = parseMutationBackup(JSON.stringify([valid, ...malformed]));

    expect(result.mutations.map(m => m.id)).toEqual(['valid']);
    expect(result.malformedCount).toBe(4);
  });

  it('filters failed mutations before restore', () => {
    const pending = mutation({ id: 'pending' });
    const failed = mutation({
      id: 'failed',
      status: 'failed',
      error: 'Non-retryable error',
      failedAt: 1,
    });

    const result = parseMutationBackup(JSON.stringify([pending, failed]));

    expect(result.mutations.map(m => m.id)).toEqual(['pending']);
    expect(result.failedCount).toBe(1);
  });
});

describe('writeMutationBackup', () => {
  it('writes pending mutations to storage when the queue is non-empty', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const mutations = [mutation({ id: 'mut-1' })];

    writeMutationBackup(storage, mutations);

    expect(storage.setItem).toHaveBeenCalledWith(
      MUTATION_BACKUP_STORAGE_KEY,
      JSON.stringify(mutations)
    );
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('removes the backup when the queue is empty', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    writeMutationBackup(storage, []);

    expect(storage.removeItem).toHaveBeenCalledWith(MUTATION_BACKUP_STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
