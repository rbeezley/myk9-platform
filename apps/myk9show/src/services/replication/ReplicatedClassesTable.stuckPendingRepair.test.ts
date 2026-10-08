/**
 * MYK9-1055: the stuck-pending repair stores the row the download would, so the
 * classes table keeps the enrichment a fetch can lack (cached judge name,
 * self-check-in, visibility preset) instead of erasing it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedClassesTable, type ReplicatedClass } from './ReplicatedClassesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'class-1';

const cached = {
  id: ID,
  trialId: 'trial-1',
  classOrder: 1,
  judgeId: 'judge-1',
  judgeName: 'Pat Judge',
  judgeFirstName: 'Pat',
  judgeLastName: 'Judge',
  judgeResolved: true,
  selfCheckinEnabled: true,
  visibilityPreset: 'standard',
  _syncStatus: 'pending',
} as unknown as ReplicatedClass;

// The same server row after an enrichment failure: judge unknown, no visibility.
const unenrichedRemote = {
  ...cached,
  classOrder: 2,
  judgeName: undefined,
  judgeFirstName: undefined,
  judgeLastName: undefined,
  judgeResolved: false,
  selfCheckinEnabled: undefined,
  visibilityPreset: undefined,
  _syncStatus: 'synced',
} as unknown as ReplicatedClass;

describe('ReplicatedClassesTable stuck-pending repair (MYK9-1055)', () => {
  let table: ReplicatedClassesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedClassesTable();
    await table.clearCache();
    await table.set(ID, cached, false);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('keeps cached judge name, self-check-in and visibility the fetch lacked', async () => {
    const resolveConflict = (
      table as unknown as {
        resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass;
      }
    ).resolveConflict.bind(table);

    const result = await table.repairStuckPendingFlags({
      fetchRowsById: async () => [unenrichedRemote],
      getRemoteId: remote => String(remote.id),
      toLocalRow: remote => remote,
      resolveConflict,
    });

    expect(result.refreshed).toEqual([ID]);
    const row = await table.get(ID);
    expect(row?.classOrder).toBe(2);
    expect(row?.judgeName).toBe('Pat Judge');
    expect(row?.selfCheckinEnabled).toBe(true);
    expect(row?.visibilityPreset).toBe('standard');
    expect(row?._syncStatus).toBe('synced');
  });
});
