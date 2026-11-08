/**
 * MYK9-1761 through a REAL queued upload: whichever entries-table write sets a pre-run
 * check-in on an unscored dog (the narrow check-in write the Run Sheet and desk use, a
 * general entry update, or the secretary's Pull), the stale ring_entry_time is cleared on
 * the device and on the server, so Show Map stops showing the dog in the ring.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager, REPLICATION_STORES } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { staleRingTimeClear } from './entryRingTime';
import { classifyEntryRunStatus } from '@/features/show-map/showMapStatus';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';
const AUTH = 'secretary-user';

const STAMP = '2026-11-08T16:03:13.750Z';

// An unscored dog whose scoresheet was opened: in the ring with a ring time.
const seed = {
  id: ID,
  showId: SHOW,
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  checkInStatus: 'in-ring',
  check_in_status: 'in-ring',
  ring_entry_time: STAMP,
  isScored: false,
} as ReplicatedEntry;

describe('every check-in write drops a stale ring time (MYK9-1761)', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let online: boolean;
  let server: Record<string, unknown>;
  let directPayloads: Record<string, unknown>[];
  let rpcFields: Record<string, unknown>[];

  /** The MYK9-1396 trigger plus the version bump, applied to every accepted write. */
  function applyWrite(fields: Record<string, unknown>) {
    const before = server.check_in_status;
    Object.assign(server, fields);
    if (fields.check_in_status === 'pulled' && before !== 'pulled') {
      server.check_in_status_before_pull = before;
    } else if (before === 'pulled' && server.check_in_status === 'no-status') {
      server.check_in_status = server.check_in_status_before_pull ?? 'no-status';
    }
    server.version = (server.version as number) + 1;
  }

  beforeEach(async () => {
    await databaseManager.reset();
    online = false;
    server = { id: ID, version: 1, check_in_status: 'in-ring', ring_entry_time: STAMP };
    directPayloads = [];
    rpcFields = [];
    const offline = () => new TypeError('Failed to fetch');
    const client = {
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
        if (!online) throw offline();
        // A check-in-only write carries no version precondition (null): last write wins.
        if (args.p_expected_version != null && args.p_expected_version !== server.version) {
          return {
            data: null,
            error: { code: '40001', message: 'Version conflict', details: String(server.version) },
          };
        }
        rpcFields.push(args.p_fields as Record<string, unknown>);
        applyWrite(args.p_fields as Record<string, unknown>);
        return { data: server.version, error: null };
      }),
      from: vi.fn(() => {
        let payload: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          update: (data: Record<string, unknown>) => {
            payload = data;
            return builder;
          },
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          maybeSingle: async () => ({ data: { version: server.version }, error: null }),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            (async () => {
              if (!online) throw offline();
              if (filters.version !== undefined && filters.version !== server.version) {
                return { data: [], error: null };
              }
              directPayloads.push(payload);
              applyWrite(payload);
              return { data: [{ id: ID, version: server.version }], error: null };
            })().then(resolve, reject),
        };
        return builder;
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
    await table.batchSet([seed], new Map([[ID, 1]]));
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  async function replay() {
    online = true;
    await vi.waitFor(async () => {
      const db = await databaseManager.getDatabase('test');
      for (const queued of await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...queued, nextRetryAt: 0 });
      }
      await manager.uploadPendingMutations();
      expect(await manager.getPendingCount()).toBe(0);
    });
  }

  it('the narrow check-in write (Run Sheet, desk) clears it on the device and the server', async () => {
    await table.updateCheckInStatus(ID, 'checked-in');

    expect((await table.get(ID))?.ring_entry_time).toBeUndefined();
    await replay();
    expect(rpcFields[0]).toEqual({ check_in_status: 'checked-in', ring_entry_time: null });
    expect(server.ring_entry_time).toBeNull();
    expect(classifyEntryRunStatus({ entry_status: 'confirmed', ...server })?.value).not.toBe(
      'in-ring'
    );
  });

  it('a general entry update that sets a pre-run check-in clears it', async () => {
    await table.updateEntry(ID, { checkInStatus: 'conflict', check_in_status: 'conflict' });

    await replay();
    expect(server.check_in_status).toBe('conflict');
    expect(server.ring_entry_time).toBeNull();
  });

  it("the secretary's Pull clears it", async () => {
    await table.updateSecretaryLifecycleStatus(ID, {
      entry_status: 'scratched',
      check_in_status: 'pulled',
    });

    expect((await table.get(ID))?.ring_entry_time).toBeUndefined();
    await replay();
    expect(directPayloads[0]).toMatchObject({ check_in_status: 'pulled', ring_entry_time: null });
    expect(server.ring_entry_time).toBeNull();
  });

  it('keeps the ring time of a scored dog', async () => {
    await table.batchSet([{ ...seed, isScored: true } as ReplicatedEntry], new Map([[ID, 1]]));

    await table.updateCheckInStatus(ID, 'checked-in');

    await replay();
    expect(rpcFields[0]).toEqual({ check_in_status: 'checked-in' });
    expect(server.ring_entry_time).toBe(STAMP);
  });

  it('never clears for a run status, or when the write sets the ring time itself', () => {
    expect(staleRingTimeClear(seed, 'completed')).toEqual({});
    expect(staleRingTimeClear(seed, 'in-ring')).toEqual({});
    expect(staleRingTimeClear(seed, 'checked-in', { ring_entry_time: STAMP })).toEqual({});
    expect(staleRingTimeClear(seed, 'checked-in')).toEqual({ ring_entry_time: undefined });
  });
});
