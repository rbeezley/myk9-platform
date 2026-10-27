/**
 * MYK9-1442 through a REAL queued upload: a queued full-row entry write must not
 * carry a column the caller never changed, because a server trigger (or another
 * device) may have moved that column since the device last saw it.
 *
 * The simulated server enforces the OCC version, bumps it on every write, and
 * runs the MYK9-1396 trigger: an un-pull (pulled -> no-status) restores the
 * check-in the Pull overwrote.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager, REPLICATION_STORES } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';
const AUTH = 'secretary-user';

const seed = {
  id: ID,
  showId: SHOW,
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  checkInStatus: 'checked-in',
  check_in_status: 'checked-in',
} as ReplicatedEntry;

describe('queued entry writes and server-derived columns (MYK9-1442)', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let online: boolean;
  let server: Record<string, unknown>;
  let directPayloads: Record<string, unknown>[];

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
    server = { id: ID, version: 1, check_in_status: 'checked-in' };
    directPayloads = [];
    const offline = () => new TypeError('Failed to fetch');
    const client = {
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
        if (!online) throw offline();
        if (args.p_expected_version !== server.version) {
          return {
            data: null,
            error: { code: '40001', message: 'Version conflict', details: String(server.version) },
          };
        }
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

  it('an offline Pull, Accept, then unrelated edit replays to the restored check-in', async () => {
    await table.updateCheckInStatus(ID, 'pulled');
    await table.updateCheckInStatus(ID, 'no-status');
    await table.updateEntry(ID, { specialRequests: 'Crate near the door' });

    await replay();

    expect(server.special_requests).toBe('Crate near the door');
    expect(server.check_in_status).toBe('checked-in');
    expect(directPayloads).toHaveLength(1);
    expect(directPayloads[0]).not.toHaveProperty('check_in_status');
  });

  it('a full-row edit queued on one device does not overwrite a check-in made on another', async () => {
    await table.updateEntry(ID, { specialRequests: 'Crate near the door' });
    // Device B checks the dog out of 'checked-in' on the server in the meantime
    // and this device pulls it before it comes back online.
    server.check_in_status = 'at-gate';
    server.version = 2;
    await table.batchSet(
      [{ ...seed, checkInStatus: 'at-gate', check_in_status: 'at-gate' } as ReplicatedEntry],
      new Map([[ID, 2]])
    );

    await replay();

    expect(server.special_requests).toBe('Crate near the door');
    expect(server.check_in_status).toBe('at-gate');
    expect(directPayloads[0]).not.toHaveProperty('check_in_status');
  });
});
