/**
 * MYK9-1236 through a REAL queued upload: a ringside write is queued as an RPC
 * delta against token 3, the server has moved on to token 8, and the pull meets
 * it. Only the SERVER side reads null and undefined as one value; the device's
 * own `null` over an `undefined` base is a real write, so it prompts instead of
 * silently erasing what another device wrote.
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

describe('a queued ringside write meeting a pull (MYK9-1236)', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let rpcCalls: RpcCall[];
  let serverVersion: number;
  let serverFields: Record<string, unknown>;
  let acknowledgeRpc: (args: RpcCall) => Promise<void>;
  let conflicts: Array<{ fields: string[] }>;
  const onConflict = (event: Event) => conflicts.push((event as CustomEvent).detail);

  beforeEach(async () => {
    await databaseManager.reset();
    configureConflictSurfacing(true);
    vi.mocked(supabase.from).mockReset();
    rpcCalls = [];
    serverVersion = 8;
    serverFields = {};
    acknowledgeRpc = async () => {};
    conflicts = [];
    window.addEventListener('replication:conflict', onConflict);
    // The server is already at token 8: a write against token 3 is rejected with
    // that version, and a write against 8 is accepted.
    const client = {
      rpc: vi.fn(async (_name: string, args: RpcCall) => {
        rpcCalls.push(args);
        if (args.p_expected_version === serverVersion) {
          Object.assign(serverFields, args.p_fields);
          serverVersion += 1;
          await acknowledgeRpc(args);
          return { data: serverVersion, error: null };
        }
        return {
          data: null,
          error: { code: '40001', message: 'Version conflict', details: String(serverVersion) },
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

  async function expectFinalQ() {
    // An overlapping upload requests another pass and returns immediately.
    // Assert convergence, rather than treating its return as a drained queue.
    await vi.waitFor(async () => {
      expect(await manager.getPendingCount()).toBe(0);
      expect(serverFields.result_status).toBe('qualified');
      expect(serverFields.disqualification_reason ?? null).toBeNull();
      const entry = await table.get(ID);
      expect(entry?.resultStatus).toBe('qualified');
      expect(entry?.disqualification_reason ?? null).toBeNull();
    });
    expect(conflicts).toHaveLength(0);
  }

  it('prompts instead of erasing a note another device wrote over a no-op clear', async () => {
    await table.batchSet([seed], new Map([[ID, 3]]));
    await writeAndBounce({ judgeNotes: null as unknown as string });
    mockServerRows([serverRow({ judge_notes: 'Good dog' })]);

    await table.sync(SHOW);
    await uploadAgain();

    expect(conflicts.map(c => c.fields)).toEqual([expect.arrayContaining(['judgeNotes'])]);
    expect(rpcCalls).toHaveLength(1);
    expect(serverFields).not.toHaveProperty('judge_notes');
  });

  it('prompts instead of erasing an area time another device wrote over a no-op clear', async () => {
    await table.batchSet([seed], new Map([[ID, 3]]));
    await writeAndBounce({ area1_time_seconds: null as unknown as number });
    mockServerRows([serverRow({ area1_time_seconds: 12.3 })]);

    await table.sync(SHOW);
    await uploadAgain();

    expect(conflicts.map(c => c.fields)).toEqual([expect.arrayContaining(['area1_time_seconds'])]);
    expect(rpcCalls).toHaveLength(1);
    expect(serverFields).not.toHaveProperty('area1_time_seconds');
  });

  it('uploads the final Q after Q, NQ, Q and the server ends at Q', async () => {
    await table.batchSet([{ ...seed, disqualification_reason: null }], new Map([[ID, 3]]));
    await writeAndBounce({ resultStatus: 'nq', disqualification_reason: 'Incorrect Call' });
    await table.updateEntry(ID, { resultStatus: 'qualified', disqualification_reason: null });
    mockServerRows([serverRow({ disqualification_reason: null })]);

    await table.sync(SHOW);
    await uploadAgain();
    await uploadAgain();

    await expectFinalQ();
  });

  it('drains a Q queued while the previous NQ acknowledgement is still in flight', async () => {
    let releaseNq!: () => void;
    const nqAcknowledgement = new Promise<void>(resolve => (releaseNq = resolve));
    acknowledgeRpc = async args => {
      if (args.p_fields.result_status === 'nq') await nqAcknowledgement;
    };
    await table.batchSet([{ ...seed, disqualification_reason: null }], new Map([[ID, 3]]));
    await writeAndBounce({ resultStatus: 'nq', disqualification_reason: 'Incorrect Call' });
    mockServerRows([serverRow({ disqualification_reason: null })]);

    let upload: Promise<void> | undefined;
    try {
      await table.sync(SHOW);
      upload = uploadAgain();
      await vi.waitFor(() => expect(serverFields.result_status).toBe('nq'));
      expect(serverFields.disqualification_reason).toBe('Incorrect Call');
      await table.updateEntry(ID, { resultStatus: 'qualified', disqualification_reason: null });
      await uploadAgain();
      releaseNq();
      await upload;

      await expectFinalQ();
    } finally {
      releaseNq();
      await upload;
    }
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
