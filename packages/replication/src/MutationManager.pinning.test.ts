import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const TEST_DB_NAME = 'test-mutation-manager-pinning-db';
const BACKUP_KEY = 'replication_mutation_backup';

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

describe('MutationManager contract pins', () => {
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
      retryBackoffBase: 10,
      logger: createLogger(),
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('assigns strictly increasing sequences to same-tick queue calls', async () => {
    const [firstId, secondId] = await Promise.all([
      manager.queueMutation(
        'entries',
        'UPDATE',
        'entry-1',
        { id: 'entry-1' },
        undefined,
        undefined,
        undefined,
        false
      ),
      manager.queueMutation(
        'entries',
        'UPDATE',
        'entry-2',
        { id: 'entry-2' },
        undefined,
        undefined,
        undefined,
        false
      ),
    ]);

    const [first, second] = await Promise.all([
      db.get(REPLICATION_STORES.PENDING_MUTATIONS, firstId),
      db.get(REPLICATION_STORES.PENDING_MUTATIONS, secondId),
    ]);

    expect(second.sequenceNumber).toBeGreaterThan(first.sequenceNumber);
  });

  it('seeds a replacement manager above the persisted maximum without sequence metadata', async () => {
    const firstId = await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      undefined,
      undefined,
      false
    );
    const first = await db.get(REPLICATION_STORES.PENDING_MUTATIONS, firstId);
    await expect(
      db.get(REPLICATION_STORES.SYNC_METADATA, '__mutation_sequence__')
    ).resolves.toMatchObject({ value: first.sequenceNumber });
    await db.delete(REPLICATION_STORES.SYNC_METADATA, '__mutation_sequence__');
    await expect(
      db.get(REPLICATION_STORES.SYNC_METADATA, '__mutation_sequence__')
    ).resolves.toBeUndefined();
    manager.destroy();
    manager = new MutationManager(supabase, { logger: createLogger() });

    const secondId = await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-2',
      { id: 'entry-2' },
      undefined,
      undefined,
      undefined,
      false
    );
    const second = await db.get(REPLICATION_STORES.PENDING_MUTATIONS, secondId);

    expect(second.sequenceNumber).toBeGreaterThan(first.sequenceNumber);
  });

  it('does not resurrect an OCC-rejected mutation deleted during the server re-check', async () => {
    const pending = mutation({ serverVersion: 7 });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, pending);
    const updateSelect = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const maybeSingle = vi.fn(async () => {
      await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, pending.id);
      return { data: { version: 8 }, error: null };
    });
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ select: updateSelect })),
          select: updateSelect,
        })),
      })),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    } as unknown as ReturnType<SupabaseClient['from']>);

    await manager.uploadPendingMutations();

    expect(await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });

  it('defers upload until requestUpload is called', async () => {
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
    await vi.advanceTimersByTimeAsync(200);

    expect(supabase.from).not.toHaveBeenCalled();

    manager.requestUpload();
    await vi.advanceTimersByTimeAsync(200);
    expect(await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });

  it('backs up a newly queued mutation together with existing failed work', async () => {
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation({ id: 'failed-1', status: 'failed', failedAt: Date.now() })
    );
    const queuedId = await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-2',
      { id: 'entry-2' },
      undefined,
      undefined,
      undefined,
      false
    );

    const backup = JSON.parse(localStorageValues[BACKUP_KEY]!) as PendingMutation[];
    expect(backup.map(item => item.id)).toEqual([queuedId, 'failed-1']);
  });

  it('dispatches sync-failed with the permanent failure count', async () => {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation({ retries: 2 }));
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.reject(new Error('permission denied for entries'))),
        })),
      })),
    } as unknown as ReturnType<SupabaseClient['from']>);

    await manager.uploadPendingMutations();

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'replication:sync-failed',
        detail: expect.objectContaining({
          count: 1,
          mutations: [expect.objectContaining({ failureKind: 'authorization' })],
        }),
      })
    );
  });
});
