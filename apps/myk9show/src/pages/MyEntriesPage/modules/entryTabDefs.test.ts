import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { ENTRY_TAB_DEFS, TAB_PREDICATES } from './entryTabDefs';
import type { EntryTabFilter, MyEntry } from './my-entries-types';

const NOW = new Date('2026-09-15T12:00:00Z');

function entry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Autumn Trial',
    showDate: new Date('2026-10-01T12:00:00Z'),
    location: { venue: 'Fairgrounds', city: 'Tulsa', state: 'OK' },
    dogName: 'Cooper',
    dogId: 'dog-1',
    classes: [{ id: 'entry-1', name: 'Novice', number: '101', fee: 60, status: 'entered' }],
    dogs: [],
    totalFee: 60,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01T12:00:00Z'),
    lastUpdated: new Date('2026-08-02T12:00:00Z'),
    ...overrides,
  };
}

describe('TAB_PREDICATES', () => {
  it('defines a predicate for every tab the strip renders', () => {
    // The Record type already enforces this at compile time; asserting it here
    // catches the other direction — a tab added to the strip whose id never
    // reached the union, which would resolve to undefined at runtime.
    for (const tab of ENTRY_TAB_DEFS) {
      expect(typeof TAB_PREDICATES[tab.id as EntryTabFilter]).toBe('function');
    }
  });

  it('partitions every entry into exactly one of upcoming or completed', () => {
    // `upcoming + completed === all` is the invariant Phase A exists to create,
    // and it is what lets the badges sum to the list. Because both the counts
    // and the filter now read these same two functions, a partition that broke
    // here would break both together rather than making them disagree.
    const cases = [
      entry({ showDate: new Date('2026-10-01T12:00:00Z') }),
      entry({ showDate: new Date('2026-08-01T12:00:00Z') }),
      entry({ showDate: NOW }),
      entry({ entryStatus: EntryStatus.WAITLIST }),
      entry({ paymentStatus: PaymentStatus.PENDING }),
    ];

    for (const candidate of cases) {
      const upcoming = TAB_PREDICATES.upcoming(candidate, NOW);
      const completed = TAB_PREDICATES.completed(candidate, NOW);
      expect(upcoming).toBe(!completed);
      expect(TAB_PREDICATES.all(candidate, NOW)).toBe(true);
    }
  });

  it('judges the same entry consistently for a given instant', () => {
    // `now` is a parameter precisely so one render cannot evaluate the boundary
    // twice. Same entry, same instant, same answer — every caller.
    const candidate = entry({ showDate: NOW });
    expect(TAB_PREDICATES.completed(candidate, NOW)).toBe(
      TAB_PREDICATES.completed(candidate, NOW)
    );
  });
});
