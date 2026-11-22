/**
 * MYK9-1919 (recurrence of MYK9-1721), on the real replica and queue: several "This show uses…"
 * switches flipped without waiting for each other. `updateShow` reads the row, builds the next
 * row, then writes it; two flips that overlap both read the same row, so the later write puts
 * back the earlier flip's old value. The queued payloads carry only their own column, but the
 * replica row is what a rebase rebuilds them from, so the lost flip reaches the server as the
 * old value (or not at all).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  refetchDirtyRowsById,
  type PendingMutation,
} from '@myk9/replication';
import { replicatedShowsTable as table } from './ReplicatedShowsTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'show-1';
const AUTH = 'switch-race-user';

const serverShow = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Spring Specialty',
  organization: 'AKC',
  start_date: '2026-12-01',
  end_date: '2026-12-02',
  status: 'draft',
  version: 3,
  uses_device_scoring: true,
  uses_paper_packet: true,
  uses_volunteers: true,
  publishes_own_premium: false,
  ...extra,
});

describe('ReplicatedShowsTable overlapping switch flips (MYK9-1919)', () => {
  let manager: MutationManager;

  const supabase = () =>
    ({
      from: () => ({
        update: () => {
          const builder = {
            eq: () => builder,
            select: async () => {
              throw new TypeError('Failed to fetch');
            },
          };
          return builder;
        },
      }),
    }) as unknown as SupabaseClient;

  const row = () => table.getReplicatedRow(ID);
  const pending = (): Promise<PendingMutation[]> => manager.getPendingMutationsForTable('shows');

  const adapter = () =>
    (
      table as unknown as { getRowRefetchAdapter(): Parameters<typeof refetchDirtyRowsById>[1] }
    ).getRowRefetchAdapter();

  const pull = async (copy: Record<string, unknown>) =>
    refetchDirtyRowsById(
      table as unknown as Parameters<typeof refetchDirtyRowsById>[0],
      { ...adapter(), fetchRowsById: async () => [copy] },
      [ID]
    );

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    vi.stubGlobal('window', { dispatchEvent: () => true });
    manager = new MutationManager(supabase(), {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase() }),
    });
    table.setMutationManager(manager);
    await table.clearCache();
    const toLocalRow = (
      adapter() as unknown as { toLocalRow(r: unknown): Parameters<typeof table.set>[1] }
    ).toLocalRow;
    await table.set(ID, toLocalRow(serverShow()), false, undefined, 3);
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('keeps every switch of three flipped off at once, and queues one write each', async () => {
    await Promise.all([
      table.updateShow(ID, { usesDeviceScoring: false }),
      table.updateShow(ID, { usesPaperPacket: false }),
      table.updateShow(ID, { usesVolunteers: false }),
    ]);

    expect((await row())!.data).toMatchObject({
      usesDeviceScoring: false,
      usesPaperPacket: false,
      usesVolunteers: false,
    });
    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads.map(m => Object.keys(m.data).filter(k => k.startsWith('uses_')))).toEqual([
      ['uses_device_scoring'],
      ['uses_paper_packet'],
      ['uses_volunteers'],
    ]);
  });

  it('loses no switch turned off then back on at once, even after a stale server copy lands', async () => {
    await Promise.all([
      table.updateShow(ID, { usesDeviceScoring: false }),
      table.updateShow(ID, { usesPaperPacket: false }),
      table.updateShow(ID, { usesVolunteers: false }),
    ]);
    await Promise.all([
      table.updateShow(ID, { usesDeviceScoring: true }),
      table.updateShow(ID, { usesPaperPacket: true }),
      table.updateShow(ID, { usesVolunteers: true }),
    ]);

    await pull(
      serverShow({
        version: 4,
        uses_device_scoring: false,
        uses_paper_packet: false,
        uses_volunteers: false,
      })
    );

    expect((await row())!.data).toMatchObject({
      usesDeviceScoring: true,
      usesPaperPacket: true,
      usesVolunteers: true,
    });
    const latest: Record<string, unknown> = {};
    for (const m of (await pending()).filter(u => u.operation === 'UPDATE')) {
      Object.assign(latest, m.data);
    }
    expect(latest).toMatchObject({
      uses_device_scoring: true,
      uses_paper_packet: true,
      uses_volunteers: true,
    });
  });

  it('a rebase after another device flipped a different switch sends only the queued switch', async () => {
    await table.updateShow(ID, { usesDeviceScoring: false });

    // Device B turned paper off and renamed the show on the server; the pull rebases A's write.
    await pull(serverShow({ name: 'Renamed', uses_paper_packet: false, version: 4 }));

    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.serverVersion).toBe(4);
    expect(uploads[0]!.data).toMatchObject({ uses_device_scoring: false });
    for (const column of ['uses_paper_packet', 'uses_volunteers', 'name']) {
      expect(uploads[0]!.data).not.toHaveProperty(column);
    }
    expect((await row())!.data).toMatchObject({ usesPaperPacket: false, name: 'Renamed' });
  });

  it('a server echo between two local flips keeps both and sends each its own column', async () => {
    await table.updateShow(ID, { usesDeviceScoring: false });
    await pull(serverShow({ uses_device_scoring: false, version: 4 }));
    await table.updateShow(ID, { usesPaperPacket: false });

    expect((await row())!.data).toMatchObject({
      usesDeviceScoring: false,
      usesPaperPacket: false,
    });
    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads.flatMap(m => Object.keys(m.data).filter(k => k.startsWith('uses_')))).toEqual([
      'uses_device_scoring',
      'uses_paper_packet',
    ]);
  });

  // MYK9-2081: the edit form names only the fields it changed, and the queued write carries
  // those columns alone, so a switch another device flipped since stays flipped.
  it('a rename queues only the name, so a switch changed underneath is not written back', async () => {
    const toLocalRow = (
      adapter() as unknown as { toLocalRow(r: unknown): Parameters<typeof table.set>[1] }
    ).toLocalRow;
    await table.set(
      ID,
      toLocalRow(serverShow({ uses_device_scoring: false, version: 4 })),
      false,
      undefined,
      4
    );
    await table.updateShow(ID, { name: 'Renamed' });

    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.data).toMatchObject({ name: 'Renamed' });
    for (const column of [
      'uses_device_scoring',
      'start_date',
      'end_date',
      'status',
      'organization',
    ]) {
      expect(uploads[0]!.data).not.toHaveProperty(column);
    }
    expect((await row())!.data).toMatchObject({ name: 'Renamed', usesDeviceScoring: false });
  });

  it('a cleared note queues confirmation_message null and no other content column', async () => {
    await table.updateShow(ID, { confirmationMessage: 'Bring a crate' });
    await table.updateShow(ID, { confirmationMessage: null });

    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads.at(-1)!.data).toMatchObject({ confirmation_message: null });
    expect(uploads.at(-1)!.data).not.toHaveProperty('name');
  });
});
