import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { computeDayTrialNumber } from '../dayTrialNumber';
import type { DbTrial } from '@/types/database-mappings';

function makeTrial(overrides: Partial<DbTrial> & { id: string; date: string }): DbTrial {
  return fromAny<DbTrial, unknown>({
    name: 'Trial',
    display_order: null,
    created_at: null,
    planned_start_time: null,
    actual_start_time: null,
    trial_number: null,
    ...overrides,
  });
}

describe('computeDayTrialNumber (MYK9-827)', () => {
  it('is undefined on a single-trial day', () => {
    const solo = makeTrial({ id: 'trial-1', date: '2026-04-12' });

    expect(computeDayTrialNumber(solo, [solo])).toBeUndefined();
  });

  describe('explicit trial_number (TrialEditPanel "Trial Number" field)', () => {
    it("uses the secretary-entered number for Trial 2's own box, not display_order", () => {
      // Both trials carry the WRONG display_order for their trial_number, to
      // prove the explicit number wins rather than being an incidental match.
      const trialOne = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        trial_number: '1',
        display_order: 2,
      });
      const trialTwo = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        trial_number: '2',
        display_order: 1,
      });
      const allTrials = [trialOne, trialTwo];

      expect(computeDayTrialNumber(trialOne, allTrials)).toBe(1);
      expect(computeDayTrialNumber(trialTwo, allTrials)).toBe(2);
    });

    it('ignores a value that looks like an event number, not a trial sequence', () => {
      // buildCreateShowPayload defaults trial_number to the trial's name/label,
      // and a secretary's AKC-style event number can land here too -- neither
      // is a 1-10 sequence position, so both must fall back to derivation.
      const trialOne = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        trial_number: '2026123401',
        display_order: 1,
      });
      const trialTwo = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        trial_number: 'Trial 2',
        display_order: 2,
      });
      const allTrials = [trialOne, trialTwo];

      expect(computeDayTrialNumber(trialOne, allTrials)).toBe(1);
      expect(computeDayTrialNumber(trialTwo, allTrials)).toBe(2);
    });

    it('falls back to derivation when only one same-day trial has a valid explicit number', () => {
      const trialOne = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        trial_number: '1',
        display_order: 1,
      });
      const trialTwo = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        trial_number: null,
        display_order: 2,
      });
      const allTrials = [trialOne, trialTwo];

      expect(computeDayTrialNumber(trialOne, allTrials)).toBe(1);
      expect(computeDayTrialNumber(trialTwo, allTrials)).toBe(2);
    });

    it('falls back to derivation when same-day trials collide on the same explicit number', () => {
      const trialOne = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        trial_number: '1',
        display_order: 1,
      });
      const trialTwo = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        trial_number: '1',
        display_order: 2,
      });
      const allTrials = [trialOne, trialTwo];

      expect(computeDayTrialNumber(trialOne, allTrials)).toBe(1);
      expect(computeDayTrialNumber(trialTwo, allTrials)).toBe(2);
    });
  });

  describe('derived fallback (display_order 0/null, MYK9-827 Codex round 2)', () => {
    it('orders by start time across the 12/1 o’clock boundary when every display_order is 0', () => {
      // A naive string sort would put "1:00 PM" before "12:00 PM" ('0' < '1'
      // as the first character), which is chronologically backwards.
      const noon = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        display_order: 0,
        planned_start_time: '12:00 PM',
      });
      const onePm = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        display_order: 0,
        planned_start_time: '1:00 PM',
      });
      const allTrials = [noon, onePm];

      expect(computeDayTrialNumber(noon, allTrials)).toBe(1);
      expect(computeDayTrialNumber(onePm, allTrials)).toBe(2);
    });

    it('uses created_at once start time and display_order both tie', () => {
      const earlier = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      });
      const later = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        display_order: 0,
        created_at: '2026-01-02T00:00:00Z',
      });
      const allTrials = [earlier, later];

      expect(computeDayTrialNumber(earlier, allTrials)).toBe(1);
      expect(computeDayTrialNumber(later, allTrials)).toBe(2);
    });
  });

  describe('genuinely ambiguous input', () => {
    it('leaves the box unticked when every tie-break key matches (no explicit number, display_order 0/null, no start time, no created_at)', () => {
      const trialOne = makeTrial({ id: 'trial-1', date: '2026-04-12', display_order: 0 });
      const trialTwo = makeTrial({ id: 'trial-2', date: '2026-04-12', display_order: null });
      const allTrials = [trialOne, trialTwo];

      expect(computeDayTrialNumber(trialOne, allTrials)).toBeUndefined();
      expect(computeDayTrialNumber(trialTwo, allTrials)).toBeUndefined();
    });

    it('only blanks the trials that tie, not a third same-day trial that clearly sorts after them', () => {
      const tiedOne = makeTrial({
        id: 'trial-1',
        date: '2026-04-12',
        display_order: 0,
        planned_start_time: '9:00 AM',
      });
      const tiedTwo = makeTrial({
        id: 'trial-2',
        date: '2026-04-12',
        display_order: 0,
        planned_start_time: '9:00 AM',
      });
      const clearlyLast = makeTrial({
        id: 'trial-3',
        date: '2026-04-12',
        display_order: 0,
        planned_start_time: '5:00 PM',
      });
      const allTrials = [tiedOne, tiedTwo, clearlyLast];

      expect(computeDayTrialNumber(tiedOne, allTrials)).toBeUndefined();
      expect(computeDayTrialNumber(tiedTwo, allTrials)).toBeUndefined();
      expect(computeDayTrialNumber(clearlyLast, allTrials)).toBe(3);
    });
  });
});
