/**
 * MYK9-792: the show-scoped readers read every show's rows on the device
 * (getAllOrThrow) and filtered by showId afterwards. On a tablet holding many
 * shows that scans them all, and an entries read can hit GET_ALL_TIMEOUT_MS.
 * They read one show's rows through the show index now (MYK9-788), and a
 * failed device read still throws (MYK9-774).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from '@myk9/replication';
import { gatherShowStructureScopes } from '@/features/offline-readiness/showStructureScopes';
import { replicatedArmbandsTable } from '../ReplicatedArmbandsTable';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';
import { replicatedJudgeAssignmentsTable } from '../ReplicatedJudgeAssignmentsTable';
import { replicatedPaperworkPrintsTable } from '../ReplicatedPaperworkPrintsTable';
import { replicatedTrialsTable } from '../ReplicatedTrialsTable';

// '@myk9/replication' does not export the constant; DatabaseManager names it.
const SHOW_ID_INDEX = 'tableName_showId';
const WHOLE_TABLE_INDEX = 'tableName';

interface SeedableTable {
  batchSet(items: never[]): Promise<void>;
  getByShowWithStatus(showId: string): Promise<unknown>;
}

/** Two rows in the show being read, one in another show. */
function rowsAcrossShows(extra: (n: number) => Record<string, unknown> = () => ({})) {
  return [
    { id: 'row-1', showId: 'show-1', ...extra(1) },
    { id: 'row-2', showId: 'show-1', ...extra(2) },
    { id: 'row-other', showId: 'show-2', ...extra(3) },
  ];
}

const READERS = [
  {
    label: 'entries by show',
    table: replicatedEntriesTable,
    read: () => replicatedEntriesTable.getEntriesByShow('show-1'),
  },
  {
    label: 'trials by show',
    table: replicatedTrialsTable,
    read: () => replicatedTrialsTable.getTrialsByShow('show-1'),
  },
  {
    label: 'judge assignments by show',
    table: replicatedJudgeAssignmentsTable,
    read: () => replicatedJudgeAssignmentsTable.getByShowId('show-1'),
  },
  {
    label: 'armbands by show',
    table: replicatedArmbandsTable,
    read: () => replicatedArmbandsTable.getByShow('show-1'),
  },
  {
    label: 'paperwork prints by show',
    table: replicatedPaperworkPrintsTable,
    read: () => replicatedPaperworkPrintsTable.getByShow('show-1'),
  },
];

function openedIndexes(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map(call => call[0]);
}

describe('show-scoped readers read through the show index (MYK9-792)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await databaseManager.reset();
  });

  it.each(READERS)(
    "$label: one show's rows, never the whole-table index",
    async ({ table, read }) => {
      await (table as unknown as SeedableTable).batchSet(
        rowsAcrossShows(n => ({ date: `2026-10-1${n}` })) as never[]
      );
      const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');

      const rows = (await read()) as Array<{ id: string; showId: string }>;

      expect(rows.map(row => row.id).sort()).toEqual(['row-1', 'row-2']);
      expect(openedIndexes(indexSpy)).toContain(SHOW_ID_INDEX);
      expect(openedIndexes(indexSpy)).not.toContain(WHOLE_TABLE_INDEX);
    }
  );

  it.each(READERS)('$label: a failed device read throws', async ({ table, read }) => {
    vi.spyOn(table as unknown as SeedableTable, 'getByShowWithStatus').mockResolvedValue({
      ok: false,
      rows: [],
      error: new Error('IDB timeout'),
    });

    await expect(read()).rejects.toMatchObject({ name: 'ReplicaReadError' });
  });

  it('trials by show stay sorted by date', async () => {
    await replicatedTrialsTable.batchSet([
      { id: 'late', showId: 'show-1', date: '2026-10-12' },
      { id: 'early', showId: 'show-1', date: '2026-10-10' },
    ] as never[]);

    const trials = await replicatedTrialsTable.getTrialsByShow('show-1');
    expect(trials.map(trial => trial.id)).toEqual(['early', 'late']);
  });

  it('judge assignments by show stay redacted', async () => {
    await replicatedJudgeAssignmentsTable.batchSet([
      { id: 'a1', showId: 'show-1', personId: 'p1', fee: 150, notes: 'private' },
    ] as never[]);

    const [assignment] = await replicatedJudgeAssignmentsTable.getByShowId('show-1');
    expect(assignment).toMatchObject({ id: 'a1', fee: null, notes: null });
  });

  it("the offline-readiness structure read reads the show's trials through the show index", async () => {
    await replicatedTrialsTable.batchSet(rowsAcrossShows() as never[]);
    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');

    const scopes = await gatherShowStructureScopes('show-1');

    expect(scopes.trials.label).toBe('trials');
    expect(openedIndexes(indexSpy)).toContain(SHOW_ID_INDEX);
    expect(openedIndexes(indexSpy)).not.toContain(WHOLE_TABLE_INDEX);
  });

  it('the offline-readiness structure read still throws on a failed trials read', async () => {
    vi.spyOn(replicatedTrialsTable, 'getByShowWithStatus').mockResolvedValue({
      ok: false,
      rows: [],
      error: new Error('IDB timeout'),
    });

    await expect(gatherShowStructureScopes('show-1')).rejects.toMatchObject({
      name: 'ReplicaReadError',
    });
  });
});
