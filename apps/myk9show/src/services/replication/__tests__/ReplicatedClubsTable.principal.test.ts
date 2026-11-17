/**
 * MYK9-2153: the principal a clubs sync last completed for is persisted in the
 * table's sync metadata, so a sign-in change that happened before a reload still
 * forces a full pull (an incremental one never delivers an unchanged club that
 * the earlier, narrower principal could not see).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedClubsTable } from '../ReplicatedClubsTable';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: { getSession: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: supabaseMock }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ZERO = new Date(0).toISOString();

function signedInAs(id: string, isAnonymous = false) {
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { user: { id, is_anonymous: isAnonymous } } },
  });
}

function signedOut() {
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });
}

function mockServer(
  rows: Record<string, unknown>[] = [clubRow('club-old')],
  byId: Record<string, unknown>[] = []
) {
  const gt = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  });
  const inIds = vi.fn().mockResolvedValue({ data: byId, error: null });
  const ids = rows.map(row => ({ id: row.id }));
  supabaseMock.from.mockReturnValue({
    select: (_col: string, opts?: { head?: boolean }) =>
      opts?.head
        ? { is: vi.fn().mockResolvedValue({ count: ids.length, error: null }) }
        : {
            is: vi.fn().mockReturnValue({
              gt,
              in: inIds,
              limit: vi.fn().mockResolvedValue({ data: ids, error: null }),
            }),
          },
  });
  return { gt, inIds };
}

function clubRow(id: string) {
  return {
    id,
    version: 7,
    name: `Club ${id}`,
    email: null,
    phone: null,
    authorized_at: null,
    created_at: null,
    updated_at: new Date(Date.now() - 1000).toISOString(),
    deleted_at: null,
  };
}

describe('ReplicatedClubsTable synced principal (MYK9-2153)', () => {
  let table: ReplicatedClubsTable;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedClubsTable();
    // A device that has synced before: a stored club and a recent watermark.
    await table.set('club-old', { id: 'club-old', name: 'Old Club', email: '', phone: '' });
    await table.updateSyncMetadata({ lastIncrementalSyncAt: Date.now() - 60_000 });
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('syncs in full once when no principal was ever recorded, then records it', async () => {
    signedInAs('admin-1');
    let server = mockServer();
    await table.sync();
    expect(server.gt).toHaveBeenCalledWith('updated_at', ZERO);
    expect((await table.getSyncMetadata())?.lastSyncedPrincipalId).toBe('admin-1');

    server = mockServer();
    await table.sync();
    expect(server.gt).not.toHaveBeenCalledWith('updated_at', ZERO);
  });

  it('syncs in full after a reload when a different principal was recorded', async () => {
    signedInAs('demo-1');
    mockServer();
    await table.sync();

    // "Reload": a new instance, nothing in memory; the admin signs in.
    const reloaded = new ReplicatedClubsTable();
    signedInAs('admin-1');
    const server = mockServer();
    await reloaded.sync();

    expect(server.gt).toHaveBeenCalledWith('updated_at', ZERO);
    expect((await reloaded.getSyncMetadata())?.lastSyncedPrincipalId).toBe('admin-1');
  });

  it('stays incremental after a reload for the same principal', async () => {
    signedInAs('admin-1');
    mockServer();
    await table.sync();

    const reloaded = new ReplicatedClubsTable();
    const server = mockServer();
    await reloaded.sync();

    expect(server.gt).toHaveBeenCalledTimes(1);
    expect(server.gt).not.toHaveBeenCalledWith('updated_at', ZERO);
  });

  it('records an anonymous session as no principal, so the later sign-in forces full', async () => {
    signedInAs('anon-device', true);
    mockServer();
    await table.sync();
    expect((await table.getSyncMetadata())?.lastSyncedPrincipalId).toBeNull();

    const reloaded = new ReplicatedClubsTable();
    signedInAs('admin-1');
    const server = mockServer();
    await reloaded.sync();
    expect(server.gt).toHaveBeenCalledWith('updated_at', ZERO);
  });

  it('keeps the recorded principal when a sync fails, so the next one still forces full', async () => {
    signedInAs('demo-1');
    mockServer();
    await table.sync();

    signedInAs('admin-1');
    supabaseMock.from.mockReturnValue({
      select: () => ({
        is: () => ({
          gt: () => ({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }),
    });
    const failed = await table.sync();
    expect(failed.success).toBe(false);
    expect((await table.getSyncMetadata())?.lastSyncedPrincipalId).toBe('demo-1');

    const server = mockServer();
    await table.sync();
    expect(server.gt).toHaveBeenCalledWith('updated_at', ZERO);
  });

  it('records signed-out as null without disturbing the stored club', async () => {
    signedOut();
    mockServer();
    await table.sync();
    expect((await table.getSyncMetadata())?.lastSyncedPrincipalId).toBeNull();
    expect(await table.get('club-old')).not.toBeNull();
  });

  it('scans visibility in the same sync when a new sign-in forced the full pull', async () => {
    signedInAs('demo-1');
    mockServer();
    await table.sync();

    const idScan = await import('../idScanCadence');
    const due = vi.spyOn(idScan, 'shouldRunIdScan').mockReturnValue(false);
    const reconcile = vi.spyOn(table, 'reconcileVisibility');

    signedInAs('admin-1');
    mockServer();
    await table.sync();
    expect(reconcile).toHaveBeenCalledTimes(1);

    // Same principal, scan not due: no scan.
    mockServer();
    await table.sync();
    expect(reconcile).toHaveBeenCalledTimes(1);
    due.mockRestore();
  });

  it('never scans for a new anonymous principal', async () => {
    signedInAs('demo-1');
    mockServer();
    await table.sync();
    const reconcile = vi.spyOn(table, 'reconcileVisibility');

    signedInAs('anon-device', true);
    mockServer();
    await table.sync();
    expect(reconcile).not.toHaveBeenCalled();
  });

  describe('fetchClubById', () => {
    it('writes the club the server returns into the replica', async () => {
      mockServer([], [clubRow('club-pending')]);

      const club = await table.fetchClubById('club-pending');

      expect(club?.name).toBe('Club club-pending');
      expect(club?.authorizedAt).toBeNull();
      expect((await table.get('club-pending'))?.name).toBe('Club club-pending');
    });

    it('keeps the fetched row version so a later edit carries its OCC precondition', async () => {
      mockServer([], [clubRow('club-pending')]);

      await table.fetchClubById('club-pending');

      const stored = await table.getReplicatedRow('club-pending');
      expect(stored?.serverVersion).toBe(7);
    });

    it('writes nothing when the account changed while the read was in flight', async () => {
      signedInAs('admin-1');
      mockServer([], [clubRow('club-pending')]);
      supabaseMock.auth.getSession
        .mockResolvedValueOnce({ data: { session: { user: { id: 'admin-1' } } } })
        .mockResolvedValueOnce({ data: { session: { user: { id: 'other-2' } } } });

      await expect(table.fetchClubById('club-pending')).rejects.toThrow(/account changed/);
      expect(await table.get('club-pending')).toBeNull();
    });

    it('returns null and writes nothing when the server returns no row', async () => {
      mockServer([], []);

      expect(await table.fetchClubById('club-hidden')).toBeNull();
      expect(await table.get('club-hidden')).toBeNull();
    });
  });
});
