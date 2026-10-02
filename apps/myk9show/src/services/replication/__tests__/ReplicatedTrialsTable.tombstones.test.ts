import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  databaseManager,
  configureConflictSurfacing,
  refetchDirtyRowsById,
} from '@myk9/replication';
import { ReplicatedTrialsTable, rowToTrial } from '../ReplicatedTrialsTable';
import { mapReplicatedTrialToDbRow } from '@/services/mappers/trialMappers';
import type { Database } from '@/types/supabase';

const server = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  filters: [] as string[],
  fetchLimit: Infinity,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (_columns: string, options?: { head?: boolean }) => {
        const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
        const builder = {
          eq: (key: string, value: unknown) => {
            predicates.push(row => row[key] === value);
            return builder;
          },
          is: (key: string, value: unknown) => {
            server.filters.push(key);
            predicates.push(row => (row[key] ?? null) === value);
            return builder;
          },
          in: (key: string, values: unknown[]) => {
            predicates.push(row => values.includes(row[key]));
            return builder;
          },
          gt: (key: string, value: string) => {
            predicates.push(row => String(row[key]) > value);
            return builder;
          },
          order: () => builder,
          then: (resolve: (value: unknown) => unknown) => {
            const rows = server.rows.filter(row => predicates.every(predicate => predicate(row)));
            return Promise.resolve(
              options?.head
                ? { count: rows.length, error: null }
                : { data: rows.slice(0, server.fetchLimit), error: null }
            ).then(resolve);
          },
        };
        return builder;
      },
    }),
  },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
const stamp = '2026-10-01T12:00:00.000Z';
const row = (id: string, show = 'show-1', deleted: string | null = null, updated = stamp) => ({
  id,
  show_id: show,
  name: id,
  date: '2026-10-10',
  deleted_at: deleted,
  updated_at: updated,
  version: 2,
});
const local = (id: string, showId = 'show-1') => ({ id, showId, name: id, date: '2026-10-10' });

