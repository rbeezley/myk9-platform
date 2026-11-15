import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict } from '@myk9/replication';
import { ENTRY_DIRTY_ROW_COMPARE_POLICY } from './entriesDirtyRowComparePolicy';

type Row = Record<string, unknown>;

const status = (value: string): Row => ({ check_in_status: value, checkInStatus: value });

/** The row the judge's device holds: timer started (in-ring), then the score saved. */
const base: Row = { id: 'e1', ...status('in-ring'), is_scored: false, isScored: false };
const scoredLocal: Row = {
  ...base,
  ...status('completed'),
  is_scored: true,
  isScored: true,
  result_status: 'qualified',
  resultStatus: 'qualified',
};

function detect(local: Row, remote: Row, from: Row = base) {
  return detectDirtyRowConflict({
    base: from,
    local,
    remote,
    comparePolicy: ENTRY_DIRTY_ROW_COMPARE_POLICY,
  });
}

describe('entries compare policy: a check-in change and a score are different facts (MYK9-2010)', () => {
  it('a steward changing check-in never holds a queued score; the dog stays completed', () => {
    const result = detect(scoredLocal, { ...base, ...status('checked-in') });
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields ?? []).not.toContain('check_in_status');
  });

  it('an exhibitor self check-in during the run does not hold the score', () => {
    const result = detect(scoredLocal, { ...base, ...status('at-gate') });
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields ?? []).not.toContain('check_in_status');
  });

  it('a pull during the run keeps the score and keeps the pull so Show Desk can flag it', () => {
    const result = detect(scoredLocal, { ...base, ...status('pulled') });
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields).toEqual(expect.arrayContaining(['check_in_status']));
    expect(result.adoptRemoteFields).toEqual(expect.arrayContaining(['checkInStatus']));
  });

  it('an unscored in-ring start yields to the other device', () => {
    const checkedIn = { ...base, ...status('checked-in') };
    const local = { ...checkedIn, ...status('in-ring'), ring_entry_time: '2026-11-14T10:00:00Z' };
    const result = detect(local, { ...checkedIn, ...status('pulled') }, checkedIn);
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields).toEqual(expect.arrayContaining(['check_in_status']));
  });

  it('two devices scoring the same dog differently still collide on the score', () => {
    const result = detect(scoredLocal, {
      ...base,
      ...status('completed'),
      is_scored: true,
      isScored: true,
      result_status: 'nq',
      resultStatus: 'nq',
    });
    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(expect.arrayContaining(['result_status']));
  });

  it('two staff devices changing an unscored dog status still ask', () => {
    const checkedIn = { ...base, ...status('checked-in') };
    const result = detect(
      { ...checkedIn, ...status('at-gate') },
      { ...checkedIn, ...status('pulled') },
      checkedIn
    );
    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(expect.arrayContaining(['check_in_status']));
  });

  it('a score saved on the other device brings its status; no question about the score', () => {
    const checkedIn = { ...base, ...status('checked-in') };
    const result = detect(
      { ...checkedIn, ...status('at-gate') },
      { ...checkedIn, ...status('completed'), is_scored: true, isScored: true },
      checkedIn
    );
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields).toEqual(expect.arrayContaining(['check_in_status']));
  });

  it('a pull made here stays when the other device saved the score', () => {
    const checkedIn = { ...base, ...status('checked-in') };
    const result = detect(
      { ...checkedIn, ...status('pulled') },
      { ...checkedIn, ...status('completed'), is_scored: true, isScored: true },
      checkedIn
    );
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields ?? []).not.toContain('check_in_status');
  });

  it('a status change made here beats the other device unscored in-ring marker', () => {
    const checkedIn = { ...base, ...status('checked-in') };
    const result = detect(
      { ...checkedIn, ...status('pulled') },
      { ...checkedIn, ...status('in-ring') },
      checkedIn
    );
    expect(result.hasConflict).toBe(false);
    expect(result.adoptRemoteFields ?? []).not.toContain('check_in_status');
  });

  it('a day-of entry_status collision between two check-in changes asks', () => {
    const accepted = { id: 'e1', entry_status: 'accepted' };
    const result = detectDirtyRowConflict({
      base: accepted,
      local: { ...accepted, entry_status: 'scratched' },
      remote: { ...accepted, entry_status: 'withdrawn' },
      comparePolicy: ENTRY_DIRTY_ROW_COMPARE_POLICY,
    });
    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(['entry_status']);
  });
});
