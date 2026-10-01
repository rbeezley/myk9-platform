import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MutationManager } from '@myk9/replication';
import { fromAny } from '@total-typescript/shoehorn';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';

const show = (id: string): ReplicatedShow => ({
  id,
  name: id,
  organization: 'AKC',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  location: 'Fairgrounds',
  status: 'published',
  clubId: 'club-1',
});

const manager = (getPending: () => Promise<Array<{ operation: string }>>) => ({
  rowRefetchers: { register: vi.fn() },
  getPendingMutationsForRow: vi.fn(getPending),
  discardPendingMutationsForRow: vi.fn(),
});

describe('ReplicatedShowsTable.hasUnsyncedWork', () => {
  let table: ReplicatedShowsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    await table.set('synced', show('synced'));
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('is true for a show created on this device, whatever the queue says', async () => {
    await table.set('local', { ...show('local'), _localOnly: true }, true);
    const m = manager(async () => []);
    table.setMutationManager(fromAny<MutationManager, unknown>(m));

    await expect(table.hasUnsyncedWork('local')).resolves.toBe(true);
  });

  it('is true while ANY mutation is queued for the show, and never touches the queue', async () => {
    const m = manager(async () => [{ operation: 'UPDATE' }]);
    table.setMutationManager(fromAny<MutationManager, unknown>(m));

    await expect(table.hasUnsyncedWork('synced')).resolves.toBe(true);

    expect(m.getPendingMutationsForRow).toHaveBeenCalledWith('shows', 'synced');
    expect(m.discardPendingMutationsForRow).not.toHaveBeenCalled();
  });

  it('is false for a synced show with an empty queue', async () => {
    table.setMutationManager(fromAny<MutationManager, unknown>(manager(async () => [])));

    await expect(table.hasUnsyncedWork('synced')).resolves.toBe(false);
  });

  it('rejects when the queue cannot be read', async () => {
    const m = manager(async () => {
      throw new Error('queue unavailable');
    });
    table.setMutationManager(fromAny<MutationManager, unknown>(m));

    await expect(table.hasUnsyncedWork('synced')).rejects.toThrow('queue unavailable');
  });
});
