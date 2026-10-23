import { describe, expect, it } from 'vitest';

import {
  EMPTY_SCHEDULE_SELECTION,
  pruneSelection,
  toggleScheduleClass,
  toggleScheduleTrial,
  trialSelectionState,
} from './scheduleSelection';

describe('schedule selection (MYK9-1324)', () => {
  it('ticks and unticks classes within one trial', () => {
    const one = toggleScheduleClass(EMPTY_SCHEDULE_SELECTION, 'c1', 't1');
    const two = toggleScheduleClass(one, 'c2', 't1');
    expect(two).toEqual({ trialId: 't1', classIds: ['c1', 'c2'], switchedFrom: null });

    expect(toggleScheduleClass(two, 'c1', 't1').classIds).toEqual(['c2']);
  });

  it('a tick in another trial starts a new selection there and names the one it replaced', () => {
    const inT1 = toggleScheduleClass(EMPTY_SCHEDULE_SELECTION, 'c1', 't1');

    const inT2 = toggleScheduleClass(inT1, 'c9', 't2');

    expect(inT2).toEqual({ trialId: 't2', classIds: ['c9'], switchedFrom: 't1' });
    // The note is for the replacing tick only; the next tick clears it.
    expect(toggleScheduleClass(inT2, 'c8', 't2').switchedFrom).toBeNull();
  });

  it('starting the first selection replaces nothing', () => {
    expect(toggleScheduleClass(EMPTY_SCHEDULE_SELECTION, 'c1', 't1').switchedFrom).toBeNull();
  });

  it('the trial heading ticks every visible class, then clears them, and reports its state', () => {
    const all = toggleScheduleTrial(EMPTY_SCHEDULE_SELECTION, 't1', ['c1', 'c2']);
    expect(all.classIds).toEqual(['c1', 'c2']);
    expect(trialSelectionState(all, 't1', ['c1', 'c2'])).toBe('all');

    const some = toggleScheduleClass(all, 'c2', 't1');
    expect(trialSelectionState(some, 't1', ['c1', 'c2'])).toBe('some');
    expect(toggleScheduleTrial(some, 't1', ['c1', 'c2']).classIds).toEqual(['c1', 'c2']);

    expect(toggleScheduleTrial(all, 't1', ['c1', 'c2']).classIds).toEqual([]);
    expect(trialSelectionState(all, 't2', ['c5'])).toBe('none');
  });

  it('a heading in another trial replaces the selection too', () => {
    const inT1 = toggleScheduleClass(EMPTY_SCHEDULE_SELECTION, 'c1', 't1');

    expect(toggleScheduleTrial(inT1, 't2', ['c5', 'c6'])).toEqual({
      trialId: 't2',
      classIds: ['c5', 'c6'],
      switchedFrom: 't1',
    });
  });

  it('drops ticks on rows that are no longer visible, and empties when none are left', () => {
    const selection = toggleScheduleTrial(EMPTY_SCHEDULE_SELECTION, 't1', ['c1', 'c2']);

    expect(pruneSelection(selection, new Set(['c1', 'c2']))).toBe(selection);
    expect(pruneSelection(selection, new Set(['c2'])).classIds).toEqual(['c2']);
    expect(pruneSelection(selection, new Set())).toEqual(EMPTY_SCHEDULE_SELECTION);
  });
});
