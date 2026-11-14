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
  uses_landing_page: false,
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
});
