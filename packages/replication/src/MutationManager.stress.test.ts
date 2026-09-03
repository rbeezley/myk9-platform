/**
 * MutationManager: large-queue stress tests
 *
 * Tests flush correctness at scale (500 mutations) and resilience to a
 * mid-flush Supabase failure on exactly one mutation.
 *
 * Reuses the same Supabase stub + setup pattern as MutationManager.test.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import type { PendingMutation } from './types';
import type { Logger } from './dependencies';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

// ---------------------------------------------------------------------------
// Harness helpers (mirrored from MutationManager.test.ts)
// ---------------------------------------------------------------------------

const STRESS_DB_NAME = 'test-mutation-manager-stress-db';

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/** Build a call-tracking Supabase mock. */
function createTrackingMockSupabase(onObserve: (id: string) => void): SupabaseClient {
  const mock = {
    from: vi.fn((_table: string) => ({
      insert: vi.fn((data: Record<string, unknown>) => ({
        select: vi.fn(() => {
          onObserve(data.id as string);
          return Promise.resolve({ data: [{ id: data.id }], error: null });
        }),
      })),
      update: vi.fn((data: Record<string, unknown>) => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => {
            onObserve(data.id as string);
            return Promise.resolve({ data: [{ id: data.id }], error: null });
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'x' }], error: null })),
        })),
      })),
    })),
  };
  return mock as unknown as SupabaseClient;
}

