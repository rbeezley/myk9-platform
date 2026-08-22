/**
 * MutationManager multi-tab concurrent-write safety tests
 *
 * Encodes invariants for the cross-tab flush lock (audit M1 / legacy R2), now
 * implemented in uploadPendingMutations via navigator.locks. Two tabs sharing
 * the module-global fake-indexeddb must not drop, duplicate, or double-apply a
 * mutation when they flush concurrently.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { type IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from '../MutationManager';
import type { PendingMutation } from '../types';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';
import { createMutationManagerTestDb } from '../test-utils/createMutationManagerTestDb';

/**
 * Faithful navigator.locks stub: serializes callbacks sharing a lock name (the
 * real cross-tab guarantee), rather than a passthrough that would let both
 * "tabs" run concurrently and defeat the test.
 */
function installSerializingLocksStub(): void {
  const chains = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis.navigator, 'locks', {
    value: {
      request: (name: string, cb: () => Promise<unknown>) => {
        const prev = chains.get(name) ?? Promise.resolve();
        const run = prev.then(() => cb());
        // Keep the chain alive even if cb rejects.
        chains.set(
          name,
          run.then(
            () => {},
            () => {}
          )
        );
        return run;
      },
    },
    writable: true,
    configurable: true,
  });
}

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
      update: vi.fn((_data: { id?: string }) => ({
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

function makeOptions(supabaseClient: SupabaseClient): MutationManagerOptions {
  return {
    maxRetries: 3,
    retryBackoffBase: 10,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentUserId: async () => 'test-user',
    getCurrentUploadContext: async () => ({ authUserId: 'test-user', supabaseClient }),
  };
}

function makeMutation(id: string, overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id,
    authUserId: 'test-user',
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
  let sharedDb: IDBPDatabase;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // fake-indexeddb is module-global: both MutationManager instances created
    // inside each test naturally share the same in-process IDB state, which
    // simulates two browser tabs sharing the same origin storage. Use the shared
    // helper so the FAILED_MUTATIONS / REPLICATED_TABLES stores the upload path
    // reads all exist.
    sharedDb = await createMutationManagerTestDb(TEST_DB_NAME);

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

    // Cross-tab flush lock (R2 / audit M1) is now implemented in
    // uploadPendingMutations via navigator.locks — install a serializing stub.
    installSerializingLocksStub();
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

  it('does not drop a mutation written in tab A when tab B flushes concurrently', async () => {
    const supabase = createTrackingSupabaseClient();
    const mgrA = new MutationManager(supabase, makeOptions(supabase));
    const mgrB = new MutationManager(supabase, makeOptions(supabase));

    const m1 = makeMutation('mut-tab-a-1');
    const m2 = makeMutation('mut-tab-b-1');

    // Enqueue one mutation per "tab"
    await mgrA.queueMutation(m1.tableName, m1.operation, m1.rowId, m1.data);
    await mgrB.queueMutation(m2.tableName, m2.operation, m2.rowId, m2.data);

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

  it('does not double-apply the same mutation if both tabs see it in the queue', async () => {
    const supabase = createTrackingSupabaseClient();
    const mgrA = new MutationManager(supabase, makeOptions(supabase));
    const mgrB = new MutationManager(supabase, makeOptions(supabase));

    // Prime shared IDB with a single mutation via mgrA
    const m1 = makeMutation('mut-shared-1');
    await mgrA.queueMutation(m1.tableName, m1.operation, m1.rowId, m1.data);

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
