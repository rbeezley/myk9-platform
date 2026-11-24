/**
 * MYK9-2361, on the real replica, queue and conflict path (no mock of them): the secretary moves
 * a trial's day (Edit Trial), then saves Edit Show with no one else editing. The server's
 * trg_sync_show_dates_from_trial rewrites the show's dates to the same days and bumps the row
 * version; that pull must never surface "changed somewhere else" against the secretary's own change.
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
import { replicatedShowsTable as shows } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable as trials } from '@/services/replication/ReplicatedTrialsTable';
import { syncReplicatedShowDates } from './deriveShowDatesFromTrials';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const TRIAL = 'trial-1';
const AUTH = 'trial-move-user';

/** The server stores show dates as midnight-UTC timestamptz and echoes them as `+00:00`. */
const serverShow = (extra: Record<string, unknown> = {}) => ({
  id: SHOW,
  name: 'Spring Specialty',
  organization: 'AKC',
  start_date: '2026-12-01T00:00:00+00:00',
  end_date: '2026-12-01T00:00:00+00:00',
  status: 'draft',
  version: 3,
  ...extra,
});

describe('Edit Trial date move then Edit Show save (MYK9-2361)', () => {
  let manager: MutationManager;
  const conflicts: unknown[] = [];

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

  const showAdapter = () =>
    (
      shows as unknown as { getRowRefetchAdapter(): Parameters<typeof refetchDirtyRowsById>[1] }
    ).getRowRefetchAdapter();

  const pullShow = (copy: Record<string, unknown>) =>
    refetchDirtyRowsById(
      shows as unknown as Parameters<typeof refetchDirtyRowsById>[0],
      { ...showAdapter(), fetchRowsById: async () => [copy] },
      [SHOW]
    );

  const pending = (): Promise<PendingMutation[]> => manager.getPendingMutationsForTable('shows');

  beforeEach(async () => {
    conflicts.length = 0;
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push(event);
        return true;
      },
    });
    manager = new MutationManager(supabase(), {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase() }),
    });
    shows.setMutationManager(manager);
    trials.setMutationManager(manager);
    await shows.clearCache();
    await trials.clearCache();
    const toLocalRow = showAdapter().toLocalRow as (r: unknown) => Parameters<typeof shows.set>[1];
    await shows.set(SHOW, toLocalRow(serverShow()), false, undefined, 3);
    await trials.set(
      TRIAL,
      { id: TRIAL, showId: SHOW, name: 'Trial 1', date: '2026-12-01' },
      false,
      undefined,
      1
    );
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('shows no conflict when the server echoes the moved dates after an Edit Show save', async () => {
    // Edit Trial: the date moves and the show follows (what trialStore.updateTrial does).
    await trials.updateTrial(TRIAL, { date: '2026-12-05' });
    await syncReplicatedShowDates(SHOW);
    // Edit Show: the secretary edits a show field and saves.
    await shows.updateShow(SHOW, { name: 'Spring Specialty 2' });

    // The server trigger set both dates to the moved day and bumped the version.
    await pullShow(
      serverShow({
        start_date: '2026-12-05T00:00:00+00:00',
        end_date: '2026-12-05T00:00:00+00:00',
        version: 4,
      })
    );

    expect(conflicts).toHaveLength(0);
    // The device keeps its own edit and takes the server's dates; its queued write still goes out.
    expect((await shows.getReplicatedRow(SHOW))!.data).toMatchObject({
      name: 'Spring Specialty 2',
      startDate: '2026-12-05T00:00:00+00:00',
      endDate: '2026-12-05T00:00:00+00:00',
    });
    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads.some(m => m.data.name === 'Spring Specialty 2')).toBe(true);
    // The queued show writes still carry the moved calendar days, so the server's derived dates agree.
    const queued: Record<string, unknown> = {};
    for (const m of uploads) Object.assign(queued, m.data);
    expect(queued).toMatchObject({ start_date: '2026-12-05', end_date: '2026-12-05' });
  });

  // A show with no live trial keeps its typed dates (the server derives dates only from live
  // trials), so the show wizard's edit must survive a pull and still collide on a different day.
  it('keeps a wizard-style dates edit on a show with no trial through an unrelated server change', async () => {
    await shows.updateShow(SHOW, { startDate: '2026-12-10', endDate: '2026-12-11' });

    await pullShow(serverShow({ name: 'Renamed Elsewhere', version: 4 }));

    expect(conflicts).toHaveLength(0);
    expect((await shows.getReplicatedRow(SHOW))!.data).toMatchObject({
      name: 'Renamed Elsewhere',
      startDate: '2026-12-10',
      endDate: '2026-12-11',
    });
    const queued: Record<string, unknown> = {};
    for (const m of (await pending()).filter(u => u.operation === 'UPDATE')) {
      Object.assign(queued, m.data);
    }
    expect(queued).toMatchObject({ start_date: '2026-12-10', end_date: '2026-12-11' });
  });

  it('still asks when the device and the server moved the dates to different days', async () => {
    await shows.updateShow(SHOW, { startDate: '2026-12-10', endDate: '2026-12-11' });

    await pullShow(
      serverShow({
        start_date: '2026-12-07T00:00:00+00:00',
        end_date: '2026-12-08T00:00:00+00:00',
        version: 4,
      })
    );

    expect(conflicts).toHaveLength(1);
    const detail = (conflicts[0] as CustomEvent<{ fields?: string[] }>).detail;
    expect(detail.fields).toEqual(['endDate', 'startDate']);
  });

  it('still asks when another device really renamed the show underneath the edit', async () => {
    await trials.updateTrial(TRIAL, { date: '2026-12-05' });
    await syncReplicatedShowDates(SHOW);
    await shows.updateShow(SHOW, { name: 'Spring Specialty 2' });

    await pullShow(
      serverShow({
        name: 'Renamed Elsewhere',
        start_date: '2026-12-05T00:00:00+00:00',
        end_date: '2026-12-05T00:00:00+00:00',
        version: 4,
      })
    );

    expect(conflicts).toHaveLength(1);
    const detail = (conflicts[0] as CustomEvent<{ fields?: string[] }>).detail;
    expect(detail.fields).toEqual(['name']);
  });
});
