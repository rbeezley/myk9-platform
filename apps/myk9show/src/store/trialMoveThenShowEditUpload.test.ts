/**
 * MYK9-2361, the UPLOAD order, on the real MutationManager and replica: the trial write uploads
 * first, the server trigger (trg_sync_show_dates_from_trial) moves the show's dates and bumps its
 * version, and the queued show writes (the derived dates, then the Edit Show edit) arrive with the
 * old version and are rejected. The rejection re-fetches the show and reconciles it; the server's
 * timestamptz dates against the device's calendar days must not surface a conflict, and the Edit
 * Show edit must still reach the server, rebased on the new version.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';

const server = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    show: {} as Row,
    trial: {} as Row,
    showUpdates: [] as Array<Row & { at: number }>,
  };
  const chain = (rows: () => Row[]) => {
    const builder: Record<string, unknown> = {
      is: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
    };
    return builder;
  };
  const from = (table: string) => ({
    select: () => chain(() => (table === 'shows' ? [state.show] : [state.trial])),
    update: (data: Row) => {
      let expected: unknown;
      const builder = {
        eq(column: string, value: unknown) {
          if (column === 'version') expected = value;
          return builder;
        },
        async select() {
          const row = table === 'shows' ? state.show : state.trial;
          if (expected !== undefined && expected !== row.version) return { data: [], error: null };
          Object.assign(row, data);
          row.version = (row.version as number) + 1;
          if (table === 'trials') {
            // trg_sync_show_dates_from_trial: the show follows its trial as midnight-UTC timestamptz.
            const day = `${String(data.date)}T00:00:00+00:00`;
            Object.assign(state.show, { start_date: day, end_date: day });
            state.show.version = (state.show.version as number) + 1;
          } else {
            state.showUpdates.push({ ...data, at: row.version as number });
            // trg_derive_show_dates: the derived days replace whatever the client sent.
            const day = `${String(state.trial.date)}T00:00:00+00:00`;
            Object.assign(state.show, { start_date: day, end_date: day });
          }
          return { data: [{ id: row.id, version: row.version }], error: null };
        },
      };
      return builder;
    },
  });
  return { state, client: { from } };
});

vi.mock('@/services/database/supabaseClient', () => ({ supabase: server.client }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { replicatedShowsTable as shows } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable as trials } from '@/services/replication/ReplicatedTrialsTable';
import { rowToShow } from '@/services/replication/showRowMapping';
import { syncReplicatedShowDates } from './deriveShowDatesFromTrials';

const SHOW = 'show-1';
const TRIAL = 'trial-1';
const AUTH = 'trial-move-upload-user';
const OLD_DAY = '2026-12-01T00:00:00+00:00';

describe('Edit Trial date move then Edit Show save, upload order (MYK9-2361)', () => {
  let manager: MutationManager;
  const conflicts: unknown[] = [];

  const pending = async (): Promise<PendingMutation[]> => {
    const db = await databaseManager.getDatabase('test');
    return (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  };

  beforeEach(async () => {
    conflicts.length = 0;
    server.state.show = {
      id: SHOW,
      name: 'Spring Specialty',
      organization: 'AKC',
      start_date: OLD_DAY,
      end_date: OLD_DAY,
      status: 'draft',
      version: 3,
    };
    server.state.trial = {
      id: TRIAL,
      show_id: SHOW,
      name: 'Trial 1',
      date: '2026-12-01',
      version: 1,
    };
    server.state.showUpdates = [];
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
    const client = server.client as never;
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    shows.setMutationManager(manager);
    trials.setMutationManager(manager);
    await shows.clearCache();
    await trials.clearCache();
    await shows.set(SHOW, rowToShow(server.state.show as never), false, undefined, 3);
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it("rebases the Edit Show edit on the server version with no conflict, dates the server's", async () => {
    await trials.updateTrial(TRIAL, { date: '2026-12-05' });
    await syncReplicatedShowDates(SHOW);
    await shows.updateShow(SHOW, { name: 'Spring Specialty 2' });

    for (let pass = 0; pass < 4 && (await pending()).length > 0; pass++) {
      await manager.uploadPendingMutations();
      await vi.waitFor(() => expect(true).toBe(true));
      await new Promise(resolve => setTimeout(resolve, 50));
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + (pass + 1) * 10 * 60_000);
    }

    expect(conflicts).toHaveLength(0);
    expect(server.state.show).toMatchObject({
      name: 'Spring Specialty 2',
      start_date: '2026-12-05T00:00:00+00:00',
      end_date: '2026-12-05T00:00:00+00:00',
    });
    expect(await pending()).toHaveLength(0);
    expect((await shows.getReplicatedRow(SHOW))!.data).toMatchObject({
      name: 'Spring Specialty 2',
      startDate: '2026-12-05T00:00:00+00:00',
      endDate: '2026-12-05T00:00:00+00:00',
    });
  });
});
