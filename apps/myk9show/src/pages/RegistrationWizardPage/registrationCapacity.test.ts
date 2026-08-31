import { describe, expect, it } from 'vitest';
import { getRegistrationCapacityState } from './registrationCapacity';

const selection = {
  dogId: 'dog-1',
  trialId: 'trial-1',
  selectedClasses: [{ classId: 'open' }, { classId: 'waitlist' }, { classId: 'entered' }],
};

describe('getRegistrationCapacityState', () => {
  it('separates open, full/wait-list, and full/blocked selections', () => {
    const state = getRegistrationCapacityState(
      [selection],
      [
        {
          classId: 'open',
          className: 'Open',
          element: null,
          level: 'Open',
          section: null,
          trialId: 'trial-1',
          trialName: 'Trial',
          trialDate: '2026-09-01',
          entryLimit: 10,
          currentEntries: 1,
          spotsAvailable: 9,
          waitlistCount: 0,
          isFull: false,
          hasWaitlist: false,
          allowsWaitlist: true,
          judgeId: null,
          judgeDayFull: false,
          judgeDayAvailable: 9,
        },
        {
          classId: 'waitlist',
          className: 'Full Waitlist',
          element: null,
          level: 'Open',
          section: null,
          trialId: 'trial-1',
          trialName: 'Trial',
          trialDate: '2026-09-01',
          entryLimit: 1,
          currentEntries: 1,
          spotsAvailable: 0,
          waitlistCount: 2,
          isFull: true,
          hasWaitlist: true,
          allowsWaitlist: true,
          judgeId: null,
          judgeDayFull: false,
          judgeDayAvailable: 0,
        },
        {
          classId: 'entered',
          className: 'Full Closed',
          element: null,
          level: 'Open',
          section: null,
          trialId: 'trial-1',
          trialName: 'Trial',
          trialDate: '2026-09-01',
          entryLimit: 1,
          currentEntries: 1,
          spotsAvailable: 0,
          waitlistCount: 0,
          isFull: true,
          hasWaitlist: false,
          allowsWaitlist: false,
          judgeId: null,
          judgeDayFull: false,
          judgeDayAvailable: 0,
        },
      ],
      new Set(['dog-1'])
    );

    expect(state.waitlistClassIds).toEqual(new Set(['waitlist']));
    expect(state.blockedClassIds).toEqual(new Set(['entered']));
    expect(state.unknownClassIds).toEqual(new Set());
  });

  it('keeps recovered selections unresolved until their class data returns', () => {
    const state = getRegistrationCapacityState([selection], [], new Set(['dog-1']));

    expect(state.unknownClassIds).toEqual(new Set(['open', 'waitlist', 'entered']));
    expect(state.waitlistClassIds).toEqual(new Set());
  });

  it('ignores capacity for a dog that was deselected after draft recovery', () => {
    const state = getRegistrationCapacityState(
      [
        { dogId: 'removed-dog', trialId: 'trial-1', selectedClasses: [{ classId: 'entered' }] },
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'open' }] },
      ],
      [
        {
          classId: 'entered',
          className: 'Full Closed',
          element: null,
          level: 'Open',
          section: null,
          trialId: 'trial-1',
          trialName: 'Trial',
          trialDate: '2026-09-01',
          entryLimit: 1,
          currentEntries: 1,
          spotsAvailable: 0,
          waitlistCount: 0,
          isFull: true,
          hasWaitlist: false,
          allowsWaitlist: false,
          judgeId: null,
          judgeDayFull: false,
          judgeDayAvailable: 0,
        },
        {
          classId: 'open',
          className: 'Open',
          element: null,
          level: 'Open',
          section: null,
          trialId: 'trial-1',
          trialName: 'Trial',
          trialDate: '2026-09-01',
          entryLimit: 10,
          currentEntries: 1,
          spotsAvailable: 9,
          waitlistCount: 0,
          isFull: false,
          hasWaitlist: false,
          allowsWaitlist: true,
          judgeId: null,
          judgeDayFull: false,
          judgeDayAvailable: 9,
        },
      ],
      new Set(['dog-1'])
    );

    expect(state.blockedClassIds).toEqual(new Set());
    expect(state.unknownClassIds).toEqual(new Set());
  });
});
