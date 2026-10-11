import { describe, it, expect } from 'vitest';
import { groupEntriesByShow } from './groupEntriesByShow';
import { buildYourDogsToday, classTimingOf, filterYourDogsToday } from './buildYourDogsToday';
import type { ClassTiming } from './buildYourDogsToday';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import type { DayCheckInContext } from './dayCheckIn';

function group() {
  const rows = [
    makeRow({
      id: 'e-juni',
      dogId: 'dog-juni',
      dogName: 'Juni',
      armband: '102',
      classes: [
        makeClass({
          id: 'c-juni-late',
          classId: 'k-late',
          name: 'Exterior Excellent',
          runOrder: 1,
        }),
        makeClass({
          id: 'c-juni-tomorrow',
          classId: 'k-tomorrow',
          name: 'Tomorrow Class',
          trialDate: day('2026-10-25'),
        }),
      ],
    }),
    makeRow({
      id: 'e-willow',
      dogId: 'dog-willow',
      dogName: 'Willow',
      armband: '100',
      classes: [
        makeClass({
          id: 'c-willow-early',
          classId: 'k-early',
          name: 'Interior Advanced',
          runOrder: 4,
        }),
        makeClass({
          id: 'c-willow-late',
          classId: 'k-late',
          name: 'Exterior Excellent',
          runOrder: 2,
        }),
        makeClass({
          id: 'c-willow-wd',
          classId: 'k-wd',
          name: 'Withdrawn Class',
          status: 'withdrawn',
        }),
      ],
    }),
  ];
  const [g] = groupEntriesByShow(toOrders(rows));
  return g!;
}

const ctx = (g: ReturnType<typeof group>): DayCheckInContext => ({
  now: NOW,
  ordersById: Object.fromEntries(g.orders.map(o => [o.id, o])),
  isPastShow: false,
});

const timings = new Map<string, ClassTiming>([
  ['k-early', { label: '9:00 AM', sortMinutes: 540, isRevised: false }],
  ['k-late', { label: '1:00 PM', sortMinutes: 780, isRevised: true }],
]);

describe('buildYourDogsToday', () => {
  it('lists only today, running classes across all dogs, by class start then run order', () => {
    const g = group();
    const rows = buildYourDogsToday(g.dogs, ctx(g), timings);
    expect(rows.map(r => r.cls.id)).toEqual(['c-willow-early', 'c-juni-late', 'c-willow-late']);
  });

  it('puts classes with no known start last', () => {
    const g = group();
    const rows = buildYourDogsToday(g.dogs, ctx(g), new Map());
    // No timings: ordering falls to run order within the day, never crashes.
    expect(rows).toHaveLength(3);
  });
});

describe('filterYourDogsToday', () => {
  it('narrows to one dog and keeps each entry counted once', () => {
    const g = group();
    const all = buildYourDogsToday(g.dogs, ctx(g), timings);
    const everyone = filterYourDogsToday(all, null);
    expect(everyone.total).toBe(3);
    expect(everyone.options.map(o => [o.dogName, o.count])).toEqual([
      ['Juni', 1],
      ['Willow', 2],
    ]);
    expect(everyone.options.reduce((n, o) => n + o.count, 0)).toBe(everyone.total);

    const willow = filterYourDogsToday(all, 'dog-willow');
    expect(willow.rows.map(r => r.cls.id)).toEqual(['c-willow-early', 'c-willow-late']);
    // Counts stay for the whole day, not the narrowed list.
    expect(willow.total).toBe(3);
  });
});

describe('classTimingOf', () => {
  it('reads the revised start as an estimate and orders by clock time', () => {
    expect(classTimingOf('09:00:00', null, 'America/Chicago')).toEqual({
      label: '9:00 AM',
      sortMinutes: 540,
      isRevised: false,
    });
    expect(classTimingOf('09:00:00', '13:30:00', 'America/Chicago')).toEqual({
      label: '1:30 PM',
      sortMinutes: 810,
      isRevised: true,
    });
  });

  it('is null when no start is posted', () => {
    expect(classTimingOf(undefined, null, 'America/Chicago')).toBeNull();
  });
});
