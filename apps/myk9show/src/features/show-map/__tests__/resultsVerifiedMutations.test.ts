/**
 * MYK9-1031: the fingerprint the paper check carries is the replica's own results, hashed the way
 * the server hashes them (classResultsFingerprint.test.ts pins the algorithm to one fixture).
 * Here: the replica entry shape (camelCase and snake_case spellings, string placement) reaches it
 * intact, and a changed result changes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEntriesByClass = vi.hoisted(() => vi.fn());
const applyResultsVerified = vi.hoisted(() => vi.fn(async () => undefined));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { getEntriesByClass },
  replicatedClassesTable: { applyResultsVerified },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import { classResultsFingerprint } from '../classResultsFingerprint';
import {
  captureResultsCheck,
  classResultsSnapshot,
  clearResultsVerified,
  currentClassResultsFingerprint,
  isStaleResultsError,
  recordResultsVerified,
} from '../resultsVerifiedMutations';

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
  applyResultsVerified.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 7, error: null });
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

describe('saving the check (online only, MYK9-1031)', () => {
  const AT = '2026-10-10T21:15:00.000Z';
  const claimFor = async (classId = 'class-1') => ({
    classId,
    fingerprint: await currentClassResultsFingerprint(classId),
    at: AT,
  });

  it('calls mark_class_results_verified directly with exactly these argument names', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);
    const claim = await captureResultsCheck('class-1');

    await recordResultsVerified({ claim: { ...claim, at: AT }, recordedBy: 'auth-1' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_class_results_verified', {
      p_class_id: 'class-1',
      p_results_fingerprint: await currentClassResultsFingerprint('class-1'),
      p_verified_at: AT,
    });
  });

  it('sends the fingerprint captured at the click, even if the replica moves afterwards', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);
    const claim = await captureResultsCheck('class-1');
    const ticked = claim.fingerprint;

    // A correction downloads before the request (or a retry of it) goes out.
    getEntriesByClass.mockResolvedValue([replicaEntry({ resultStatus: 'nq' })]);
    await recordResultsVerified({ claim, recordedBy: 'auth-1' });

    expect(rpc).toHaveBeenCalledWith(
      'mark_class_results_verified',
      expect.objectContaining({ p_results_fingerprint: ticked })
    );
  });

  it('mirrors the accepted check onto the local class with the returned version, never queued', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);

    await recordResultsVerified({ claim: await claimFor(), recordedBy: 'auth-1' });

    expect(applyResultsVerified).toHaveBeenCalledWith('class-1', { at: AT, by: 'auth-1' }, 7);
  });

  it('writes nothing locally when the server refuses, and flags MK015 as stale scores', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry()]);
    const refusal = { code: 'MK015', message: 'results changed' };
    rpc.mockResolvedValue({ data: null, error: refusal });

    const failure = await recordResultsVerified({
      claim: await claimFor(),
      recordedBy: 'a',
    }).catch(error => error);

    expect(failure).toBe(refusal);
    expect(isStaleResultsError(failure)).toBe(true);
    expect(isStaleResultsError({ code: '42501' })).toBe(false);
    expect(applyResultsVerified).not.toHaveBeenCalled();
  });

  it('captures nothing while an entry of the class has a score change waiting to sync', async () => {
    getEntriesByClass.mockResolvedValue([replicaEntry({ _syncStatus: 'pending' })]);

    await expect(captureResultsCheck('class-1')).rejects.toThrow(/waiting/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls clear_class_results_verified directly and mirrors the cleared row', async () => {
    await clearResultsVerified('class-1');

    expect(rpc).toHaveBeenCalledWith('clear_class_results_verified', { p_class_id: 'class-1' });
    expect(applyResultsVerified).toHaveBeenCalledWith('class-1', null, 7);
  });
});
