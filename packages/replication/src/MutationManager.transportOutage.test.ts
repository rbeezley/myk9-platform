import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { TimeoutError } from './mutation-utils';
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
  let probe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
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
    probe = vi.fn(async () => false);
    manager = makeManager(probe);
  });

  function makeManager(checkConnectivity?: () => Promise<boolean>): MutationManager {
    return new MutationManager(supabase, {
      maxRetries: 3,
      retryBackoffBase: 1_000,
      logger: createLogger(),
      getCurrentUserId: async () => TEST_AUTH_USER_ID,
      getCurrentUploadContext: async () => ({
        authUserId: TEST_AUTH_USER_ID,
        supabaseClient: supabase,
      }),
      ...(checkConnectivity && { checkConnectivity }),
    });
  }

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  type Uplink = { fail: () => void; restore: () => void };

  const failures: Array<[string, unknown]> = [
    ['the postgrest-js fetch failure object', POSTGREST_FETCH_FAILURE],
    ['a thrown fetch TypeError', new TypeError('Failed to fetch')],
  ];

  function settle(value: unknown) {
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  }

  const score: [string, PendingMutation, (failure: unknown) => Uplink][] = [
    [
      'a score',
      mutation(),
      failure => ({
        fail: () => {
          vi.mocked(supabase.from).mockReturnValue({
            update: () => ({ eq: () => ({ select: () => settle(failure) }) }),
          } as never);
        },
        restore: () => {
          vi.mocked(supabase.from).mockReturnValue({
            update: () => ({
              eq: () => ({
                select: () =>
                  Promise.resolve({ data: [{ id: 'entry-1', version: 2 }], error: null }),
              }),
            }),
          } as never);
        },
      }),
    ],
    [
      'a set_class_judge pick',
      mutation({
        id: 'pick-1',
        tableName: 'classes',
        rowId: 'class-1',
        rpc: { name: 'set_class_judge', args: { p_class_id: 'class-1', p_judge_id: 'judge-1' } },
      }),
      failure => ({
        fail: () => {
          vi.mocked(supabase.rpc).mockImplementation((() => settle(failure)) as never);
        },
        restore: () => {
          vi.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never);
        },
      }),
    ],
  ];

  async function pendingAndFailed() {
    return {
      pending: await db.getAll(PENDING),
      failed: await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS),
    };
  }

  describe.each(score)('%s', (_label, queued, uplinkFor) => {
    describe.each(failures)('failing as %s', (_name, failure) => {
      it('survives an outage the probe confirms and uploads on its own when the uplink returns', async () => {
        const uplink = uplinkFor(failure);
        await db.put(PENDING, queued);
        uplink.fail();

        // Six failed flushes, 31 s apart: a 3 minute outage, past the 3-failure budget and 60 s.
        for (let i = 0; i < 6; i++) {
          await manager.uploadPendingMutations();
          const { pending, failed } = await pendingAndFailed();
          expect(failed).toHaveLength(0);
          expect(pending).toHaveLength(1);
          expect(pending[0]).toMatchObject({ status: 'pending', retries: 0 });
          await vi.advanceTimersByTimeAsync(31_000);
        }

        uplink.restore();
        probe.mockResolvedValue(true);
        // No explicit flush: the self-scheduled backoff pass must upload on its own.
        await vi.advanceTimersByTimeAsync(31_000);
        const { pending, failed } = await pendingAndFailed();
        expect(pending).toHaveLength(0);
        expect(failed).toHaveLength(0);
      });
    });

    const reachableFailures: Array<[string, unknown]> = [
      ['a timeout', new TimeoutError('timed out', 15_000)],
      [
        'a postgrest-wrapped client bug',
        {
          data: null,
          error: { message: 'TypeError: Cannot read properties of undefined', code: '' },
          status: 0,
        },
      ],
      ['x.fetch is not a function', new TypeError('x.fetch is not a function')],
    ];

    async function flushUntilParked() {
      for (let i = 0; i < 8; i++) {
        await manager.uploadPendingMutations();
        await vi.advanceTimersByTimeAsync(31_000);
      }
      return pendingAndFailed();
    }

    describe.each(reachableFailures)('%s', (_name, failure) => {
      it.each([
        ['the probe says reachable', () => makeManagerWith(async () => true)],
        ['no probe is provided', () => makeManagerWith(undefined)],
        [
          'the probe throws',
          () =>
            makeManagerWith(async () => {
              throw new Error('probe broke');
            }),
        ],
      ])('parks as max-retries when %s', async (_why, build) => {
        build();
        const uplink = uplinkFor(failure);
        await db.put(PENDING, queued);
        uplink.fail();

        const { pending, failed } = await flushUntilParked();

        expect(pending).toHaveLength(0);
        expect(failed).toEqual([
          expect.objectContaining({ id: queued.id, failureKind: 'max-retries', retries: 3 }),
        ]);
      });
    });
  });

  function makeManagerWith(check: (() => Promise<boolean>) | undefined) {
    manager.destroy();
    manager = makeManager(check);
    return manager;
  }

  describe('refusals park at once without asking the probe', () => {
    it.each([
      ['42501', 'permission denied', undefined],
      ['23505', 'duplicate key value', undefined],
      ['MK014', 'entry under a deleted class', undefined],
      ['P0002', 'class not found', 'set_class_judge'],
      ['22023', 'person deleted', 'set_class_judge'],
    ])('%s', async (code, message, rpcName) => {
      const refusal = { data: null, error: { code, message }, status: 400 };
      await db.put(
        PENDING,
        rpcName ? mutation({ id: 'r', rpc: { name: rpcName, args: {} } }) : mutation({ id: 'r' })
      );
      vi.mocked(supabase.rpc).mockResolvedValue(refusal as never);
      vi.mocked(supabase.from).mockReturnValue({
        update: () => ({ eq: () => ({ select: () => Promise.resolve(refusal) }) }),
      } as never);

      await manager.uploadPendingMutations();

      const { pending, failed } = await pendingAndFailed();
      expect(pending).toHaveLength(0);
      expect(failed).toEqual([expect.objectContaining({ id: 'r', retries: 1 })]);
      expect(probe).not.toHaveBeenCalled();
    });
  });

  it('asks the probe at most once per upload pass however many mutations fail', async () => {
    for (const id of ['a', 'b', 'c']) {
      await db.put(PENDING, mutation({ id, rowId: `entry-${id}`, timestamp: Date.now() }));
    }
    vi.mocked(supabase.from).mockReturnValue({
      update: () => ({
        eq: () => ({ select: () => Promise.reject(new TypeError('Failed to fetch')) }),
      }),
    } as never);

    await manager.uploadPendingMutations();

    expect(probe).toHaveBeenCalledTimes(1);
    expect((await db.getAll(PENDING)).every(item => item.transportRetries === 1)).toBe(true);
  });

  it('does not resurrect a mutation discarded while the probe was running', async () => {
    await db.put(PENDING, mutation({ id: 'gone', rowId: 'entry-gone', timestamp: Date.now() }));
    vi.mocked(supabase.from).mockReturnValue({
      update: () => ({
        eq: () => ({ select: () => Promise.reject(new TypeError('Failed to fetch')) }),
      }),
    } as never);
    probe.mockImplementation(async () => {
      await manager.discardPendingMutationsForRow('entries', 'entry-gone');
      return false;
    });

    await manager.uploadPendingMutations();

    expect(await db.get(PENDING, 'gone')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'gone')).toBeUndefined();
  });

  it('retryFailedMutation resets transportRetries', async () => {
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation({ id: 'f', status: 'failed', retries: 3, transportRetries: 9, failedAt: 1 })
    );

    await manager.retryFailedMutation('f');

    const requeued = await db.get(PENDING, 'f');
    expect(requeued).toMatchObject({ status: 'pending', retries: 0 });
    expect(requeued?.transportRetries).toBeUndefined();
  });
});
