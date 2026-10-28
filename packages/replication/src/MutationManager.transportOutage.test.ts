import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const TEST_DB_NAME = 'test-mutation-manager-transport-outage-db';
// What postgrest-js 2.118.0 RESOLVES when fetch rejects (shouldThrowOnError off); executeMutation
// then throws the error object.
const POSTGREST_FETCH_FAILURE = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
  status: 0,
};
const PENDING = REPLICATION_STORES.PENDING_MUTATIONS;
const TEST_AUTH_USER_ID = 'test-user';

function createLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createSupabaseClient(): SupabaseClient {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'row-1' }], error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() =>
            Promise.resolve({ data: [{ id: 'row-1', version: 2 }], error: null })
          ),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'row-1' }], error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: 2, error: null })),
  } as unknown as SupabaseClient;
}

function mutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'mutation-1',
    authUserId: TEST_AUTH_USER_ID,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', score: 100 },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('MutationManager transport outage (MYK9-1474)', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let supabase: SupabaseClient;
  let localStorageValues: Record<string, string>;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    db = await createMutationManagerTestDb(TEST_DB_NAME, { includeSyncMetadata: true });
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);

    localStorageValues = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageValues[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageValues[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageValues[key];
        },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });

    supabase = createSupabaseClient();
    manager = new MutationManager(supabase, {
      maxRetries: 3,
      retryBackoffBase: 1_000,
      logger: createLogger(),
      getCurrentUserId: async () => TEST_AUTH_USER_ID,
      getCurrentUploadContext: async () => ({
        authUserId: TEST_AUTH_USER_ID,
        supabaseClient: supabase,
      }),
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function runOutageThenRecover(
    queued: PendingMutation,
    breakUplink: () => void,
    restoreUplink: () => void
  ) {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, queued);
    breakUplink();

    // Six failed flushes, 31 s apart: a 3 minute outage, past the 3-failure budget and the 60 s bar.
    for (let i = 0; i < 6; i++) {
      await manager.uploadPendingMutations();
      expect(await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(0);
      const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ status: 'pending', retries: 0 });
      await vi.advanceTimersByTimeAsync(31_000);
    }

    restoreUplink();
    // No explicit flush: the self-scheduled backoff pass must upload on its own.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await db.getAll(PENDING)).toHaveLength(0);
    expect(await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(0);
  }

  it('keeps a queued score through a long fast-failing outage and uploads it on recovery', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve(POSTGREST_FETCH_FAILURE)),
      })),
    }));
    const okUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() =>
          Promise.resolve({ data: [{ id: 'entry-1', version: 2 }], error: null })
        ),
      })),
    }));
    await runOutageThenRecover(
      mutation(),
      () => vi.mocked(supabase.from).mockReturnValue({ update } as never),
      () => vi.mocked(supabase.from).mockReturnValue({ update: okUpdate } as never)
    );
    expect(okUpdate).toHaveBeenCalled();
  });

  it('keeps a queued set_class_judge pick through the same outage', async () => {
    await runOutageThenRecover(
      mutation({
        id: 'pick-1',
        tableName: 'classes',
        rowId: 'class-1',
        rpc: { name: 'set_class_judge', args: { p_class_id: 'class-1', p_judge_id: 'judge-1' } },
      }),
      () => vi.mocked(supabase.rpc).mockResolvedValue(POSTGREST_FETCH_FAILURE as never),
      () => vi.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never)
    );
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_class_judge', expect.any(Object));
  });

  it('parks a set_class_judge refusal on the first failure', async () => {
    await db.put(
      PENDING,
      mutation({
        id: 'pick-2',
        tableName: 'classes',
        rowId: 'class-1',
        rpc: { name: 'set_class_judge', args: { p_class_id: 'class-1', p_judge_id: 'gone' } },
      })
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'class not found' },
    } as never);

    await manager.uploadPendingMutations();

    expect(await db.getAll(PENDING)).toHaveLength(0);
    expect(await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([
      expect.objectContaining({ id: 'pick-2', failureKind: 'permanent' }),
    ]);
  });
});
