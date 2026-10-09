/**
 * MYK9-1031: saving the paper check is online only and bound to the DISPLAY. The fingerprint is the
 * hash of the canonical results text of the rows the secretary ticked; nothing is read from the
 * replica at click time, so a correction that downloaded after the ticks cannot be attested to.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyResultsVerified = vi.hoisted(() => vi.fn(async () => undefined));
const getEntriesByClass = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { applyResultsVerified },
  replicatedEntriesTable: { getEntriesByClass },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import {
  classResultsCanonicalTextFromLines,
  hashClassResultsText,
} from '../classResultsFingerprint';
import {
  clearResultsVerified,
  isStaleResultsError,
  recordResultsVerified,
} from '../resultsVerifiedMutations';

const AT = '2026-10-10T21:15:00.000Z';
const LINE = (id: string, status: string) =>
  `${id}|1|${status}|45.2|\\N|\\N|\\N|\\N|1|0|0|0|0|0|1|\\N`;
const DISPLAYED = classResultsCanonicalTextFromLines([LINE('e1', 'qualified')]);

beforeEach(() => {
  applyResultsVerified.mockClear();
  getEntriesByClass.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 7, error: null });
});

describe('saving the check (online only, MYK9-1031)', () => {
  it('calls mark_class_results_verified directly with exactly these argument names', async () => {
    await recordResultsVerified({
      classId: 'class-1',
      canonical: DISPLAYED,
      recordedBy: 'auth-1',
      at: AT,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_class_results_verified', {
      p_class_id: 'class-1',
      p_results_fingerprint: await hashClassResultsText(DISPLAYED),
      p_verified_at: AT,
    });
  });

  it('sends the fingerprint of the DISPLAYED rows even if the replica has moved on since', async () => {
    // The scores a correction changed after the secretary ticked: the replica now holds them.
    getEntriesByClass.mockResolvedValue([{ id: 'e1', resultStatus: 'nq', isScored: true }]);
    const moved = classResultsCanonicalTextFromLines([LINE('e1', 'nq')]);

    await recordResultsVerified({ classId: 'class-1', canonical: DISPLAYED, recordedBy: 'a' });

    const sent = rpc.mock.calls[0]?.[1] as { p_results_fingerprint: string };
    expect(sent.p_results_fingerprint).toBe(await hashClassResultsText(DISPLAYED));
    expect(sent.p_results_fingerprint).not.toBe(await hashClassResultsText(moved));
    expect(getEntriesByClass).not.toHaveBeenCalled();
  });

  it('mirrors the accepted check onto the local class with the returned version, never queued', async () => {
    await recordResultsVerified({
      classId: 'class-1',
      canonical: DISPLAYED,
      recordedBy: 'auth-1',
      at: AT,
    });

    expect(applyResultsVerified).toHaveBeenCalledWith('class-1', { at: AT, by: 'auth-1' }, 7);
  });

  it('writes nothing locally when the server refuses, and flags MK015 as stale scores', async () => {
    const refusal = { code: 'MK015', message: 'results changed' };
    rpc.mockResolvedValue({ data: null, error: refusal });

    const failure = await recordResultsVerified({
      classId: 'class-1',
      canonical: DISPLAYED,
      recordedBy: 'a',
    }).catch(error => error);

    expect(failure).toBe(refusal);
    expect(isStaleResultsError(failure)).toBe(true);
    expect(isStaleResultsError({ code: '42501' })).toBe(false);
    expect(applyResultsVerified).not.toHaveBeenCalled();
  });

  it('calls clear_class_results_verified directly and mirrors the cleared row', async () => {
    await clearResultsVerified('class-1');

    expect(rpc).toHaveBeenCalledWith('clear_class_results_verified', { p_class_id: 'class-1' });
    expect(applyResultsVerified).toHaveBeenCalledWith('class-1', null, 7);
  });
});
