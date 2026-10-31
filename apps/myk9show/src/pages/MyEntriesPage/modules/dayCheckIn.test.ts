import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { groupEntriesByShow, indexOrdersById } from './groupEntriesByShow';
import {
  deriveDayCheckInTargets,
  isClassCheckInAvailableToday,
  isTrialDayToday,
  trialDayState,
  weekdayLabel,
  isEntryCloseDayPast,
  isShowPastInTrialZones as isShowPast,
  buildDayCheckInContext,
} from './dayCheckIn';
import { splitShowsIntoSections } from './myShowSections';
import type { EntryClass, MyEntry } from './my-entries-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';

const SATURDAY = new Date('2026-10-24T00:00:00');
const SUNDAY = new Date('2026-10-25T00:00:00');
const PACIFIC = 'America/Los_Angeles';

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return withFixtureKind({
    id: 'c1',
    entryStatus: EntryStatus.ACCEPTED,
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    trialDate: SATURDAY,
    trialNumber: '1',
    trialTimezone: PACIFIC,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    ...overrides,
  });
}

function makeRow(classes: EntryClass[], overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: SATURDAY,
    showEndDate: SUNDAY,
    location: { venue: 'Expo Hall', city: 'Portland', state: 'OR' },
    dogName: 'Rex',
    dogId: 'd1',
    armband: '10',
    classes,
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
    ...overrides,
  };
}

/** Build one dog card plus the order index the gate needs. */
function buildDog(rows: MyEntry[], now: Date) {
  const orders = groupEntriesByOrder(rows, now);
  const [showGroup] = groupEntriesByShow(orders);
  return { dog: showGroup.dogs[0], ordersById: indexOrdersById(showGroup) };
}

describe('isTrialDayToday — the trial decides the day, not the device', () => {
  it('is false the night before, in the trial zone', () => {
    // 11pm Friday in Los Angeles.
    expect(isTrialDayToday(SATURDAY, PACIFIC, new Date('2026-10-24T06:00:00Z'))).toBe(false);
  });

  it('is true once the trial zone has reached the trial day', () => {
    // 9am Saturday in Los Angeles.
    expect(isTrialDayToday(SATURDAY, PACIFIC, new Date('2026-10-24T16:00:00Z'))).toBe(true);
  });

  // The pinned Eastern-device / Pacific-trial case: the device already says
  // Saturday 00:30, the trial's zone is still on Friday evening.
  it('is false at Saturday 00:30 Eastern for a Pacific trial', () => {
    expect(isTrialDayToday(SATURDAY, PACIFIC, new Date('2026-10-24T04:30:00Z'))).toBe(false);
  });

  it('is true at the same instant for an Eastern trial', () => {
    expect(isTrialDayToday(SATURDAY, 'America/New_York', new Date('2026-10-24T04:30:00Z'))).toBe(
      true
    );
  });

  it('is false without a trial date', () => {
    expect(isTrialDayToday(undefined, PACIFIC, new Date('2026-10-24T16:00:00Z'))).toBe(false);
  });
});

describe('trialDayState — unknown is not "not today" (MYK9-1557)', () => {
  const SATURDAY_MORNING = new Date('2026-10-24T16:00:00Z');

  it('is today on the trial day', () => {
    expect(trialDayState(SATURDAY, PACIFIC, SATURDAY_MORNING)).toBe('today');
  });

  it('is not-today on another day', () => {
    expect(trialDayState(new Date('2026-10-25T00:00:00'), PACIFIC, SATURDAY_MORNING)).toBe(
      'not-today'
    );
  });

  it('is unknown without a trial date, or with an invalid one', () => {
    expect(trialDayState(undefined, PACIFIC, SATURDAY_MORNING)).toBe('unknown');
    expect(trialDayState(new Date(Number.NaN), PACIFIC, SATURDAY_MORNING)).toBe('unknown');
  });

  it('moves from unknown to today when the trial date arrives', () => {
    expect(trialDayState(undefined, undefined, SATURDAY_MORNING)).toBe('unknown');
    expect(trialDayState(SATURDAY, PACIFIC, SATURDAY_MORNING)).toBe('today');
  });
});

