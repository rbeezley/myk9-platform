import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict, mergeNonConflictingServerFields } from './detectDirtyRowConflict';

interface EntryLike {
  id: string;
  checkInStatus?: string;
  resultStatus?: string;
}

describe('detectDirtyRowConflict', () => {
  it('returns changed fields when local and remote changed the same field from base', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'absent', resultStatus: 'pending' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['checkInStatus'] });
  });

  it('does not conflict when local and remote changed different fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'no-status', resultStatus: 'qualified' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('ignores replication bookkeeping fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', updated_at: 'a', _syncStatus: 'synced' },
      local: { id: '1', updated_at: 'b', _syncStatus: 'pending' },
      remote: { id: '1', updated_at: 'c', _syncStatus: 'synced' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('accepts interface row types without requiring an index signature', () => {
    const result = detectDirtyRowConflict<EntryLike>({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'absent' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['checkInStatus'] });
  });

  // MYK9-740, from the failing Regression trace: a judge's offline score upload
  // committed but the page reloaded before its response arrived. On the next
  // sync the server echoed the judge's own write back, and the only "difference"
  // was how the timestamp was spelled — the client stamped `…Z`, PostgREST
  // returned `…+00:00`. That surfaced "This record was changed elsewhere" for
  // the judge's own score.
  it('does not conflict when the server echoes the same instant in another ISO spelling', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', scoring_completed_at: null, scoringCompletedAt: null, result_status: null },
      local: {
        id: '1',
        scoring_completed_at: '2026-09-24T21:19:38.574Z',
        scoringCompletedAt: '2026-09-24T21:19:38.574Z',
        result_status: 'nq',
      },
      remote: {
        id: '1',
        scoring_completed_at: '2026-09-24T21:19:38.574+00:00',
        scoringCompletedAt: '2026-09-24T21:19:38.574+00:00',
        result_status: 'nq',
      },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('still conflicts when two timestamps name different instants', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', scoring_completed_at: null },
      local: { id: '1', scoring_completed_at: '2026-09-24T21:19:38.574Z' },
      remote: { id: '1', scoring_completed_at: '2026-09-24T21:19:38.575+00:00' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['scoring_completed_at'] });
  });

  it('keeps sub-millisecond differences that Date.parse would truncate', () => {
    // Postgres timestamptz carries microseconds; two distinct values inside
    // one millisecond are still different values.
    const result = detectDirtyRowConflict({
      base: { id: '1', scoring_completed_at: null },
      local: { id: '1', scoring_completed_at: '2026-09-24T21:19:38.574001Z' },
      remote: { id: '1', scoring_completed_at: '2026-09-24T21:19:38.574999+00:00' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['scoring_completed_at'] });
  });

  it('treats trailing fractional zeros and a zone offset as the same instant', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', scoring_completed_at: null },
      local: { id: '1', scoring_completed_at: '2026-09-24T21:19:38.5Z' },
      remote: { id: '1', scoring_completed_at: '2026-09-24T16:19:38.500000-05:00' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('does not treat a zone-less or date-only string as an instant', () => {
    // Without a zone the instant depends on the device's timezone, so these
    // are compared as text, exactly as before.
    const result = detectDirtyRowConflict({
      base: { id: '1', ring_time: null, trial_date: null },
      local: { id: '1', ring_time: '2026-09-24T21:19:38', trial_date: '2026-09-24' },
      remote: {
        id: '1',
        ring_time: '2026-09-24T21:19:38.000',
        trial_date: '2026-09-24T00:00:00Z',
      },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['ring_time', 'trial_date'] });
  });
});

describe('mergeNonConflictingServerFields', () => {
  it('adopts a server-changed field the client never touched (the clobber-prevention case)', () => {
    // Client edited checkInStatus; server set resultStatus. Merge must keep the
    // local edit AND pull in the server field, so the next full-row write does not
    // regress resultStatus to its stale value.
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'no-status', resultStatus: 'qualified' },
    });

    expect(result.merged).toEqual({
      id: '1',
      checkInStatus: 'checked-in',
      resultStatus: 'qualified',
    });
    expect(result.appliedFields).toEqual(['resultStatus']);
  });

  it('keeps the local value when the client changed the field (does not let remote win)', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'no-status' },
    });

    expect(result.merged).toEqual({ id: '1', checkInStatus: 'checked-in' });
    expect(result.appliedFields).toEqual([]);
  });

  it('applies nothing when the server matches base (no remote change)', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', a: 1, b: 2 },
      local: { id: '1', a: 9, b: 2 },
      remote: { id: '1', a: 1, b: 2 },
    });

    expect(result.merged).toEqual({ id: '1', a: 9, b: 2 });
    expect(result.appliedFields).toEqual([]);
  });

  it('does NOT merge a same-field divergence (that is a conflict, handled elsewhere)', () => {
    // Both sides changed checkInStatus differently → not adopted here; the caller
    // routes this to detectDirtyRowConflict instead.
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'absent' },
    });

    expect(result.merged).toEqual({ id: '1', checkInStatus: 'checked-in' });
    expect(result.appliedFields).toEqual([]);
  });

  it('ignores replication bookkeeping fields', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', updated_at: 'a' },
      local: { id: '1', updated_at: 'a' },
      remote: { id: '1', updated_at: 'c' },
    });

    expect(result.appliedFields).toEqual([]);
    expect(result.merged).toEqual({ id: '1', updated_at: 'a' });
  });
});
