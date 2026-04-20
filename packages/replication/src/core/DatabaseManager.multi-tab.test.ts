/**
 * MutationManager multi-tab concurrent-write safety tests
 *
 * These tests encode invariants for HIGH finding R2 (cross-tab flush lock).
 * They are .skip-ped until R2 is fixed — see
 * docs/replication-audit/phase-4-database-manager.md.
 *
 * When un-skipping:
 *  1. Implement navigator.locks.request('myk9-replication-flush', ...) inside
 *     uploadPendingMutations with a graceful fallback.
 *  2. Add navigator.locks stub support to vitest setup (see comment in
 *     beforeEach below).
 *  3. Remove the .skip modifier from both tests.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from '../MutationManager';
import type { PendingMutation } from '../types';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';

// ---------------------------------------------------------------------------
// Shared test helpers (mirrors MutationManager.test.ts harness)
// ---------------------------------------------------------------------------

const TEST_DB_NAME = 'test-multi-tab-db';

/**
 * Build a mock Supabase client that records every mutation id it receives so
 * tests can assert exactly which mutations were uploaded and how many times.
 */
function createTrackingSupabaseClient() {
  const seen: string[] = [];

  const mockClient = {
    from: vi.fn((_table: string) => ({
      insert: vi.fn((data: { id?: string } | { id?: string }[]) => {
        const rows = Array.isArray(data) ? data : [data];
        rows.forEach(r => r.id && seen.push(r.id));
        return {
          select: vi.fn(() =>
            Promise.resolve({ data: rows.map(r => ({ id: r.id })), error: null })
          ),
        };
      }),
      update: vi.fn((data: { id?: string }) => ({
        eq: vi.fn((_col: string, id: string) => {
          seen.push(id);
          return {
            select: vi.fn(() => Promise.resolve({ data: [{ id }], error: null })),
          };
        }),
      })),
      upsert: vi.fn((data: { id?: string } | { id?: string }[]) => {
        const rows = Array.isArray(data) ? data : [data];
        rows.forEach(r => r.id && seen.push(r.id));
        return {
          select: vi.fn(() =>
            Promise.resolve({ data: rows.map(r => ({ id: r.id })), error: null })
          ),
        };
      }),
      delete: vi.fn(() => ({
        eq: vi.fn((_col: string, id: string) => {
          seen.push(id);
          return {
            select: vi.fn(() => Promise.resolve({ data: [{ id }], error: null })),
          };
        }),
      })),
    })),
    _seen: seen,
  };

  return mockClient as unknown as SupabaseClient & { _seen: string[] };
}

function makeOptions(): MutationManagerOptions {
  return {
    maxRetries: 3,
    retryBackoffBase: 10,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

function makeMutation(id: string, overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: id,
    data: { id, handler_name: 'Test Handler' },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending' as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MutationManager multi-tab concurrent-write safety', () => {
  // These tests encode invariants for HIGH finding R2 (cross-tab flush lock).
  // They are .skipped until R2 is fixed — see docs/replication-audit/phase-4-database-manager.md.

  let sharedDb: IDBPDatabase;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // fake-indexeddb is module-global: both MutationManager instances created
    // inside each test naturally share the same in-process IDB state, which
    // simulates two browser tabs sharing the same origin storage.
    sharedDb = await openDB(TEST_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
          db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, { keyPath: 'id' });
        }
      },
    });

    // Both managers share the same IDB handle via the databaseManager mock.
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(sharedDb);

    // Stub globals that MutationManager references.
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    // NOTE for R2 implementors: once navigator.locks is used inside
    // uploadPendingMutations you will also need to stub it here, e.g.:
    //   Object.defineProperty(globalThis.navigator, 'locks', {
    //     value: {
    //       request: vi.fn(async (_name, _opts, fn) => fn()),
    //     },
    //     configurable: true,
    //   });
  });

  afterEach(async () => {
    if (sharedDb) {
      try {
        const tx = sharedDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch {
        // ignore cleanup errors
      }
      sharedDb.close();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.skip('does not drop a mutation written in tab A when tab B flushes concurrently', async () => {
    // Real implementation (un-skip once R2 is fixed):
    //   Arrange: two MutationManager instances sharing the same fake-indexeddb (fake-indexeddb is module-global
    //     so two instances naturally share state).
    //   Stub Supabase client to record observed mutation ids.
    //   Act: mgrA.queueMutation(m1); mgrB.queueMutation(m2); await Promise.all([mgrA.uploadPendingMutations(), mgrB.uploadPendingMutations()]);
    //   Assert: supabase stub saw m1 and m2 exactly once each (no drops, no duplicates).

    const supabase = createTrackingSupabaseClient();
    const mgrA = new MutationManager(supabase, makeOptions());
    const mgrB = new MutationManager(supabase, makeOptions());

    const m1 = makeMutation('mut-tab-a-1');
    const m2 = makeMutation('mut-tab-b-1');

    // Enqueue one mutation per "tab"
    await mgrA.queueMutation(m1);
    await mgrB.queueMutation(m2);

    // Both tabs flush concurrently — the race condition under test
    await Promise.all([mgrA.uploadPendingMutations(), mgrB.uploadPendingMutations()]);

    const seen = supabase._seen;

    // Each mutation must appear at least once (no drops)
    expect(seen).toContain(m1.rowId);
    expect(seen).toContain(m2.rowId);

    // Each mutation must appear exactly once (no duplicates)
    const m1Count = seen.filter(id => id === m1.rowId).length;
    const m2Count = seen.filter(id => id === m2.rowId).length;
    expect(m1Count).toBe(1);
    expect(m2Count).toBe(1);

    mgrA.destroy();
    mgrB.destroy();
  });

  it.skip('does not double-apply the same mutation if both tabs see it in the queue', async () => {
    // Real implementation (un-skip once R2 is fixed):
    //   Arrange: prime shared IDB with one queued mutation m1.
    //   Act: await Promise.all([mgrA.uploadPendingMutations(), mgrB.uploadPendingMutations()]);
    //   Assert: supabase stub saw m1 exactly once.

    const supabase = createTrackingSupabaseClient();
    const mgrA = new MutationManager(supabase, makeOptions());
    const mgrB = new MutationManager(supabase, makeOptions());

    // Prime shared IDB with a single mutation via mgrA
    const m1 = makeMutation('mut-shared-1');
    await mgrA.queueMutation(m1);

    // Both tabs attempt to flush the same queue simultaneously
    await Promise.all([mgrA.uploadPendingMutations(), mgrB.uploadPendingMutations()]);

    const seen = supabase._seen;

    // The mutation must have been applied exactly once
    const m1Count = seen.filter(id => id === m1.rowId).length;
    expect(m1Count).toBe(1);

    mgrA.destroy();
    mgrB.destroy();
  });
});