describe('weekdayLabel', () => {
  it('names the trial day', () => {
    expect(weekdayLabel(SATURDAY, PACIFIC)).toBe('Saturday');
    expect(weekdayLabel(SUNDAY, 'America/New_York')).toBe('Sunday');
  });

  it('is undefined without a trial date', () => {
    expect(weekdayLabel(undefined, PACIFIC)).toBeUndefined();
  });
});

describe('deriveDayCheckInTargets', () => {
  it('offers nothing the night before', () => {
    const now = new Date('2026-10-24T06:00:00Z'); // 11pm Friday, Pacific
    const { dog, ordersById } = buildDog([makeRow([makeClass()])], now);

    const targets = deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false });

    expect(targets.classes).toEqual([]);
    expect(targets.weekday).toBeUndefined();
  });

  it('targets both of the day’s classes on the trial day', () => {
    const now = new Date('2026-10-24T16:00:00Z'); // 9am Saturday, Pacific
    const { dog, ordersById } = buildDog(
      [
        makeRow([
          makeClass({ id: 'c1', classId: 'class-1' }),
          makeClass({ id: 'c2', classId: 'class-2', name: 'Buried' }),
        ]),
      ],
      now
    );

    const targets = deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false });

    expect(targets.classes.map(cls => cls.id)).toEqual(['c1', 'c2']);
    expect(targets.weekday).toBe('Saturday');
  });

  it('leaves tomorrow’s class alone on a mixed-day dog', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog(
      [
        makeRow([
          makeClass({ id: 'c1', classId: 'class-1' }),
          makeClass({ id: 'c2', classId: 'class-2', trialDate: SUNDAY }),
        ]),
      ],
      now
    );

    const targets = deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false });

    expect(targets.classes.map(cls => cls.id)).toEqual(['c1']);
  });

  it('skips classes that already carry a state', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog(
      [
        makeRow([
          makeClass({ id: 'c1', classId: 'class-1', checkInStatus: 'at-gate' }),
          makeClass({ id: 'c2', classId: 'class-2' }),
          makeClass({ id: 'c3', classId: 'class-3', checkInStatus: 'no-status' }),
        ]),
      ],
      now
    );

    const targets = deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false });

    expect(targets.classes.map(cls => cls.id)).toEqual(['c2', 'c3']);
  });

  it('excludes a class whose self-check-in toggle the secretary closed', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog(
      [
        makeRow([
          makeClass({ id: 'c1', classId: 'class-1' }),
          makeClass({ id: 'c2', classId: 'class-2' }),
        ]),
      ],
      now
    );

    const targets = deriveDayCheckInTargets(dog, {
      now,
      ordersById,
      isPastShow: false,
      selfCheckinByClassId: { 'class-1': false },
    });

    expect(targets.classes.map(cls => cls.id)).toEqual(['c2']);
  });

  it('offers nothing at a Pacific trial while the device is 30 minutes into Saturday Eastern', () => {
    const now = new Date('2026-10-24T04:30:00Z');
    const { dog, ordersById } = buildDog([makeRow([makeClass()])], now);

    expect(deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false }).classes).toEqual(
      []
    );
  });

  it('offers nothing once the show is past', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog([makeRow([makeClass()])], now);

    expect(deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: true }).classes).toEqual([]);
  });

  it('offers nothing for a pending (not yet accepted) entry', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog(
      [
        makeRow([makeClass({ entryStatus: EntryStatus.PENDING })], {
          entryStatus: EntryStatus.PENDING,
        }),
      ],
      now
    );

    expect(deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false }).classes).toEqual(
      []
    );
  });

  it('offers nothing for a cancelled show', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog, ordersById } = buildDog([makeRow([makeClass()], { isShowCancelled: true })], now);

    expect(deriveDayCheckInTargets(dog, { now, ordersById, isPastShow: false }).classes).toEqual(
      []
    );
  });
});

describe('isClassCheckInAvailableToday', () => {
  it('is false for a class whose order is missing from the index', () => {
    const now = new Date('2026-10-24T16:00:00Z');
    const { dog } = buildDog([makeRow([makeClass()])], now);

    expect(
      isClassCheckInAvailableToday(dog.classes[0], { now, ordersById: {}, isPastShow: false })
    ).toBe(false);
  });
});

