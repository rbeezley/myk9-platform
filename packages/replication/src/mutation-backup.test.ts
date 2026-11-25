import { describe, expect, it } from 'vitest';
import type { PendingMutation } from './types';
import {
  compactMutationJournal,
  JOURNAL_ENTRY_PREFIX,
  JOURNAL_TOMBSTONE_PREFIX,
  JOURNAL_TOMBSTONE_TTL_MS,
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  readMutationJournal,
  removeJournalEntries,
  upsertJournalEntries,
} from './mutation-backup';
import { createMemoryStorage, journalIds } from './test-utils/memoryStorage';

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

  it('separates failed mutations from the active queue but PRESERVES them for restore', () => {
    const pending = mutation({ id: 'pending' });
    const failed = mutation({
      id: 'failed',
      status: 'failed',
      error: 'Non-retryable error',
      failedAt: 1,
    });

    const result = parseMutationBackup(JSON.stringify([pending, failed]));

    // Pending mutations restore into the active queue.
    expect(result.mutations.map(m => m.id)).toEqual(['pending']);
    // Failed mutations are NOT discarded — they are returned separately so a
    // DB-wipe recovery can restore them into the failed store for review.
    expect(result.failedMutations.map(m => m.id)).toEqual(['failed']);
    expect(result.failedCount).toBe(1);
  });

  it('preserves authenticated ownership for pending and failed backup rows', () => {
    const pending = { ...mutation({ id: 'pending' }), authUserId: 'user-a' };
    const failed = {
      ...mutation({ id: 'failed', status: 'failed', failedAt: 1 }),
      authUserId: 'user-b',
    };

    const result = parseMutationBackup(JSON.stringify([pending, failed]));

    expect(result.mutations[0]).toMatchObject({ id: 'pending', authUserId: 'user-a' });
    expect(result.failedMutations[0]).toMatchObject({ id: 'failed', authUserId: 'user-b' });
  });

  it.each([null, '', '   ', 42, { id: 'not-a-string' }])(
    'rejects a backup row with malformed owner metadata %j',
    authUserId => {
      const result = parseMutationBackup(
        JSON.stringify([{ ...mutation({ id: 'malformed-owner' }), authUserId }])
      );

      expect(result.mutations).toEqual([]);
      expect(result.malformedCount).toBe(1);
    }
  );
});

describe('mutation journal (MYK9-2360)', () => {
  it('upserts one entry per mutation and never removes others', () => {
    const stored: Record<string, string> = {};
    const storage = createMemoryStorage(stored);
    upsertJournalEntries(storage, [mutation({ id: 'a' })]);
    upsertJournalEntries(storage, [mutation({ id: 'b' })]);
    expect(journalIds(stored).sort()).toEqual(['a', 'b']);
  });

  it('a tombstoned mutation is never written back or read back', () => {
    const stored: Record<string, string> = {};
    const storage = createMemoryStorage(stored);
    upsertJournalEntries(storage, [mutation({ id: 'a' })]);
    removeJournalEntries(storage, ['a'], 1000);
    upsertJournalEntries(storage, [mutation({ id: 'a' })]);
    expect(journalIds(stored)).toEqual([]);
    expect(stored[JOURNAL_TOMBSTONE_PREFIX + 'a']).toBe('1000');
    stored[JOURNAL_ENTRY_PREFIX + 'a'] = JSON.stringify(mutation({ id: 'a' }));
    expect(readMutationJournal(storage).mutations).toEqual([]);
  });

  it('reads entries and the legacy snapshot, split by status, counting unreadable entries', () => {
    const stored: Record<string, string> = {
      [MUTATION_BACKUP_STORAGE_KEY]: JSON.stringify([
        mutation({ id: 'legacy' }),
        mutation({ id: 'a' }),
      ]),
      [JOURNAL_ENTRY_PREFIX + 'a']: JSON.stringify(mutation({ id: 'a' })),
      [JOURNAL_ENTRY_PREFIX + 'f']: JSON.stringify(mutation({ id: 'f', status: 'failed' })),
      [JOURNAL_ENTRY_PREFIX + 'bad']: '{not json',
    };
    const journal = readMutationJournal(createMemoryStorage(stored));
    expect(journal.mutations.map(m => m.id).sort()).toEqual(['a', 'legacy']);
    expect(journal.failedMutations.map(m => m.id)).toEqual(['f']);
    expect(journal.malformedCount).toBe(1);
  });

  it('compaction migrates the legacy snapshot and drops tombstoned entries and old tombstones', () => {
    const now = 10 * JOURNAL_TOMBSTONE_TTL_MS;
    const stored: Record<string, string> = {
      [MUTATION_BACKUP_STORAGE_KEY]: JSON.stringify([mutation({ id: 'legacy' })]),
      [JOURNAL_ENTRY_PREFIX + 'gone']: JSON.stringify(mutation({ id: 'gone' })),
      [JOURNAL_TOMBSTONE_PREFIX + 'gone']: String(now - 1),
      [JOURNAL_TOMBSTONE_PREFIX + 'old']: String(now - JOURNAL_TOMBSTONE_TTL_MS - 1),
    };
    compactMutationJournal(createMemoryStorage(stored), now);
    expect(stored[MUTATION_BACKUP_STORAGE_KEY]).toBeUndefined();
    expect(journalIds(stored)).toEqual(['legacy']);
    expect(stored[JOURNAL_TOMBSTONE_PREFIX + 'gone']).toBe(String(now - 1));
    expect(stored[JOURNAL_TOMBSTONE_PREFIX + 'old']).toBeUndefined();
  });
});
