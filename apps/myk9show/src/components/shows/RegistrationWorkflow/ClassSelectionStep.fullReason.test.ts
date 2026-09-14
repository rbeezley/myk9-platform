import { describe, it, expect } from 'vitest';
import {
  buildFullChipReason,
  type FullReasonClass,
} from './ClassSelectionStep.fullReason';

function row(overrides: Partial<FullReasonClass> & { classId: string }): FullReasonClass {
  return {
    element: 'Interior',
    level: 'Advanced',
    trialId: 'trial-sat',
    trialDate: '2026-10-24', // a Saturday
    entryLimit: 0,
    currentEntries: 0,
    isFull: false,
    allowsWaitlist: false,
    judgeDayFull: false,
    ...overrides,
  };
}

const SATURDAY_FULL = row({
  classId: 'sat-advanced',
  isFull: true,
  judgeDayFull: true,
});

const SUNDAY_OPEN = row({
  classId: 'sun-advanced',
  trialId: 'trial-sun',
  trialDate: '2026-10-25', // a Sunday
});

describe('buildFullChipReason (MYK9-515)', () => {
  it('returns null for a class that is not full', () => {
    expect(
      buildFullChipReason({ classId: 'sun-advanced', availability: [SUNDAY_OPEN] })
    ).toBeNull();
  });

  it('returns null when the class has no server row to reason from', () => {
    // Availability could not be read (offline, paused query). A confident
    // sentence about capacity here would be invented, not derived.
    expect(buildFullChipReason({ classId: 'sat-advanced', availability: [] })).toBeNull();
  });

  it('names the judge day when that is what ran out', () => {
    expect(buildFullChipReason({ classId: 'sat-advanced', availability: [SATURDAY_FULL] })).toBe(
      "The judge's Saturday is full. Contact the show secretary."
    );
  });

  it('names the class when the class has its own limit and reached it', () => {
    const capped = row({
      classId: 'sat-advanced',
      isFull: true,
      judgeDayFull: true,
      entryLimit: 20,
      currentEntries: 20,
    });
    expect(buildFullChipReason({ classId: 'sat-advanced', availability: [capped] })).toContain(
      'This class is full'
    );
  });

  it('names the trial when every class in it is full', () => {
    const other = row({ classId: 'sat-novice', level: 'Novice', isFull: true, judgeDayFull: true });
    expect(
      buildFullChipReason({ classId: 'sat-advanced', availability: [SATURDAY_FULL, other] })
    ).toContain('Every class in this trial is full');
  });

  it('offers the wait list when the class takes one', () => {
    const waitlisted = { ...SATURDAY_FULL, allowsWaitlist: true };
    expect(buildFullChipReason({ classId: 'sat-advanced', availability: [waitlisted] })).toBe(
      "The judge's Saturday is full — you can join the wait list."
    );
  });

  it("names the other day's class when one still has space", () => {
    expect(
      buildFullChipReason({ classId: 'sat-advanced', availability: [SATURDAY_FULL, SUNDAY_OPEN] })
    ).toBe("The judge's Saturday is full. Sunday's Interior Advanced still has space.");
  });

  it('does not offer a same-day sibling as "another day"', () => {
    const sameDaySibling = row({ classId: 'sat-advanced-2' });
    expect(
      buildFullChipReason({
        classId: 'sat-advanced',
        availability: [SATURDAY_FULL, sameDaySibling],
      })
    ).not.toContain('still has space');
  });

  it('does not offer a different level or element as a substitute', () => {
    const otherLevel = row({ classId: 'sun-novice', level: 'Novice', trialDate: '2026-10-25' });
    const otherElement = row({
      classId: 'sun-exterior',
      element: 'Exterior',
      trialDate: '2026-10-25',
    });
    expect(
      buildFullChipReason({
        classId: 'sat-advanced',
        availability: [SATURDAY_FULL, otherLevel, otherElement],
      })
    ).not.toContain('still has space');
  });

  it('does not offer a full class on another day', () => {
    const sundayAlsoFull = { ...SUNDAY_OPEN, isFull: true };
    expect(
      buildFullChipReason({
        classId: 'sat-advanced',
        availability: [SATURDAY_FULL, sundayAlsoFull],
      })
    ).not.toContain('still has space');
  });

  it('falls back to the secretary contact from the show record', () => {
    expect(
      buildFullChipReason({
        classId: 'sat-advanced',
        availability: [SATURDAY_FULL],
        secretaryContact: 'secretary@heartland.test',
      })
    ).toBe("The judge's Saturday is full. Contact the show secretary at secretary@heartland.test.");
  });

  it('reads the trial date as a local day, not a UTC instant', () => {
    // `new Date('2026-10-25')` is UTC midnight, which renders as Saturday for
    // every exhibitor west of Greenwich — pointing at the wrong day is worse
    // than saying nothing.
    expect(
      buildFullChipReason({ classId: 'sat-advanced', availability: [SATURDAY_FULL, SUNDAY_OPEN] })
    ).toContain("Sunday's");
  });
});