describe('isEntryCloseDayPast (Codex, PR #2201)', () => {
  const CHICAGO = 'America/Chicago';
  /** Midday Central on 24 Oct 2026. */
  const now = new Date('2026-10-24T17:00:00Z');
  /** Local midnight, the shape `parseShowDate` hands the page. */
  const closeDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  it('is false on the close date itself — the day is inclusive', () => {
    expect(isEntryCloseDayPast(closeDay('2026-10-24'), CHICAGO, now)).toBe(false);
  });

  it('is false one minute after local midnight on the close date', () => {
    expect(
      isEntryCloseDayPast(closeDay('2026-10-24'), CHICAGO, new Date('2026-10-24T05:01:00Z'))
    ).toBe(false);
  });

  it('is true the next calendar day', () => {
    expect(isEntryCloseDayPast(closeDay('2026-10-23'), CHICAGO, now)).toBe(true);
  });

  it('reckons the day in the TRIAL zone, not the device zone', () => {
    // 03:00 UTC on the 25th is still the 24th in Chicago, so a show closing
    // on the 24th has not closed for a device sitting in UTC.
    const justAfterUtcMidnight = new Date('2026-10-25T03:00:00Z');
    expect(isEntryCloseDayPast(closeDay('2026-10-24'), CHICAGO, justAfterUtcMidnight)).toBe(false);
  });

  it('is false when the show never set a close date', () => {
    expect(isEntryCloseDayPast(undefined, CHICAGO, now)).toBe(false);
  });
});

describe('isEntryCloseDayPast with an unknown zone (Codex, PR #2201 round five)', () => {
  const closeDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  it('holds the window open while zones could still disagree', () => {
    // 21:30 on 1 Sep in Los Angeles. Guessing New York would call this the 2nd
    // and shut the window three hours early.
    expect(
      isEntryCloseDayPast(closeDay('2026-09-01'), undefined, new Date('2026-09-02T04:30:00Z'))
    ).toBe(false);
  });

  it('is past the moment the LAST zone on earth agrees, not a day later', () => {
    // 2026-09-02 15:00Z: UTC-12, the westernmost zone, has just reached the
    // 2nd, so a 1 Sep deadline is now past everywhere. Waiting a further UTC
    // day here offered an edit the server would refuse (Codex round six).
    expect(
      isEntryCloseDayPast(closeDay('2026-09-01'), undefined, new Date('2026-09-02T15:00:00Z'))
    ).toBe(true);
  });

  it('is still open one hour earlier, while UTC-12 is on the close day', () => {
    // 2026-09-02 11:00Z is 23:00 on 1 Sep in UTC-12 — the final hour anywhere.
    expect(
      isEntryCloseDayPast(closeDay('2026-09-01'), undefined, new Date('2026-09-02T11:00:00Z'))
    ).toBe(false);
  });

  it('still calls a months-old deadline past', () => {
    expect(
      isEntryCloseDayPast(closeDay('2026-07-01'), undefined, new Date('2026-09-01T12:00:00Z'))
    ).toBe(true);
  });

  it('never reports past before the close day itself', () => {
    expect(
      isEntryCloseDayPast(closeDay('2026-09-05'), undefined, new Date('2026-09-01T12:00:00Z'))
    ).toBe(false);
  });
});

