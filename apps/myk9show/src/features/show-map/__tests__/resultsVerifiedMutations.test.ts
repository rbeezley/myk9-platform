/**
 * MYK9-1031: the fingerprint the paper check carries is the replica's own results, hashed the way
 * the server hashes them (classResultsFingerprint.test.ts pins the algorithm to one fixture).
 * Here: the replica entry shape (camelCase and snake_case spellings, string placement) reaches it
 * intact, and a changed result changes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEntriesByClass = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { getEntriesByClass },
  replicatedClassesTable: { setResultsVerified: vi.fn() },
}));

import { classResultsFingerprint } from '../classResultsFingerprint';
import { classResultsSnapshot, currentClassResultsFingerprint } from '../resultsVerifiedMutations';

const replicaEntry = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-0000-0000-000000104513',
  isScored: true,
  resultStatus: 'qualified',
  searchTimeSeconds: 45.2,
  area1_time_seconds: 45.2,
  total_correct_finds: 1,
  total_faults: 0,
  totalScore: 0,
  points_earned: 0,
  finalPlacement: '1',
  ...overrides,
});

beforeEach(() => {
  getEntriesByClass.mockReset();
});

describe('currentClassResultsFingerprint', () => {
  it('hashes the replica entries as the server would hash the same columns', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);

    await expect(currentClassResultsFingerprint('class-1')).resolves.toBe(
      await classResultsFingerprint([
        {
          id: '00000000-0000-0000-0000-000000104513',
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 45.2,
          area1_time_seconds: 45.2,
          total_correct_finds: 1,
          total_faults: 0,
          total_score: 0,
          points_earned: 0,
          final_placement: '1',
        },
      ])
    );
  });

  it('hashes the placement the upload writes: finalPlacement wins over a stale final_placement', async () => {
    // useClassResults recalculates placements by updating only `finalPlacement`.
    getEntriesByClass.mockResolvedValue([
      replicaEntry({ finalPlacement: '2', final_placement: '1' }),
    ]);
    const fingerprint = await currentClassResultsFingerprint('class-1');

    getEntriesByClass.mockResolvedValue([
      replicaEntry({ finalPlacement: '2', final_placement: '2' }),
    ]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.toBe(fingerprint);
    getEntriesByClass.mockResolvedValue([
      replicaEntry({ finalPlacement: '1', final_placement: '1' }),
    ]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.not.toBe(fingerprint);
  });

  it('hashes no placement for a result that is not qualified, as the upload sends none', async () => {
    getEntriesByClass.mockResolvedValue([
      replicaEntry({ resultStatus: 'nq', finalPlacement: '3' }),
    ]);
    const withStale = await currentClassResultsFingerprint('class-1');
    getEntriesByClass.mockResolvedValue([
      replicaEntry({ resultStatus: 'nq', finalPlacement: undefined }),
    ]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.toBe(withStale);
  });

  it('reports entries with a local change the server has not acknowledged', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry({ _syncStatus: 'synced' })]);
    await expect(classResultsSnapshot('class-1')).resolves.toMatchObject({
      hasUnsyncedEntries: false,
    });
    getEntriesByClass.mockResolvedValue([
      replicaEntry(),
      replicaEntry({ id: 'e2', _syncStatus: 'pending' }),
    ]);
    await expect(classResultsSnapshot('class-1')).resolves.toMatchObject({
      hasUnsyncedEntries: true,
    });
  });

  it('moves when a result is corrected, and not when an unrelated field changes', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);
    const before = await currentClassResultsFingerprint('class-1');

    getEntriesByClass.mockResolvedValue([replicaEntry({ armband: '999', runOrder: 4 })]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.toBe(before);

    getEntriesByClass.mockResolvedValue([replicaEntry({ resultStatus: 'nq' })]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.not.toBe(before);
  });
});
