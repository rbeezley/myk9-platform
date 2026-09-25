import { describe, expect, it, vi } from 'vitest';
import {
  compareNumberAscNullsLast,
  compareStringAscNullsLast,
  loadLookupMap,
  readWithReplicationFallback,
  sortedCopy,
} from './read-shape';

vi.mock('./replication-fallback', () => ({
  withReplicationFallback: vi.fn(async (replication: () => Promise<unknown>) => replication()),
}));

import { withReplicationFallback } from './replication-fallback';

const mockWithReplicationFallback = vi.mocked(withReplicationFallback);

describe('read-shape helpers', () => {
  it('returns successful replication result without PostgREST fallback', async () => {
    const replication = vi.fn().mockResolvedValue({ data: [{ id: 'one' }], error: null });
    const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'fallback' }], error: null });

    const result = await readWithReplicationFallback({
      replication,
      postgrest,
      table: 'entries',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [{ id: 'one' }], error: null });
    // The helper wraps `replication` in a closure (to capture rawLocalCount), so
    // the first arg is that wrapper, not the raw fn. Assert the pass-through args
    // and that the wrapper invokes the provided replication.
    expect(mockWithReplicationFallback).toHaveBeenCalledWith(
      expect.any(Function),
      postgrest,
      'entries',
      'select_all'
    );
    expect(replication).toHaveBeenCalledTimes(1);
    expect(postgrest).not.toHaveBeenCalled();
  });

  it('returns PostgREST fallback when replication throws', async () => {
    mockWithReplicationFallback.mockImplementationOnce(async (_replication, postgrest) =>
      postgrest()
    );
    const replication = vi.fn().mockRejectedValue(new Error('store unavailable'));
    const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'fallback' }], error: null });

    const result = await readWithReplicationFallback({
      replication,
      postgrest,
      table: 'dogs',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [{ id: 'fallback' }], error: null });
    expect(replication).not.toHaveBeenCalled();
    expect(postgrest).toHaveBeenCalledTimes(1);
  });

  it('returns error result shape when both read paths fail', async () => {
    const dbError = Object.assign(new Error('db unavailable'), { code: 'UNKNOWN' });
    mockWithReplicationFallback.mockRejectedValueOnce(dbError);

    const result = await readWithReplicationFallback({
      replication: vi.fn(),
      postgrest: vi.fn(),
      table: 'classes',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [], error: dbError });
  });

  describe('verifyOnlineWhenEmpty', () => {
    it('verifies a non-empty result from a never-synced scope online (MYK9-746)', async () => {
      const postgrest = vi
        .fn()
        .mockResolvedValue({ data: [{ id: 'one' }, { id: 'two' }], error: null });

      const result = await readWithReplicationFallback({
        replication: async () => ({ data: [{ id: 'one' }], error: null, scopeUnsynced: true }),
        postgrest,
        table: 'entries',
        operation: 'select_by_show',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(postgrest).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: [{ id: 'one' }, { id: 'two' }], error: null });
    });

    it('returns the online rows as-is over a stale clean local row, relations included', async () => {
      // A clean row cached by write-path hydration, older than the server's
      // copy and mapped without its dog; nothing on this device is unsaved.
      const online = [
        { id: 'one', check_in_status: 'not-checked-in', dog: { name: 'Scout' } },
        { id: 'two', check_in_status: 'not-checked-in', dog: { name: 'Pip' } },
      ];

      const result = await readWithReplicationFallback({
        replication: async () => ({
          data: [{ id: 'one', check_in_status: 'checked-in', dog: null }],
          error: null,
          scopeUnsynced: true,
          unsavedLocalWrites: false,
        }),
        postgrest: vi.fn().mockResolvedValue({ data: online, error: null }),
        table: 'entries',
        operation: 'select_by_class',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: online, error: null });
    });

    it('returns the local rows unverified, without an online read, while a write is unsaved', async () => {
      const postgrest = vi.fn();
      const onUnverified = vi.fn();

      const result = await readWithReplicationFallback({
        replication: async () => ({
          data: [{ id: 'one', check_in_status: 'checked-in' }],
          error: null,
          scopeUnsynced: true,
          unsavedLocalWrites: true,
        }),
        postgrest,
        table: 'entries',
        operation: 'select_by_show',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        onUnverified,
      });

      expect(postgrest).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [{ id: 'one', check_in_status: 'checked-in' }],
        error: null,
      });
      expect(onUnverified).toHaveBeenCalledOnce();
    });

    it('returns the caller error while a write is unsaved when verification is required', async () => {
      const postgrest = vi.fn();

      const result = await readWithReplicationFallback({
        replication: async () => ({
          data: [{ id: 'one' }],
          error: null,
          scopeUnsynced: true,
          unsavedLocalWrites: true,
        }),
        postgrest,
        table: 'entries',
        operation: 'select_by_show_report',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        errorOnOnlineVerificationFailure: true,
      });

      expect(postgrest).not.toHaveBeenCalled();
      expect(result.error).not.toBeNull();
    });

    it('keeps the local rows of a never-synced scope when the online read returns an error', async () => {
      const onUnverified = vi.fn();
      const result = await readWithReplicationFallback({
        replication: async () => ({ data: [{ id: 'one' }], error: null, scopeUnsynced: true }),
        postgrest: vi.fn().mockResolvedValue({
          data: [],
          error: Object.assign(new Error('upstream timeout'), { code: '57014' }),
        }),
        table: 'entries',
        operation: 'select_by_show',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        onUnverified,
      });

      expect(result).toEqual({ data: [{ id: 'one' }], error: null });
      expect(onUnverified).toHaveBeenCalledOnce();
    });

    it('fails a never-synced scope closed when verification is required and fails', async () => {
      const result = await readWithReplicationFallback({
        replication: async () => ({ data: [{ id: 'one' }], error: null, scopeUnsynced: true }),
        postgrest: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        table: 'entries',
        operation: 'select_by_show_report',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        errorOnOnlineVerificationFailure: true,
      });

      expect(result.error).not.toBeNull();
    });

    it('trusts a non-empty result from a synced scope without an online read', async () => {
      const postgrest = vi.fn();

      const result = await readWithReplicationFallback({
        replication: async () => ({ data: [{ id: 'one' }], error: null, scopeUnsynced: false }),
        postgrest,
        table: 'entries',
        operation: 'select_by_show',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(postgrest).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [{ id: 'one' }], error: null });
    });

    it('online-verifies a genuinely cold replica (empty result, no local tombstones)', async () => {
      const replication = vi.fn().mockResolvedValue({ data: [], error: null });
      const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'online' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [{ id: 'online' }], error: null });
      expect(postgrest).toHaveBeenCalledTimes(1);
    });

    it('excludes a locally-tombstoned row from the online read (no resurrection)', async () => {
      // The delete is queued locally but not yet synced, so the server still
      // returns the row as live. It must NOT reappear.
      const replication = vi
        .fn()
        .mockResolvedValue({ data: [], error: null, locallyDeletedIds: ['deleted-1'] });
      const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'deleted-1' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [], error: null });
      expect(postgrest).toHaveBeenCalledTimes(1);
    });

    it('surfaces a live remote row while excluding a locally-tombstoned one (cross-scope)', async () => {
      // Codex #1236 case: a dog spans multiple per-show stores. One synced show
      // holds a pending delete; another unsynced show holds a live entry. The
      // online read must surface the live entry AND drop the deleted one.
      const replication = vi
        .fn()
        .mockResolvedValue({ data: [], error: null, locallyDeletedIds: ['deleted-1'] });
      const postgrest = vi
        .fn()
        .mockResolvedValue({ data: [{ id: 'deleted-1' }, { id: 'live-2' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [{ id: 'live-2' }], error: null });
      expect(postgrest).toHaveBeenCalledTimes(1);
    });

    it('honors a custom rowId when excluding tombstones', async () => {
      const replication = vi
        .fn()
        .mockResolvedValue({ data: [], error: null, locallyDeletedIds: ['e-9'] });
      const postgrest = vi
        .fn()
        .mockResolvedValue({ data: [{ entryId: 'e-9' }, { entryId: 'e-10' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        rowId: row => String((row as { entryId: string }).entryId),
      });

      expect(result).toEqual({ data: [{ entryId: 'e-10' }], error: null });
    });

    it('does NOT online-verify when the replication result is non-empty', async () => {
      const replication = vi.fn().mockResolvedValue({ data: [{ id: 'local' }], error: null });
      const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'online' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [{ id: 'local' }], error: null });
      expect(postgrest).not.toHaveBeenCalled();
    });

    it('swallows online-verify failures and returns the original empty result', async () => {
      const replication = vi.fn().mockResolvedValue({ data: [], error: null });
      const postgrest = vi.fn().mockRejectedValue(new Error('offline'));

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [], error: null });
      expect(postgrest).toHaveBeenCalledTimes(1);
    });

    it('can surface an online verification failure for cold scopes', async () => {
      const replication = vi.fn().mockResolvedValue({ data: [], error: null });
      const postgrest = vi.fn().mockRejectedValue(new Error('offline'));

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'trials',
        operation: 'select_by_show',
        errorData: [],
        verifyOnlineWhenEmpty: true,
        errorOnOnlineVerificationFailure: true,
      });

      expect(result.data).toEqual([]);
      expect(result.error).toMatchObject({
        name: 'DatabaseError',
        message: 'offline',
        table: 'trials',
        operation: 'select_by_show_online_verify',
      });
    });

    it('does not online-verify an empty result when the flag is off (backwards compatible)', async () => {
      const replication = vi.fn().mockResolvedValue({ data: [], error: null });
      const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'online' }], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
      });

      expect(result).toEqual({ data: [], error: null });
      expect(postgrest).not.toHaveBeenCalled();
    });

    it('does not re-verify when the empty result came from the PostgREST fallback', async () => {
      // Replication threw, so withReplicationFallback already served an
      // authoritative online read — re-querying would double-call PostgREST.
      mockWithReplicationFallback.mockImplementationOnce(async (_replication, postgrest) =>
        postgrest()
      );
      const replication = vi.fn().mockRejectedValue(new Error('store unavailable'));
      const postgrest = vi.fn().mockResolvedValue({ data: [], error: null });

      const result = await readWithReplicationFallback({
        replication,
        postgrest,
        table: 'entries',
        operation: 'select_by_dog',
        errorData: [],
        verifyOnlineWhenEmpty: true,
      });

      expect(result).toEqual({ data: [], error: null });
      expect(postgrest).toHaveBeenCalledTimes(1);
    });
  });

  it('constructs lookup maps from loaded rows', async () => {
    const map = await loadLookupMap(
      async () => [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      row => row.id
    );

    expect(map.get('a')).toEqual({ id: 'a', name: 'Alpha' });
    expect(map.get('b')).toEqual({ id: 'b', name: 'Beta' });
  });

  it('sorts immutable copies with run-order nulls last', () => {
    const rows = [
      { id: 'nullish', runOrder: null },
      { id: 'third', runOrder: 3 },
      { id: 'first', runOrder: 1 },
      { id: 'missing' },
    ];

    const sorted = sortedCopy(
      rows,
      compareNumberAscNullsLast(row => row.runOrder)
    );

    expect(sorted.map(row => row.id)).toEqual(['first', 'third', 'nullish', 'missing']);
    expect(rows.map(row => row.id)).toEqual(['nullish', 'third', 'first', 'missing']);
  });

  it('sorts strings ascending with nulls last', () => {
    const rows = [
      { id: 'unscheduled', startTime: null },
      { id: 'late', startTime: '13:00:00' },
      { id: 'early', startTime: '08:00:00' },
      { id: 'missing' },
    ];

    const sorted = sortedCopy(
      rows,
      compareStringAscNullsLast(row => row.startTime)
    );

    expect(sorted.map(row => row.id)).toEqual(['early', 'late', 'unscheduled', 'missing']);
    expect(rows.map(row => row.id)).toEqual(['unscheduled', 'late', 'early', 'missing']);
  });
});