describe('trial authoritative tombstones (MYK9-938)', () => {
  let table: ReplicatedTrialsTable;
  beforeEach(async () => {
    await databaseManager.reset();
    table = new ReplicatedTrialsTable();
    server.rows = [];
    server.filters = [];
    server.fetchLimit = Infinity;
  });
  afterEach(async () => {
    await databaseManager.reset();
    configureConflictSurfacing(false);
  });

  it('does not treat a capped tombstone fetch as complete active coverage', async () => {
    await table.set('live', local('live'));
    await table.set('removed', local('removed'));
    server.rows = [row('removed', 'show-1', stamp), row('live')];
    server.fetchLimit = 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    await table.sync('show-1', { forceFullSync: true });
    expect(await table.getTrialById('live')).toMatchObject({ id: 'live' });
    expect(await table.getTrialById('removed')).toBeNull();
  });

  it('preserves the tombstone through row and service mapping', () => {
    const mapped = rowToTrial(
      row('t1', 'show-1', stamp) as unknown as Database['public']['Tables']['trials']['Row']
    );
    expect(mapReplicatedTrialToDbRow(mapped)).toHaveProperty('deleted_at', stamp);
  });

  it.each([false, true])(
    'removes tombstones on sync (force full %s), survives cold reopen and accepts restore',
    async forceFullSync => {
      await table.set('t1', local('t1'));
      await table.set('t2', local('t2'));
      await table.set('other', local('other', 'show-2'));
      await table.updateSyncMetadata(
        { lastIncrementalSyncAt: Date.parse(stamp) - 1000, lastFullSyncAt: Date.now() },
        { scopeValue: 'show-1' }
      );
      server.rows = [row('t1', 'show-1', stamp), row('t2'), row('other', 'show-2')];
      expect((await table.sync('show-1', { forceFullSync })).success).toBe(true);
      expect(await table.getTrialById('t1')).toBeNull();
      expect((await table.getTrialsByShow('show-1')).map(trial => trial.id)).toEqual(['t2']);
      expect(await table.getTrialById('other')).toMatchObject({ id: 'other' });
      expect(await table.getSyncMetadata('show-1')).toMatchObject({
        totalRows: 1,
        expectedRemoteRows: 1,
      });
      expect(server.filters).toContain('deleted_at');
      table = new ReplicatedTrialsTable();
      expect(await table.getTrialById('t1')).toBeNull();
      server.rows[0] = { ...row('t1', 'show-1', null, '2026-10-01T12:01:00.000Z'), version: 3 };
      await table.sync('show-1');
      expect((await table.getTrialsByShow('show-1')).map(trial => trial.id).sort()).toEqual([
        't1',
        't2',
      ]);
      expect(await table.getTrialById('other')).toMatchObject({ id: 'other' });
    }
  );

  it('does not insert tombstones on empty startup, including the last deleted trial', async () => {
    server.rows = [row('t1', 'show-1', stamp)];
    expect((await table.sync('show-1')).success).toBe(true);
    expect(await table.getTrialsByShow('show-1')).toEqual([]);
    expect(await table.getSyncMetadata('show-1')).toMatchObject({
      totalRows: 0,
      expectedRemoteRows: 0,
    });
  });

  it('removes the last warm trial on a full all-tombstone fetch', async () => {
    await table.set('t1', local('t1'));
    server.rows = [row('t1', 'show-1', stamp)];
    await table.sync('show-1', { forceFullSync: true });
    expect(await table.getTrialById('t1')).toBeNull();
    expect(await table.getSyncMetadata('show-1')).toMatchObject({
      totalRows: 0,
      expectedRemoteRows: 0,
    });
  });

  it('protects a write queued during tombstone cleanup', async () => {
    await table.set('t1', local('t1'));
    server.rows = [row('t1', 'show-1', stamp)];
    const cleanup = table.deleteRowsIfClean.bind(table);
    vi.spyOn(table, 'deleteRowsIfClean').mockImplementationOnce(async ids => {
      await table.set('t1', { ...local('t1'), name: 'Concurrent edit' }, true);
      return cleanup(ids);
    });
    await table.sync('show-1');
    expect(await table.getReplicatedRow('t1')).toMatchObject({
      isDirty: true,
      data: { name: 'Concurrent edit' },
    });
  });

  it('refetches a tombstone into dirty OCC data without writing a restore', async () => {
    configureConflictSurfacing(true);
    class RefetchableTrials extends ReplicatedTrialsTable {
      adapter() {
        return this.getRowRefetchAdapter();
      }
    }
    const refetchable = new RefetchableTrials();
    await refetchable.batchSet([{ ...local('t1'), deletedAt: undefined }], new Map([['t1', 1]]));
    await refetchable.set('t1', { ...local('t1'), name: 'Unsynced', deletedAt: undefined }, true);
    server.rows = [row('t1', 'show-1', stamp)];
    const adapter = refetchable.adapter();
    const rebuild = vi.spyOn(adapter, 'rebuildUpdatePayload');
    await refetchDirtyRowsById(refetchable, adapter, ['t1']);
    expect(await refetchable.getReplicatedRow('t1')).toMatchObject({
      isDirty: true,
      serverVersion: 2,
      data: { name: 'Unsynced', deletedAt: stamp },
    });
    expect(await refetchable.getTrialById('t1')).toBeNull();
    const payload = adapter.rebuildUpdatePayload?.({ ...local('t1'), deletedAt: stamp });
    expect(payload).not.toHaveProperty('deleted_at');
    expect(rebuild).toHaveBeenCalled();
  });

  it('keeps a newer clean restore when an older tombstone fetch finishes later', async () => {
    await table.batchSet([local('t1')], new Map([['t1', 3]]));
    server.rows = [row('t1', 'show-1', stamp)];
    await table.sync('show-1');
    expect(await table.getReplicatedRow('t1')).toMatchObject({
      serverVersion: 3,
      data: { id: 't1' },
    });
    expect(await table.getTrialById('t1')).toMatchObject({ id: 't1' });
  });

  it('preserves unsynced edits when a tombstone arrives', async () => {
    await table.set('t1', { ...local('t1'), name: 'Unsynced' }, true);
    server.rows = [row('t1', 'show-1', stamp)];
    await table.sync('show-1');
    expect(await table.getReplicatedRow('t1')).toMatchObject({
      isDirty: true,
      data: { name: 'Unsynced' },
    });
  });
});