function makeMutationRecord(
  id: string,
  tableIndex: number,
  overrides: Partial<PendingMutation> = {}
): PendingMutation {
  const tables = ['entries', 'classes', 'shows', 'trials', 'dogs'];
  return {
    id,
    authUserId: 'test-user',
    tableName: tables[tableIndex % tables.length]!,
    operation: 'UPDATE',
    rowId: id,
    data: { id },
    timestamp: Date.now() + tableIndex,
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('MutationManager: large-queue stress', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let mockLogger: Logger;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    // Default to real timers. The retry test controls only Date and timeout
    // timers explicitly; IDB's setImmediate tasks must remain real.
    vi.useRealTimers();

    mockDb = await createMutationManagerTestDb(STRESS_DB_NAME);

    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    localStorageMock = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => {
          localStorageMock = {};
        },
        length: 0,
        key: () => null,
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

    mockLogger = createMockLogger();

    const initialSupabase = createTrackingMockSupabase(() => {});
    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: mockLogger,
      getCurrentUserId: async () => 'test-user',
      getCurrentUploadContext: async () => ({
        authUserId: 'test-user',
        supabaseClient: initialSupabase,
      }),
    };

    // mockSupabase is set per-test below
    manager = new MutationManager(initialSupabase, options);
  });

  afterEach(async () => {
    manager.destroy();
    if (mockDb) {
      try {
        const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch {
        // ignore cleanup errors
      }
      mockDb.close();
    }
    localStorageMock = {};
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1: 500 mutations across 5 tables — no drops
  // -------------------------------------------------------------------------
  it('flushes 500 queued mutations without dropping any', async () => {
    const TOTAL = 500;
    const observedIds = new Set<string>();

    // Re-create manager with tracking mock
    manager.destroy();
    const trackingSupabase = createTrackingMockSupabase(id => observedIds.add(id));
    manager = new MutationManager(trackingSupabase, {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: mockLogger,
      getCurrentUserId: async () => 'test-user',
      getCurrentUploadContext: async () => ({
        authUserId: 'test-user',
        supabaseClient: trackingSupabase,
      }),
    });
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    // Arrange: enqueue 500 mutations (100 per table, 5 tables)
    const enqueuedIds: string[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const id = `stress-${i.toString().padStart(4, '0')}`;
      enqueuedIds.push(id);
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutationRecord(id, i));
    }

    // Act: flush once
    const results = await manager.uploadPendingMutations();

    // Assert: all 500 observed, queue is empty
    expect(results).toHaveLength(TOTAL);
    expect(results.every(r => r.success)).toBe(true);

    const surviving = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    expect(surviving).toHaveLength(0);

    // Every enqueued id was observed exactly once
    for (const id of enqueuedIds) {
      expect(observedIds.has(id)).toBe(true);
    }
    expect(observedIds.size).toBe(TOTAL);
  }, 30_000);

  // -------------------------------------------------------------------------
  // Test 2: mid-flush failure at one specific mutation — retry without duplicates
  //
  // Strategy: use a known mutation id ('mid-fail') that will be the target of
  // a one-shot failure. All other mutations succeed on first attempt.
  // After flush 1, the failed mutation is still in IDB; flush 2 retries it.
  // We assert: every id appears exactly once in the final observed set (no
  // duplicates from the first 499 that succeeded, no drops from the failed one).
  //
  // Control time without auto-advancing timers: the backoff can expire during
  // a slow first flush, allowing an automatic retry to start during the next
  // IDB read. destroy() cannot cancel an already-running upload, and a manual
  // flush then returns early. Move wall time only between completed flushes
  // so we test retry eligibility without competing background uploads.
  // -------------------------------------------------------------------------
  it(
    'survives a mid-flush failure at mutation 250 — retries on next flush without duplicating the first 249',
    { timeout: 30_000 },
    async () => {
      const TOTAL = 500;
      const observedIds: string[] = [];
      const FAIL_ID = 'mid-fail-target';
      let hasThrown = false;

      manager.destroy();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });

      // Build supabase mock that throws exactly once for FAIL_ID, then succeeds.
      const midFlushMock = {
        from: vi.fn((_table: string) => ({
          insert: vi.fn((data: Record<string, unknown>) => ({
            select: vi.fn(() => {
              observedIds.push(data.id as string);
              return Promise.resolve({ data: [{ id: data.id }], error: null });
            }),
          })),
          update: vi.fn((data: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => {
                const id = data.id as string;
                if (id === FAIL_ID && !hasThrown) {
                  hasThrown = true;
                  return Promise.reject(new TypeError('fetch failed'));
                }
                observedIds.push(id);
                return Promise.resolve({ data: [{ id }], error: null });
              }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: [{ id: 'x' }], error: null })),
            })),
          })),
        })),
      } as unknown as SupabaseClient;

      manager = new MutationManager(midFlushMock, {
        maxRetries: 3,
        retryBackoffBase: 10,
        logger: mockLogger,
        getCurrentUserId: async () => 'test-user',
        getCurrentUploadContext: async () => ({
          authUserId: 'test-user',
          supabaseClient: midFlushMock,
        }),
      });
      vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

      // Arrange: enqueue 500 mutations — FAIL_ID is one of them (at position 249)
      const enqueuedIds: string[] = [];
      for (let i = 0; i < TOTAL; i++) {
        const id = i === 249 ? FAIL_ID : `mid-${i.toString().padStart(4, '0')}`;
        enqueuedIds.push(id);
        await mockDb.put(
          REPLICATION_STORES.PENDING_MUTATIONS,
          makeMutationRecord(id, i, { timestamp: Date.now() + i })
        );
      }

      // Act: first flush — FAIL_ID throws, stays in IDB; all others succeed
      const firstResults = await manager.uploadPendingMutations();
      expect(firstResults).toHaveLength(TOTAL);
      expect(firstResults.filter(result => result.success)).toHaveLength(TOTAL - 1);
      expect(observedIds).toHaveLength(TOTAL - 1);

      // Verify FAIL_ID is still in queue with retries=1
      const stillPending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(stillPending).toHaveLength(1);
      expect(stillPending[0]?.id).toBe(FAIL_ID);
      expect(stillPending[0]?.retries).toBe(1);

      // An immediate flush must respect backoff, not retry early.
      expect(await manager.uploadPendingMutations()).toEqual([]);
      expect(observedIds).toHaveLength(TOTAL - 1);
      expect(await manager.getPendingCount()).toBe(1);

      // Advance past the configured 10ms backoff (including jitter) without
      // firing timers. The next explicit flush stays in sole control.
      vi.setSystemTime(Date.now() + 20);

      // Act: second flush — retries FAIL_ID, which now succeeds
      const secondResults = await manager.uploadPendingMutations();
      expect(secondResults).toHaveLength(1);
      expect(secondResults[0]?.success).toBe(true);

      // Assert: FAIL_ID appeared in observedIds exactly once (on retry), queue empty
      const observedSet = new Set(observedIds);
      expect(observedIds).toHaveLength(TOTAL);
      expect(observedSet.size).toBe(TOTAL);
      for (const id of enqueuedIds) {
        expect(observedSet.has(id)).toBe(true);
      }
      // FAIL_ID was pushed to observedIds once (successful retry); not on first attempt
      expect(observedIds.filter(id => id === FAIL_ID)).toHaveLength(1);

      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    }
  );
});
