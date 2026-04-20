/**
 * ReplicatedEntriesTable — scoring sync regression tests
 *
 * Guardrails for the 2026-03-29 scoring-sync data-loss bug:
 * - Symptom: scored dog saves to IDB but never reaches Supabase; a subsequent
 *   real-time push for the same row (with no score, since the server never
 *   received the mutation) would clobber the local dirty value.
 * - Root cause (closed by Phases 1–3 of the replication audit):
 *   * Phase 1 — dirty-row guard in `ReplicatedTable.set()`
 *   * Phase 2 — dirty-row guard in `batchSet` + atomic `batchSetChunked`
 *   * Phase 3 — `ConflictResolver.resolveFieldLevel` no longer lets a null
 *     local field clobber a real server value
 *
 * These tests lock the invariant in place.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { MutationManager } from '@myk9/replication';
import { ReplicatedEntriesTable, type Entry } from '../ReplicatedEntriesTable';
import './setup';

const TEST_DB_NAME = 'myK9Q';
const TEST_LICENSE_KEY = 'test-license-scoring-sync';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '1',
    armband: 101,
    handler: 'John Doe',
    dog_call_name: 'Buddy',
    class_id: 'class-1',
    entry_status: 'in-ring',
    is_scored: false,
    is_in_ring: true,
    license_key: TEST_LICENSE_KEY,
    ...overrides,
  };
}

/**
 * Minimal Supabase stub for MutationManager — returns a chainable builder.
 * Each terminal call (`select`, `update().eq().select`, `delete().eq().select`)
 * resolves to `{ data: [...], error: null }`.
 */
function makeSupabaseStub() {
  const updateCalls: Array<{ table: string; payload: Record<string, unknown>; id: string }> = [];
  const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const stub = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          insertCalls.push({ table, payload });
          return {
            select: () =>
              Promise.resolve({
                data: [{ id: (payload as { id?: string }).id ?? '1' }],
                error: null,
              }),
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: (_col: string, id: string) => {
              updateCalls.push({ table, payload, id: String(id) });
              return {
                select: () => Promise.resolve({ data: [{ id: String(id) }], error: null }),
              };
            },
          };
        },
        delete() {
          return {
            eq: (_col: string, id: string) => ({
              select: () => Promise.resolve({ data: [{ id: String(id) }], error: null }),
            }),
          };
        },
      };
    },
  };

  return { stub, updateCalls, insertCalls };
}

