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
import { currentClassResultsFingerprint } from '../resultsVerifiedMutations';

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

  it('moves when a result is corrected, and not when an unrelated field changes', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);
    const before = await currentClassResultsFingerprint('class-1');

    getEntriesByClass.mockResolvedValue([replicaEntry({ armband: '999', runOrder: 4 })]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.toBe(before);

    getEntriesByClass.mockResolvedValue([replicaEntry({ resultStatus: 'nq' })]);
    await expect(currentClassResultsFingerprint('class-1')).resolves.not.toBe(before);
  });
});
