/**
 * MYK9-1031: saving the paper check is online only and bound to the DISPLAY. The fingerprint is the
 * hash of the canonical results text of the rows the secretary ticked; nothing is read from the
 * replica at click time, so a correction that downloaded after the ticks cannot be attested to.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEntriesByClass = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const classWrites = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { set: classWrites, updateClass: classWrites },
  replicatedEntriesTable: { getEntriesByClass },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc, from } }));

import {
  classResultsCanonicalTextFromLines,
  hashClassResultsText,
} from '../classResultsFingerprint';
import {
  clearResultsVerified,
  isStaleResultsError,
  readServerResultsVerifiedAt,
  recordResultsVerified,
} from '../resultsVerifiedMutations';

const AT = '2026-10-10T21:15:00.000Z';
const LINE = (id: string, status: string) =>
  `${id}|1|${status}|45.2|\\N|\\N|\\N|\\N|1|0|0|0|0|0|1|\\N`;
const DISPLAYED = classResultsCanonicalTextFromLines([LINE('e1', 'qualified')]);

beforeEach(() => {
  classWrites.mockClear();
  from.mockReset();
  getEntriesByClass.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 7, error: null });
});

describe('saving the check (online only, MYK9-1031)', () => {
  it('calls mark_class_results_verified directly with exactly these argument names', async () => {
    await recordResultsVerified({
      classId: 'class-1',
      canonical: DISPLAYED,
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

    await recordResultsVerified({ classId: 'class-1', canonical: DISPLAYED });

    const sent = rpc.mock.calls[0]?.[1] as { p_results_fingerprint: string };
    expect(sent.p_results_fingerprint).toBe(await hashClassResultsText(DISPLAYED));
    expect(sent.p_results_fingerprint).not.toBe(await hashClassResultsText(moved));
    expect(getEntriesByClass).not.toHaveBeenCalled();
  });

  it('writes nothing to the local class: no stamp, no version, nothing queued', async () => {
    await recordResultsVerified({ classId: 'class-1', canonical: DISPLAYED, at: AT });
    await clearResultsVerified('class-1');

    expect(classWrites).not.toHaveBeenCalled();
  });

  it('writes nothing locally when the server refuses, and flags MK015 as stale scores', async () => {
    const refusal = { code: 'MK015', message: 'results changed' };
    rpc.mockResolvedValue({ data: null, error: refusal });

    const failure = await recordResultsVerified({
      classId: 'class-1',
      canonical: DISPLAYED,
    }).catch(error => error);

    expect(failure).toBe(refusal);
    expect(isStaleResultsError(failure)).toBe(true);
    expect(isStaleResultsError({ code: '42501' })).toBe(false);
    expect(classWrites).not.toHaveBeenCalled();
  });

  it('calls clear_class_results_verified directly', async () => {
    await clearResultsVerified('class-1');

    expect(rpc).toHaveBeenCalledWith('clear_class_results_verified', { p_class_id: 'class-1' });
  });
});

describe('the server check Release asks (MYK9-1031)', () => {
  const stubRead = (result: { data: unknown; error: unknown }) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => result),
    };
    from.mockReturnValue(chain);
    return chain;
  };

  it('reads named columns (never *) of exactly that class', async () => {
    const chain = stubRead({ data: { id: 'class-1', results_verified_at: AT }, error: null });

    await expect(readServerResultsVerifiedAt('class-1')).resolves.toBe(AT);

    expect(from).toHaveBeenCalledWith('classes');
    expect(chain.select).toHaveBeenCalledWith('id, results_verified_at');
    expect(chain.eq).toHaveBeenCalledWith('id', 'class-1');
  });

  it('reads null when the server holds no check', async () => {
    stubRead({ data: { id: 'class-1', results_verified_at: null }, error: null });
    await expect(readServerResultsVerifiedAt('class-1')).resolves.toBeNull();
  });

  it('throws when the read fails or finds no class: an unknown answer never counts as checked', async () => {
    stubRead({ data: null, error: { code: '500', message: 'down' } });
    await expect(readServerResultsVerifiedAt('class-1')).rejects.toBeDefined();
    stubRead({ data: null, error: null });
    await expect(readServerResultsVerifiedAt('class-1')).rejects.toThrow('Class not found');
  });
});
