/**
 * MYK9-2168: the clubs replica remembers WHOSE sync produced its rows, so a
 * reload on a shared browser can never hand one account's rows or watermark to
 * the next. Real replica (fake IndexedDB); only Supabase is faked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedClubsTable, type ReplicatedClub } from '../ReplicatedClubsTable';
import {
  ANONYMOUS_PRINCIPAL_MARKER,
  readReplicaPrincipalMarker,
  stampReplicaPrincipal,
} from '../clubsReplicaPrincipal';

const server = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { message: string } | null,
  sinceArgs: [] as string[],
  session: null as { user: { id: string; is_anonymous?: boolean } } | null,
}));

vi.mock('@/services/database/supabaseClient', () => {
  // Every query method returns the same chain; awaiting it yields the rows.
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'is', 'order', 'limit', 'abortSignal', 'in']) {
      chain[method] = () => chain;
    }
    chain.gt = (_column: string, since: string) => {
      server.sinceArgs.push(since);
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({
        data: server.error ? null : server.rows,
        error: server.error,
        count: server.rows.length,
      });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      auth: { getSession: vi.fn(async () => ({ data: { session: server.session } })) },
    },
  };
});

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const WATERMARK = Date.parse('2024-03-01T00:00:00Z');

const club = (id: string, name: string): ReplicatedClub => ({
  id,
  name,
  email: `${id}@club.com`,
  phone: '555',
});

const serverRow = (id: string, name: string, updatedAt: string) => ({
  id,
  name,
  email: `${id}@club.com`,
  phone: '555',
  updated_at: updatedAt,
  deleted_at: null,
});

function signInAs(id: string) {
  server.session = { user: { id } };
}

describe('ReplicatedClubsTable principal marker (MYK9-2168)', () => {
  let table: ReplicatedClubsTable;

  /** Rows and watermark as an earlier session left them, stamped for `marker`. */
  async function seedReplicaFor(marker: string | null) {
    await table.set('pending-1', club('pending-1', 'Staff Only Pending Club'));
    await table.set('public-1', club('public-1', 'Public Club'));
    await table.updateSyncMetadata({ lastIncrementalSyncAt: WATERMARK, totalRows: 2 });
    if (marker !== null) await stampReplicaPrincipal(table, marker);
  }

  async function ids() {
    return (await table.getAllClubs()).map(c => c.id).sort();
  }

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    server.rows = [];
    server.error = null;
    server.sinceArgs = [];
    server.session = null;
    table = new ReplicatedClubsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('purges the rows and the watermark when the stored marker is another account', async () => {
    await seedReplicaFor('staff-user');
    signInAs('member-user');

    const marker = await table.reconcilePrincipal();

    expect(marker).toBe('member-user');
    expect(await ids()).toEqual([]);
    const metadata = await table.getSyncMetadata();
    expect(metadata?.lastIncrementalSyncAt).toBe(0);
    expect(metadata?.lastFullSyncAt).toBe(0);
    expect(await readReplicaPrincipalMarker(table)).toBeUndefined();
  });

  it('full-syncs for the new account and stores its marker with the new watermark', async () => {
    await seedReplicaFor('staff-user');
    signInAs('member-user');
    server.rows = [serverRow('public-1', 'Public Club', '2024-05-01T00:00:00Z')];

    const result = await table.sync();

    expect(result.success).toBe(true);
    // The old account's watermark was NOT reused: the pull started at the epoch.
    expect(server.sinceArgs).toEqual([new Date(0).toISOString()]);
    expect(await ids()).toEqual(['public-1']);
    expect(await readReplicaPrincipalMarker(table)).toBe('member-user');
    expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(
      Date.parse('2024-05-01T00:00:00Z')
    );
  });

  it('purges a replica that predates the marker (missing marker)', async () => {
    await seedReplicaFor(null);
    signInAs('member-user');

    await table.reconcilePrincipal();

    expect(await ids()).toEqual([]);
    expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(0);
  });

  it('keeps the rows and the watermark when the marker matches (same account, offline)', async () => {
    await seedReplicaFor('member-user');
    signInAs('member-user');

    const marker = await table.reconcilePrincipal();

    expect(marker).toBe('member-user');
    expect(await ids()).toEqual(['pending-1', 'public-1']);
    expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(WATERMARK);
    expect(await readReplicaPrincipalMarker(table)).toBe('member-user');
  });

  it('keeps an incremental pull for the same account across a reload', async () => {
    await seedReplicaFor('member-user');
    signInAs('member-user');
    server.rows = [
      serverRow('pending-1', 'Staff Only Pending Club', '2024-01-01T00:00:00Z'),
      serverRow('public-1', 'Public Club', '2024-01-01T00:00:00Z'),
    ];

    await table.sync();

    expect(server.sinceArgs).toHaveLength(1);
    expect(server.sinceArgs[0]).not.toBe(new Date(0).toISOString());
    expect(await ids()).toEqual(['pending-1', 'public-1']);
  });

  it('purges when anonymous gives way to a signed-in account', async () => {
    server.session = null;
    await seedReplicaFor(ANONYMOUS_PRINCIPAL_MARKER);
    signInAs('member-user');

    await table.reconcilePrincipal();

    expect(await ids()).toEqual([]);
  });

  it('purges when a signed-in account gives way to anonymous, or a ringside passcode session', async () => {
    await seedReplicaFor('member-user');
    server.session = null;
    await table.reconcilePrincipal();
    expect(await ids()).toEqual([]);

    await seedReplicaFor('member-user');
    server.session = { user: { id: 'anon-session-id', is_anonymous: true } };
    await table.reconcilePrincipal();
    expect(await ids()).toEqual([]);
    expect(await readReplicaPrincipalMarker(table)).toBeUndefined();
  });

  it('keeps an anonymous replica for the same anonymous principal', async () => {
    await seedReplicaFor(ANONYMOUS_PRINCIPAL_MARKER);
    server.session = { user: { id: 'anon-session-id', is_anonymous: true } };

    await table.reconcilePrincipal();

    expect(await ids()).toEqual(['pending-1', 'public-1']);
  });

  it('purges when one account gives way to another (userA to userB)', async () => {
    await seedReplicaFor('user-a');
    signInAs('user-b');

    await table.reconcilePrincipal();

    expect(await ids()).toEqual([]);
  });

  it('never leaves the old marker on a replica whose sync then fails', async () => {
    await seedReplicaFor('staff-user');
    signInAs('member-user');
    server.error = { message: 'offline' };

    const result = await table.sync();

    expect(result.success).toBe(false);
    expect(await ids()).toEqual([]);
    // No marker was stored for rows that never arrived, so nothing stale is trusted.
    expect(await readReplicaPrincipalMarker(table)).toBeUndefined();
  });

  it('keeps a pending local edit while dropping the other account clean rows', async () => {
    signInAs('staff-user');
    await seedReplicaFor('staff-user');
    const created = await table.createClub({
      name: 'Draft Club',
      email: 'draft@club.com',
      phone: '555',
    });
    signInAs('member-user');

    await table.reconcilePrincipal();

    expect(await ids()).toEqual([created.id]);
  });

  it('purges nothing when the session cannot be read', async () => {
    await seedReplicaFor('staff-user');
    const { supabase } = await import('@/services/database/supabaseClient');
    vi.mocked(supabase.auth.getSession).mockRejectedValueOnce(new Error('storage blocked'));

    const marker = await table.reconcilePrincipal();

    expect(marker).toBeNull();
    expect(await ids()).toEqual(['pending-1', 'public-1']);
  });
});
