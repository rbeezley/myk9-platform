/**
 * MYK9-1204: a ringside write taken while the session cannot resolve.
 *
 * The device went offline signed in; after jwt_expiry (3600s) supabase-js's
 * `getSession()` errors (the refresh cannot reach the network). The REAL
 * `replicatedEntriesTable` write methods and the REAL shared MutationManager
 * run over fake IndexedDB; only `getSession`, the persisted-session id and the
 * pinned client's `rpc('ringside_update_entry')` are faked.
 *
 * Outcome pinned here: a score (and a check-in) taken in that window is queued
 * under the persisted account, never left as a dirty row with no mutation, and
 * it uploads only once a session resolves for that SAME account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';

const fake = vi.hoisted(() => ({
  session: null as null | { access_token: string; user: { id: string } },
  sessionError: null as Error | null,
  sessionDelayMs: 0 as number | 'never',
  persistedUserId: null as string | null,
  rpcCalls: [] as Array<{ token: string; name: string; args: Record<string, unknown> }>,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async (): Promise<unknown> => {
        if (fake.sessionDelayMs === 'never') return new Promise(() => undefined);
        const delay = fake.sessionDelayMs;
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        return { data: { session: fake.session }, error: fake.sessionError };
      },
    },
  },
  createSessionBoundSupabaseClient: (token: string) => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ token, name, args });
      return Promise.resolve({ data: 2, error: null });
    },
  }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => fake.persistedUserId,
}));

import { mutationManager } from '../sharedMutationManager';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';
import { setDeviceOnline } from './registrationQueueHarness';
import type { ReplicatedEntry } from '../ReplicatedEntriesTable';

const ENTRY_ID = 'entry-1';

const SCORE_UPDATES = {
  resultStatus: 'qualified',
  result_status: 'qualified',
  isScored: true,
  is_scored: true,
  searchTimeSeconds: 61,
  search_time_seconds: 61,
  totalFaults: 0,
  total_faults: 0,
} as Partial<ReplicatedEntry>;

async function readStore(store: string): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  return (await db.getAll(store)) as PendingMutation[];
}
const pending = () => readStore(REPLICATION_STORES.PENDING_MUTATIONS);

async function dirtyRowIds(): Promise<string[]> {
  const db = await databaseManager.getDatabase('entries');
  const rows = (await db.getAll(REPLICATION_STORES.REPLICATED_TABLES)) as Array<{
    tableName: string;
    id: string;
    isDirty: boolean;
  }>;
  return rows.filter(r => r.tableName === 'entries' && r.isDirty).map(r => r.id);
}

function signIn(userId: string, token: string): void {
  fake.session = { access_token: token, user: { id: userId } };
  fake.sessionError = null;
  fake.persistedUserId = userId;
}

/** Expired access token, no network: auth-js answers with an error and no session. */
function tokenExpiredOffline(): void {
  fake.session = null;
  fake.sessionError = new Error('AuthRetryableFetchError');
}

beforeEach(async () => {
  await databaseManager.reset();
  fake.session = null;
  fake.sessionError = null;
  fake.sessionDelayMs = 0;
  fake.persistedUserId = null;
  fake.rpcCalls = [];
  setDeviceOnline(true);
  replicatedEntriesTable.setMutationManager(mutationManager);
  signIn('judge-1', 'token-1');
  await replicatedEntriesTable.set(
    ENTRY_ID,
    {
      id: ENTRY_ID,
      showId: 'show-1',
      classId: 'class-1',
      entryStatus: 'confirmed',
    } as ReplicatedEntry,
    false,
    undefined,
    1,
    { allowColdInsert: 'MYK9-1204 fixture' }
  );
});

afterEach(async () => {
  mutationManager.destroy();
  await databaseManager.reset();
});

describe('a score taken offline with an expired token (MYK9-1204)', () => {
  it('is queued under the persisted account, and uploads once the same account re-authenticates', async () => {
    setDeviceOnline(false);
    tokenExpiredOffline();

    const mutationId = await replicatedEntriesTable.updateEntry(ENTRY_ID, SCORE_UPDATES);

    expect(mutationId).not.toBeNull();
    expect(await pending()).toMatchObject([
      { rowId: ENTRY_ID, authUserId: 'judge-1', rpc: { name: 'ringside_update_entry' } },
    ]);
    expect(await dirtyRowIds()).toEqual([ENTRY_ID]);
    expect(fake.rpcCalls).toEqual([]);

    signIn('judge-1', 'token-2');
    setDeviceOnline(true);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toMatchObject({
      token: 'token-2',
      name: 'ringside_update_entry',
      args: { p_entry_id: ENTRY_ID },
    });
    expect(await pending()).toEqual([]);
  });

  it('is held, never sent, when a DIFFERENT account signs in on the device', async () => {
    setDeviceOnline(false);
    tokenExpiredOffline();
    await replicatedEntriesTable.updateEntry(ENTRY_ID, SCORE_UPDATES);

    signIn('judge-2', 'token-3');
    setDeviceOnline(true);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls).toEqual([]);
    expect(await pending()).toMatchObject([{ rowId: ENTRY_ID, authUserId: 'judge-1' }]);
  });

  it('is refused, with no dirty row, when no account is persisted either', async () => {
    setDeviceOnline(false);
    tokenExpiredOffline();
    fake.persistedUserId = null;

    await expect(replicatedEntriesTable.updateEntry(ENTRY_ID, SCORE_UPDATES)).rejects.toThrow();

    expect(await pending()).toEqual([]);
    expect(await dirtyRowIds()).toEqual([]);
  });
});

describe('latency of the owner lookup (MYK9-1204)', () => {
  it('offline with a hanging getSession, queues promptly under the persisted account', async () => {
    setDeviceOnline(false);
    fake.sessionDelayMs = 'never';

    const started = performance.now();
    const mutationId = await replicatedEntriesTable.updateEntry(ENTRY_ID, SCORE_UPDATES);
    const elapsed = performance.now() - started;

    expect(mutationId).not.toBeNull();
    // The hung lookup never resolves, so any bound proves it was skipped; keep it
    // loose enough for a loaded CI box.
    expect(elapsed).toBeLessThan(1500);
    expect(await pending()).toMatchObject([{ rowId: ENTRY_ID, authUserId: 'judge-1' }]);
  });

  it('online, still waits for the live lookup (measured: waits the full delay, then queues)', async () => {
    fake.sessionDelayMs = 300;
    tokenExpiredOffline();

    const started = performance.now();
    await replicatedEntriesTable.updateEntry(ENTRY_ID, SCORE_UPDATES);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(290);
    expect(await pending()).toMatchObject([{ authUserId: 'judge-1' }]);
  });
});

describe('a check-in taken offline with an expired token (MYK9-1204)', () => {
  it('never leaves a dirty row without a queued mutation', async () => {
    setDeviceOnline(false);
    tokenExpiredOffline();

    await replicatedEntriesTable.updateCheckInStatus(ENTRY_ID, 'checked-in').catch(() => undefined);

    const queued = (await pending()).map(row => row.rowId);
    const dirty = await dirtyRowIds();
    expect(dirty.filter(id => !queued.includes(id))).toEqual([]);
  });
});