describe('ReplicatedEntriesTable: scoring sync (regression)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    await deleteDB(TEST_DB_NAME);
    table = new ReplicatedEntriesTable();
  });

  afterEach(async () => {
    await deleteDB(TEST_DB_NAME);
  });

  it('preserves a locally-scored entry when a real-time update arrives without the score', async () => {
    // Arrange — seed a clean "in-ring" entry from the server (isDirty=false)
    const seed = makeEntry({ id: 'dog-1', is_scored: false });
    await table.set(seed.id, seed, false);

    // Act 1 — user scores the dog locally. `markAsScored(..., queueMutation=true)`
    // maps through to `set(entryId, updated, isDirty=true)`, which is what a
    // real user action would do. We pass `true` here so the row is marked
    // dirty and the Phase 1 guard applies. No MutationManager is attached, so
    // the enqueue attempt just logs a warning and returns.
    await table.markAsScored(
      seed.id,
      {
        search_time_seconds: 45,
        total_faults: 1,
        result_status: 'qualified',
      },
      true
    );

    // Confirm the dirty write landed
    const afterLocalScore = await table.get(seed.id);
    expect(afterLocalScore?.is_scored).toBe(true);
    expect(afterLocalScore?.result_status).toBe('qualified');
    expect(afterLocalScore?.search_time_seconds).toBe(45);

    // Act 2 — real-time push arrives for the same row, but without the score
    // because the server hasn't seen the mutation yet. This simulates the
    // exact race the 2026-03-29 bug report described: replication pull
    // overwrites local-only data.
    const serverPush = makeEntry({
      id: 'dog-1',
      is_scored: false,
      result_status: undefined,
      search_time_seconds: undefined,
      total_faults: undefined,
      entry_status: 'in-ring',
    });

    // A clean push MUST be ignored by the dirty-row guard (Phase 1 fix).
    await table.set(serverPush.id, serverPush, false);

    // Assert — local scored values are preserved
    const afterServerPush = await table.get(seed.id);
    expect(afterServerPush?.is_scored).toBe(true);
    expect(afterServerPush?.result_status).toBe('qualified');
    expect(afterServerPush?.search_time_seconds).toBe(45);
    expect(afterServerPush?.total_faults).toBe(1);
  });

  it('flushes the queued scoring mutation to supabase on next sync', async () => {
    // Arrange — wire a real MutationManager with a Supabase stub
    const { stub, updateCalls } = makeSupabaseStub();
    const mutationManager = new MutationManager(
      stub as unknown as Parameters<typeof MutationManager.prototype.constructor>[0] extends never
        ? never
        : ConstructorParameters<typeof MutationManager>[0],
      { maxRetries: 1, retryBackoffBase: 10 }
    );
    table.setMutationManager(mutationManager);

    // Seed a clean entry
    const seed = makeEntry({ id: 'dog-2', is_scored: false });
    await table.set(seed.id, seed, false);

    // Queue a scoring mutation via the MutationManager directly (simulates
    // what the scoring wrapper does: set(..., isDirty=true) + queueMutation()).
    await table.set(
      seed.id,
      {
        ...seed,
        is_scored: true,
        entry_status: 'completed',
        result_status: 'qualified',
        search_time_seconds: 52,
        total_faults: 0,
      },
      true
    );
    await mutationManager.queueMutation('entries', 'UPDATE', seed.id, {
      id: seed.id,
      is_scored: true,
      entry_status: 'completed',
      result_status: 'qualified',
      search_time_seconds: 52,
      total_faults: 0,
    });

    // Verify the mutation is queued
    expect(await mutationManager.getPendingCount()).toBe(1);

    // Act — flush the queue (e.g. on reconnect)
    const results = await mutationManager.uploadPendingMutations();

    // Assert — mutation reached Supabase and cleared the queue
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(await mutationManager.getPendingCount()).toBe(0);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('entries');
    expect(updateCalls[0].id).toBe(seed.id);
    expect(updateCalls[0].payload).toMatchObject({
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 52,
    });
  });

  it('preserves local dirty state through a batchSet (Phase 2 guard)', async () => {
    // Arrange — seed + locally score
    const seed = makeEntry({ id: 'dog-3', is_scored: false });
    await table.set(seed.id, seed, false);

    await table.markAsScored(
      seed.id,
      { search_time_seconds: 38, total_faults: 0, result_status: 'qualified' },
      true
    );

    // Act — incremental sync pulls a batch of "clean" server rows, including
    // dog-3 with no score. This is how `ReplicatedEntriesTable.sync()` commits
    // remote data on line 165 via `this.batchSet(entriesToCache)`.
    const serverBatch: Entry[] = [
      makeEntry({
        id: 'dog-3',
        is_scored: false,
        result_status: undefined,
        search_time_seconds: undefined,
        total_faults: undefined,
      }),
      makeEntry({ id: 'dog-4', armband: 102, dog_call_name: 'Max', is_scored: false }),
    ];

    await table.batchSet(serverBatch);

    // Assert — dog-3 keeps its local dirty score; dog-4 lands fresh
    const dog3 = await table.get('dog-3');
    expect(dog3?.is_scored).toBe(true);
    expect(dog3?.result_status).toBe('qualified');
    expect(dog3?.search_time_seconds).toBe(38);

    const dog4 = await table.get('dog-4');
    expect(dog4?.id).toBe('dog-4');
    expect(dog4?.armband).toBe(102);
  });
});

// Ensure the suite doesn't leak pending timers between tests.
afterEach(() => {
  vi.useRealTimers();
});
