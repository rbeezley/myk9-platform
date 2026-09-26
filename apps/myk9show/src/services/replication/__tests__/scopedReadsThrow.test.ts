import { afterEach, describe, expect, it, vi } from 'vitest';
import { replicatedArmbandsTable } from '../ReplicatedArmbandsTable';
import { replicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';
import { replicatedJudgeAssignmentsTable } from '../ReplicatedJudgeAssignmentsTable';
import { replicatedPaperworkPrintsTable } from '../ReplicatedPaperworkPrintsTable';
import { replicatedTrialsTable } from '../ReplicatedTrialsTable';

const failed = { ok: false as const, rows: [] as never[], error: new Error('IDB timeout') };

interface StatusReader {
  getAllWithStatus: (...args: never[]) => Promise<unknown>;
}

/**
 * MYK9-774: the scoped show-day readers were filters over getAll(), which hands
 * back [] for a failed IndexedDB read. A class then read as "no entries", a
 * show as "no trials", and the next armband as the show's starting number.
 * They throw now, so the caller shows an error, falls back to the server, or
 * stops a write.
 */
describe('scoped show-day readers throw on a failed device read', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    {
      label: 'entries by class',
      table: replicatedEntriesTable,
      read: () => replicatedEntriesTable.getEntriesByClass('c1'),
    },
    {
      label: 'entries by show',
      table: replicatedEntriesTable,
      read: () => replicatedEntriesTable.getEntriesByShow('s1'),
    },
    {
      label: 'entries by armband',
      table: replicatedEntriesTable,
      read: () => replicatedEntriesTable.getEntriesByArmband('101'),
    },
    {
      label: 'classes by trial',
      table: replicatedClassesTable,
      read: () => replicatedClassesTable.getClassesByTrial('t1'),
    },
    {
      label: 'trials by show',
      table: replicatedTrialsTable,
      read: () => replicatedTrialsTable.getTrialsByShow('s1'),
    },
    {
      label: 'trials by date',
      table: replicatedTrialsTable,
      read: () => replicatedTrialsTable.getTrialsByDate('2026-10-10'),
    },
    {
      label: 'armbands by show',
      table: replicatedArmbandsTable,
      read: () => replicatedArmbandsTable.getByShow('s1'),
    },
    {
      label: 'armbands by dog',
      table: replicatedArmbandsTable,
      read: () => replicatedArmbandsTable.getByDog('d1'),
    },
    {
      label: 'judges by show',
      table: replicatedJudgeAssignmentsTable,
      read: () => replicatedJudgeAssignmentsTable.getByShowId('s1'),
    },
    {
      label: 'judges by person',
      table: replicatedJudgeAssignmentsTable,
      read: () => replicatedJudgeAssignmentsTable.getByPersonId('p1'),
    },
    {
      label: 'paperwork prints by show',
      table: replicatedPaperworkPrintsTable,
      read: () => replicatedPaperworkPrintsTable.getByShow('s1'),
    },
  ])('$label', async ({ table, read }) => {
    vi.spyOn(table as unknown as StatusReader, 'getAllWithStatus').mockResolvedValue(failed);

    await expect(read()).rejects.toThrow(/on this device/);
  });
});
