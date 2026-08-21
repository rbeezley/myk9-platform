import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const TEST_DB_NAME = 'test-mutation-manager-identity-db';

function createLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createSupabaseClient() {
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
      })),
    })),
  }));

  return { client: { from, rpc: vi.fn() } as unknown as SupabaseClient, from };
}

function mutation(
  id: string,
  authUserId: string | undefined,
  overrides: Partial<PendingMutation> = {}
): PendingMutation {
  return {
    id,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: id,
    data: { id },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
    ...(authUserId !== undefined && { authUserId }),
    ...overrides,
  } as PendingMutation;
}

describe('MutationManager authenticated ownership', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let currentUserId: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(TEST_DB_NAME);
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    currentUserId = vi.fn(async () => 'user-a');
    const supabase = createSupabaseClient();
    from = supabase.from;
    manager = new MutationManager(supabase.client, {
      logger: createLogger(),
      getCurrentUserId: currentUserId,
      getCurrentUploadContext: async () => ({
        authUserId: await currentUserId(),
        supabaseClient: supabase.client,
      }),
    } as MutationManagerOptions);
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  it('persists the exact authenticated owner before queueing succeeds', async () => {
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      undefined,
      undefined,
      false
    );

    const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    expect(pending[0]).toMatchObject({ rowId: 'entry-1', authUserId: 'user-a' });
    const backup = vi.mocked(localStorage.setItem).mock.calls.at(-1)?.[1];
    expect(JSON.parse(backup ?? '[]')[0]).toMatchObject({ authUserId: 'user-a' });
  });

  it.each([null, '', '   '])(
    'rejects enqueue for invalid owner %j without writing',
    async owner => {
      currentUserId.mockResolvedValue(owner);

      await expect(
        manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' })
      ).rejects.toThrow(/authenticated/i);
      expect(await db.count(REPLICATION_STORES.PENDING_MUTATIONS)).toBe(0);
    }
  );

  it('leaves the queue unchanged when identity resolution throws', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('owned', 'user-a'));
    currentUserId.mockRejectedValue(new Error('session unavailable'));

    await expect(manager.uploadPendingMutations()).rejects.toThrow('session unavailable');
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'owned')).toBeDefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('uploads only independent mutations owned by the active user', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('foreign', 'user-a'));
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('current', 'user-b'));
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('legacy', undefined));
    currentUserId.mockResolvedValue('user-b');

    await manager.uploadPendingMutations();

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'current')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'foreign')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'legacy')).toBeDefined();
    expect(from).toHaveBeenCalledTimes(1);

    currentUserId.mockResolvedValue('user-a');
    await manager.uploadPendingMutations();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'foreign')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'legacy')).toBeDefined();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('holds a current-owner mutation whose dependency belongs to another owner', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('foreign', 'user-a'));
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('dependent', 'user-b', { dependsOn: ['foreign'] })
    );
    currentUserId.mockResolvedValue('user-b');

    await manager.uploadPendingMutations();

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'foreign')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'dependent')).toBeDefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('re-checks identity before each execution and stops after an account change', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('first', 'user-a'));
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('second', 'user-a'));
    currentUserId
      .mockResolvedValueOnce('user-a')
      .mockResolvedValueOnce('user-a')
      .mockResolvedValue('user-b');

    await manager.uploadPendingMutations();

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'first')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'second')).toBeDefined();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('executes through the client pinned to the checked session', async () => {
    const pinned = createSupabaseClient();
    manager.destroy();
    manager = new MutationManager(createSupabaseClient().client, {
      logger: createLogger(),
      getCurrentUserId: currentUserId,
      getCurrentUploadContext: async () => ({
        authUserId: 'user-a',
        supabaseClient: pinned.client,
      }),
    });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('owned', 'user-a'));

    await manager.uploadPendingMutations();

    expect(pinned.from).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails upload closed when no bound upload context is configured', async () => {
    const mutable = createSupabaseClient();
    manager.destroy();
    manager = new MutationManager(mutable.client, {
      logger: createLogger(),
      getCurrentUserId: currentUserId,
    });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('owned', 'user-a'));

    await expect(manager.uploadPendingMutations()).rejects.toThrow(/bound authenticated session/i);
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'owned')).toBeDefined();
    expect(mutable.from).not.toHaveBeenCalled();
  });

  it('shows, retries, and discards failed mutations only for the active owner', async () => {
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('mine', 'user-b', { status: 'failed', failedAt: 1 })
    );
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('theirs', 'user-a', { status: 'failed', failedAt: 1 })
    );
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('legacy-failed', undefined, { status: 'failed', failedAt: 1 })
    );
    currentUserId.mockResolvedValue('user-b');

    expect((await manager.getFailedMutations()).map(item => item.id)).toEqual(['mine']);

    await manager.retryFailedMutation('theirs');
    await manager.discardFailedMutation('legacy-failed');
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'theirs')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'legacy-failed')).toBeDefined();

    await manager.retryFailedMutation('mine');
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'mine')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mine')).toBeDefined();
  });

  it('isolates row-level queue inspection, reconciliation, and discard by owner', async () => {
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mine', 'user-b', { rowId: 'shared-row', serverVersion: 1 })
    );
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('theirs', 'user-a', { rowId: 'shared-row', serverVersion: 1 })
    );
    currentUserId.mockResolvedValue('user-b');

    expect(
      (await manager.getPendingMutationsForRow('entries', 'shared-row')).map(item => item.id)
    ).toEqual(['mine']);

    await manager.updateMutationServerVersions('entries', 'shared-row', 2);
    expect(
      ((await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mine')) as PendingMutation)
        .serverVersion
    ).toBe(2);
    expect(
      ((await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'theirs')) as PendingMutation)
        .serverVersion
    ).toBe(1);

    await manager.discardPendingMutationsForRow('entries', 'shared-row');
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mine')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'theirs')).toBeDefined();
  });

  it('clears only mutations owned by the active user', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('mine', 'user-b'));
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('theirs', 'user-a'));
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('legacy', undefined));
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('mine-failed', 'user-b', { status: 'failed', failedAt: 1 })
    );
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('theirs-failed', 'user-a', { status: 'failed', failedAt: 1 })
    );
    currentUserId.mockResolvedValue('user-b');

    await manager.clearAllMutations();

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mine')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'mine-failed')).toBeUndefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'theirs')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'legacy')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'theirs-failed')).toBeDefined();
  });

  it('fails review and mutation actions closed when identity resolution fails', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('pending', 'user-a'));
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('failed', 'user-a', { status: 'failed', failedAt: 1 })
    );
    currentUserId.mockRejectedValue(new Error('session unavailable'));

    await expect(manager.getFailedMutations()).rejects.toThrow('session unavailable');
    await expect(manager.retryFailedMutation('failed')).rejects.toThrow('session unavailable');
    await expect(manager.discardFailedMutation('failed')).rejects.toThrow('session unavailable');
    await expect(manager.discardPendingMutationsForRow('entries', 'pending')).rejects.toThrow(
      'session unavailable'
    );

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'pending')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'failed')).toBeDefined();
  });

  it('aborts local mutation actions when the active account changes mid-operation', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('pending', 'user-a'));
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('failed', 'user-a', { status: 'failed', failedAt: 1 })
    );

    currentUserId.mockResolvedValueOnce('user-a').mockResolvedValueOnce('user-b');
    await expect(manager.retryFailedMutation('failed')).rejects.toThrow(/user changed/i);

    currentUserId.mockResolvedValueOnce('user-a').mockResolvedValueOnce('user-b');
    await expect(manager.discardFailedMutation('failed')).rejects.toThrow(/user changed/i);

    currentUserId.mockResolvedValueOnce('user-a').mockResolvedValueOnce('user-b');
    await manager.clearAllMutations();

    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'pending')).toBeDefined();
    expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, 'failed')).toBeDefined();
  });
});
