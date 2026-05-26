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
    // Use real timers: fake timers with shouldAdvanceTime=true cause the 15s
    // withTimeout sentinel to fire mid-flush when processing 500 mutations
    // sequentially (~22s total), producing spurious TimeoutErrors.
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

    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: mockLogger,
    };

    // mockSupabase is set per-test below
    manager = new MutationManager(
      createTrackingMockSupabase(() => {}),
      options
    );
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
  // ISOLATION NOTE: between the two flushes we call manager.destroy() to clear
  // the scheduleBackoffRetry timer that flush 1 installs. Without that, the
  // timer can fire async between the test's manual `nextRetryAt = 0` write and
  // the second flush, racing the IDB record and producing a missed retry. This
  // showed up as ~30% flake under v8 coverage instrumentation
  // (https://github.com/rbeezley/myk9-platform/pull/118 investigation).
  // destroy() only clears timers — the manager remains usable for subsequent
  // uploadPendingMutations calls.
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
      await manager.uploadPendingMutations();

      // Verify FAIL_ID is still in queue with retries=1
      const stillPending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(stillPending).toHaveLength(1);
      expect(stillPending[0]?.id).toBe(FAIL_ID);
      expect(stillPending[0]?.retries).toBe(1);

      // Cancel the scheduleBackoffRetry timer flush 1 installed before we
      // mutate the IDB record below — otherwise the timer races with our
      // manual nextRetryAt write under coverage instrumentation.
      manager.destroy();

      // Clear nextRetryAt so flush 2 doesn't skip it due to backoff
      const failedRecord = stillPending[0]!;
      failedRecord.nextRetryAt = 0; // force eligible for immediate retry
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, failedRecord);

      // Act: second flush — retries FAIL_ID, which now succeeds
      await manager.uploadPendingMutations();

      // Assert: FAIL_ID appeared in observedIds exactly once (on retry), queue empty
      const observedSet = new Set(observedIds);
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