describe('isShowPast — the trial zone decides when the last day is over', () => {
  const group = (classes: EntryClass[], row: Partial<MyEntry> = {}) =>
    groupEntriesByShow(groupEntriesByOrder([makeRow(classes, row)], SATURDAY))[0]!;
  const mountainShow = group([makeClass({ trialTimezone: 'America/Denver' })], {
    showDate: SATURDAY,
    showEndDate: SUNDAY,
  });

  it('is not past for an east-of-trial device past midnight (Mountain still on the last day)', () => {
    // 00:30 Monday the 26th Eastern is 22:30 Sunday the 25th Mountain.
    const easternMidnight = new Date('2026-10-26T04:30:00Z');
    expect(isShowPast(mountainShow, easternMidnight)).toBe(false);
    expect(buildDayCheckInContext(mountainShow, easternMidnight, undefined).isPastShow).toBe(false);
  });

  it('is past once the trial zone passes its last day', () => {
    const mountainMonday = new Date('2026-10-26T07:30:00Z'); // 00:30 Monday Mountain
    expect(isShowPast(mountainShow, mountainMonday)).toBe(true);
    expect(buildDayCheckInContext(mountainShow, mountainMonday, undefined).isPastShow).toBe(true);
  });

  it('is past for a west-of-trial device only after the trial zone is', () => {
    const easternShow = group([makeClass({ trialTimezone: 'America/New_York' })], {
      showDate: SUNDAY,
      showEndDate: SUNDAY,
    });
    // 21:30 Sunday Pacific is 00:30 Monday Eastern: over, whatever the device says.
    expect(isShowPast(easternShow, new Date('2026-10-26T04:30:00Z'))).toBe(true);
    expect(isShowPast(easternShow, new Date('2026-10-26T03:30:00Z'))).toBe(false);
  });

  it('keeps a multi-day show running when only an early day was entered', () => {
    const early = group([makeClass({ trialDate: SATURDAY, trialTimezone: PACIFIC })], {
      showDate: SATURDAY,
      showEndDate: SUNDAY,
    });
    expect(isShowPast(early, new Date('2026-10-25T16:00:00Z'))).toBe(false);
  });

  it('calls a long-finished show past even with no replicated trial date', () => {
    const undatedClass = group([makeClass({ trialDate: undefined, trialTimezone: undefined })], {
      showDate: SATURDAY,
      showEndDate: SUNDAY,
    });
    expect(isShowPast(undatedClass, new Date('2026-12-01T00:00:00Z'))).toBe(true);
  });

  it('never calls an undated show past', () => {
    const undated = group([makeClass()], { showDate: undefined, showEndDate: undefined });
    expect(isShowPast(undated, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('two-timezone show and My Shows sections', () => {
  const group = (classes: EntryClass[], row: Partial<MyEntry> = {}) =>
    groupEntriesByShow(groupEntriesByOrder([makeRow(classes, row)], SATURDAY))[0]!;

  it('keeps a show with a western trial still on its last day out of Past and checkable', () => {
    const show = group(
      [
        makeClass({ id: 'e', classId: 'ce', trialDate: SUNDAY, trialTimezone: 'America/New_York' }),
        makeClass({ id: 'w', classId: 'cw', trialDate: SUNDAY, trialTimezone: PACIFIC }),
      ],
      { showDate: SUNDAY, showEndDate: SUNDAY }
    );
    const now = new Date('2026-10-26T04:30:00Z'); // 00:30 Mon Eastern, 21:30 Sun Pacific
    expect(isShowPast(show, now)).toBe(false);
    const ctx = buildDayCheckInContext(show, now, undefined);
    const [east, west] = show.dogs[0]!.classes;
    expect(isClassCheckInAvailableToday(east!, ctx)).toBe(false);
    expect(isClassCheckInAvailableToday(west!, ctx)).toBe(true);
    expect(splitShowsIntoSections([show], now).past).toHaveLength(0);
    // Once Pacific passes midnight too, every trial is over.
    expect(isShowPast(show, new Date('2026-10-26T07:30:00Z'))).toBe(true);
  });

  it('east-of-trial device past local midnight keeps the show current, then Past after the trial zone', () => {
    const show = group([makeClass({ trialDate: SUNDAY, trialTimezone: PACIFIC })], {
      showDate: SUNDAY,
      showEndDate: SUNDAY,
    });
    const afterLocalMidnight = new Date('2026-10-26T04:30:00Z'); // 21:30 Sun Pacific
    const during = splitShowsIntoSections([show], afterLocalMidnight);
    expect(during.today).toHaveLength(1);
    expect(during.past).toHaveLength(0);
    expect(
      isClassCheckInAvailableToday(
        show.dogs[0]!.classes[0]!,
        buildDayCheckInContext(show, afterLocalMidnight, undefined)
      )
    ).toBe(true);
    const after = splitShowsIntoSections([show], new Date('2026-10-26T07:30:00Z'));
    expect(after.past).toHaveLength(1);
  });
});
