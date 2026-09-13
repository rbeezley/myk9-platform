import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { groupEntriesByShow, indexOrdersById } from './groupEntriesByShow';
import {
  deriveDayCheckInTargets,
  isClassCheckInAvailableToday,
  isTrialDayToday,
  weekdayLabel,
} from './dayCheckIn';
import type { EntryClass, MyEntry } from './my-entries-types';

const SATURDAY = new Date('2026-10-24T00:00:00');
const SUNDAY = new Date('2026-10-25T00:00:00');
const PACIFIC = 'America/Los_Angeles';

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
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
  };
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
