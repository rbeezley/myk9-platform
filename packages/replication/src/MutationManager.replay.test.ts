import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import type { PendingMutation } from './types';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const TEST_DB_NAME = 'test-mutation-manager-replay-db';
const BACKUP_KEY = 'replication_mutation_backup';

function createMockSupabaseClient() {
  const mockClient = {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
        })),
      })),
    })),
  };
  return mockClient as unknown as SupabaseClient;
}

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: `mut-${Math.random().toString(36).slice(2)}`,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', is_scored: true },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('MutationManager replay idempotency', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let mockSupabase: SupabaseClient;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockDb = await createMutationManagerTestDb(TEST_DB_NAME);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    localStorageMock = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
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

    mockSupabase = createMockSupabaseClient();
    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: createMockLogger(),
    };
    manager = new MutationManager(mockSupabase, options);
  });

  afterEach(async () => {
    manager.destroy();
    mockDb.close();
    localStorageMock = {};
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('replays a serialized mutation queue into a fresh store without double-applying uploads', async () => {
    const serializedMutations = [
      makeMutation({
        id: 'mut-replay-1',
        rowId: 'entry-replay-1',
        data: { id: 'entry-replay-1', is_scored: true },
        timestamp: 1,
      }),
      makeMutation({
        id: 'mut-replay-2',
        rowId: 'entry-replay-2',
        data: { id: 'entry-replay-2', is_scored: true },
        timestamp: 2,
      }),
    ];

    localStorageMock[BACKUP_KEY] = JSON.stringify(serializedMutations);

    await manager.restoreMutationsFromLocalStorage();
    await manager.restoreMutationsFromLocalStorage();

    await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(2);

    const uploadResults = await manager.uploadPendingMutations();

    expect(uploadResults).toHaveLength(2);
    expect(uploadResults.every(result => result.success)).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
    expect(localStorageMock[BACKUP_KEY]).toBeUndefined();

    await manager.restoreMutationsFromLocalStorage();
    const secondUploadResults = await manager.uploadPendingMutations();

    expect(secondUploadResults).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });
});
