/**
 * MYK9-1236 through a REAL queued upload: a ringside write is queued as an RPC
 * delta against token 3, the server has moved on to token 8, and the pull
 * rebases the queued write. A queued field equal to the base the write was made
 * against is not a write (a no-op clear, undefined to null), so it must not ride
 * along and erase the newer server value.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
} from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';
const AUTH = 'judge-user';

const seed = {
  id: ID,
  showId: SHOW,
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  resultStatus: 'qualified',
} as ReplicatedEntry;

const serverRow = (overrides: Record<string, unknown>) => ({
  id: ID,
  show_id: SHOW,
  class_id: 'class-1',
  dog_id: 'dog-1',
  armband: '200',
  entry_status: 'confirmed',
  result_status: 'qualified',
  version: 8,
  updated_at: '2026-10-08T01:54:59.031578+00:00',
  ...overrides,
});

function mockServerRows(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
  vi.mocked(supabase.from).mockReturnValue(chain as never);
}

interface RpcCall {
  p_fields: Record<string, unknown>;
  p_expected_version: number | null;
}

describe('a rebased queued ringside write (MYK9-1236)', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let rpcCalls: RpcCall[];
  let conflicts: Array<{ fields: string[] }>;
  const onConflict = (event: Event) => conflicts.push((event as CustomEvent).detail);

  beforeEach(async () => {
    await databaseManager.reset();
    configureConflictSurfacing(true);
    vi.mocked(supabase.from).mockReset();
    rpcCalls = [];
    conflicts = [];
    window.addEventListener('replication:conflict', onConflict);
    // The server is already at token 8: a write against token 3 is rejected with
    // that version, and a write against 8 is accepted.
    const client = {
      rpc: vi.fn(async (_name: string, args: RpcCall) => {
        rpcCalls.push(args);
        if (args.p_expected_version === 8) return { data: 9, error: null };
        return {
          data: null,
          error: { code: '40001', message: 'Version conflict', details: '8' },
        };
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    table = new ReplicatedEntriesTable();
    table.setMutationManager(manager);
    await table.clearCache();
  });

  afterEach(async () => {
    window.removeEventListener('replication:conflict', onConflict);
    manager.destroy();
    configureConflictSurfacing(false);
    await databaseManager.reset();
  });

  /** Queue the write against token 3 and let its first upload bounce off token 8. */
  async function writeAndBounce(updates: Partial<ReplicatedEntry>) {
    await table.updateEntry(ID, updates);
    await vi.waitFor(() => expect(rpcCalls).toHaveLength(1));
  }

  /** Release the backoff and upload the (rebased) queue. */
  async function uploadAgain() {
    const db = await databaseManager.getDatabase('test');
    for (const queued of await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...queued, nextRetryAt: 0 });
    }
    await manager.uploadPendingMutations();
  }

  it('does not upload a no-op clear that would erase a note another device wrote', async () => {
    await table.batchSet([seed], new Map([[ID, 3]]));
    await writeAndBounce({ judgeNotes: null as unknown as string });
    mockServerRows([serverRow({ judge_notes: 'Good dog' })]);

    await table.sync(SHOW);
    await uploadAgain();

    expect((await table.get(ID))?.judgeNotes).toBe('Good dog');
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[1]?.p_expected_version).toBe(8);
    expect(rpcCalls[1]?.p_fields).not.toHaveProperty('judge_notes');
  });

  it('still uploads the NQ and its reason after a null-to-undefined pull', async () => {
    await table.batchSet([{ ...seed, disqualification_reason: null }], new Map([[ID, 3]]));
    await writeAndBounce({ resultStatus: 'nq', disqualification_reason: 'Incorrect Call' });
    mockServerRows([serverRow({ disqualification_reason: null })]);

    await table.sync(SHOW);
    await uploadAgain();

    expect(conflicts).toHaveLength(0);
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[1]?.p_fields).toMatchObject({
      result_status: 'nq',
      disqualification_reason: 'Incorrect Call',
    });
  });

  it('holds the queued write and prompts when another device wrote a different reason', async () => {
    await table.batchSet([{ ...seed, disqualification_reason: null }], new Map([[ID, 3]]));
    await writeAndBounce({ resultStatus: 'nq', disqualification_reason: 'Incorrect Call' });
    mockServerRows([serverRow({ result_status: 'nq', disqualification_reason: 'Absent' })]);

    await table.sync(SHOW);
    await uploadAgain();

    expect(conflicts.map(c => c.fields)).toEqual([
      expect.arrayContaining(['disqualification_reason']),
    ]);
    expect(rpcCalls).toHaveLength(1);
  });
});
