import { describe, it, expect } from 'vitest';
import { deriveEntryNextAction } from './entryNextAction';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, EntryClass } from './my-entries-types';

const NOW = new Date('2026-09-01T12:00:00Z');

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  const { dogs, ...rest } = overrides;
  const base = {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-15'),
    location: { venue: 'Test Venue', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [],
    totalFee: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01'),
    lastUpdated: new Date('2026-08-15'),
    ...rest,
  };
  return {
    ...base,
    dogs: dogs ?? [
      {
        id: base.id,
        dogId: base.dogId,
        dogName: base.dogName,
        armband: base.armband,
        classes: base.classes,
        entryStatus: base.entryStatus,
      },
    ],
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

describe('deriveEntryNextAction', () => {
  it('returns finish-payment for an unpaid entry with an actionable online balance', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'online',
      totalFee: 30,
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'finish-payment' });
  });

  it('returns check-in for a paid entry with a check-in-eligible class, over view-show', () => {
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({
      kind: 'check-in',
      classId: 'entry-1',
    });
  });

  it('returns view-show for a paid entry with no check-in-eligible class (all scored)', () => {
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: true })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
  });

  it('returns view-show for a paid entry whose only class has self-check-in disabled', () => {
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
    });

    expect(
      deriveEntryNextAction(entry, { now: NOW, selfCheckinByClassId: { 'class-1': false } })
    ).toEqual({ kind: 'view-show' });
  });

  it('returns view-show for a past entry even with an unscored class', () => {
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      showDate: new Date('2020-01-01'),
      showEndDate: new Date('2020-01-02'),
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
  });

  it('prefers finish-payment over check-in when both are eligible', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'online',
      totalFee: 30,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'finish-payment' });
  });

  it('returns view-show for a waitlisted unpaid entry (pays on promotion, no debt CTA)', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.WAITLIST,
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 30,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: true })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
  });

  it.each([
    EntryStatus.REJECTED,
    EntryStatus.WAITLIST,
    EntryStatus.CANCELLED,
    EntryStatus.SCRATCHED,
    EntryStatus.MOVED,
    EntryStatus.COMPLETED,
    EntryStatus.PENDING,
    EntryStatus.MISSING_INFO,
    EntryStatus.MOVE_UP_REQUESTED,
  ])('never offers check-in for a non-accepted entry (%s) with an unscored class', status => {
    const entry = makeEntry({
      entryStatus: status,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
  });

  it.each(['scratched', 'moved', 'absent'] as const)(
    'never offers check-in for a class whose status is %s',
    clsStatus => {
      const entry = makeEntry({
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [
          makeClass({ id: 'entry-1', classId: 'class-1', isScored: false, status: clsStatus }),
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
    }
  );

  it('defaults a missing class id to check-in eligible', () => {
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [makeClass({ id: 'entry-1', classId: undefined, isScored: false })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({
      kind: 'check-in',
      classId: 'entry-1',
    });
  });

  it('treats an all-completed order as still payment-eligible when the fee is unpaid', () => {
    // A class scored mid-show is COMPLETED, but an unpaid fee is still real —
    // isCurrentSummaryEntry (the canonical amount-due selector) already
    // counts COMPLETED as eligible, so this must too or the dashboard total
    // disagrees with every card being unable to offer Finish Payment.
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'online',
      totalFee: 40,
      classes: [makeClass({ id: 'c1', entryStatus: EntryStatus.COMPLETED, isScored: true })],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'finish-payment' });
  });

  it('never offers check-in for an unresolved placeholder row, even without a class id', () => {
    // A class row whose join hasn't replicated yet (see useMyEntriesData) —
    // its money is real but its class identity isn't, so it must not expose
    // a check-in action just because `classId` happens to be missing too.
    const entry = makeEntry({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [
        makeClass({ id: 'entry-1', classId: undefined, unresolved: true, isScored: false }),
      ],
    });

    expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
  });

  describe('mixed-status orders (accepted dog + pending dog on one order)', () => {
    it('offers check-in for the accepted dog A class, never the pending dog B class', () => {
      const classA = makeClass({ id: 'a-1', classId: 'class-a', isScored: false });
      const classB = makeClass({ id: 'b-1', classId: 'class-b', isScored: false });
      const entry = makeEntry({
        // Dominant status across dogs — A is accepted, so the order reads accepted.
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [classA, classB],
        dogs: [
          {
            id: 'a-1',
            dogId: 'dog-a',
            dogName: 'Dog A',
            classes: [classA],
            entryStatus: EntryStatus.ACCEPTED,
          },
          {
            id: 'b-1',
            dogId: 'dog-b',
            dogName: 'Dog B',
            classes: [classB],
            entryStatus: EntryStatus.PENDING,
          },
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({
        kind: 'check-in',
        classId: 'a-1',
      });
    });

    it('falls back to view-show when only the pending dog B has an unscored class', () => {
      const classA = makeClass({ id: 'a-1', classId: 'class-a', isScored: true });
      const classB = makeClass({ id: 'b-1', classId: 'class-b', isScored: false });
      const entry = makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [classA, classB],
        dogs: [
          {
            id: 'a-1',
            dogId: 'dog-a',
            dogName: 'Dog A',
            classes: [classA],
            entryStatus: EntryStatus.ACCEPTED,
          },
          {
            id: 'b-1',
            dogId: 'dog-b',
            dogName: 'Dog B',
            classes: [classB],
            entryStatus: EntryStatus.PENDING,
          },
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'view-show' });
    });

    it('offers check-in when a completed dog shares an order with an accepted dog', () => {
      const completedClass = makeClass({
        id: 'completed-1',
        entryStatus: EntryStatus.COMPLETED,
        classId: 'class-completed',
        isScored: true,
      });
      const acceptedClass = makeClass({
        id: 'accepted-1',
        entryStatus: EntryStatus.ACCEPTED,
        classId: 'class-accepted',
        isScored: false,
      });
      const entry = makeEntry({
        // COMPLETED is the dominant order status, but the accepted dog still
        // owns a live class that can be checked in.
        entryStatus: EntryStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [completedClass, acceptedClass],
        dogs: [
          {
            id: 'completed-1',
            dogId: 'dog-completed',
            dogName: 'Completed Dog',
            classes: [completedClass],
            entryStatus: EntryStatus.COMPLETED,
          },
          {
            id: 'accepted-1',
            dogId: 'dog-accepted',
            dogName: 'Accepted Dog',
            classes: [acceptedClass],
            entryStatus: EntryStatus.ACCEPTED,
          },
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({
        kind: 'check-in',
        classId: 'accepted-1',
      });
    });

    it('offers check-in for an accepted class when the same dog also has a completed class', () => {
      const completedClass = makeClass({
        id: 'completed-1',
        entryStatus: EntryStatus.COMPLETED,
        classId: 'class-completed',
        isScored: true,
      });
      const acceptedClass = makeClass({
        id: 'accepted-1',
        entryStatus: EntryStatus.ACCEPTED,
        classId: 'class-accepted',
        isScored: false,
      });
      const entry = makeEntry({
        entryStatus: EntryStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [completedClass, acceptedClass],
        dogs: [
          {
            id: 'completed-1',
            dogId: 'dog-1',
            dogName: 'Mixed Status Dog',
            classes: [completedClass, acceptedClass],
            entryStatus: EntryStatus.COMPLETED,
          },
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({
        kind: 'check-in',
        classId: 'accepted-1',
      });
    });

    it('prefers payment when a completed order still contains an accepted unpaid class', () => {
      const completedClass = makeClass({
        id: 'completed-1',
        entryStatus: EntryStatus.COMPLETED,
        classId: 'class-completed',
        isScored: true,
      });
      const acceptedClass = makeClass({
        id: 'accepted-1',
        entryStatus: EntryStatus.ACCEPTED,
        classId: 'class-accepted',
        isScored: false,
      });
      const entry = makeEntry({
        entryStatus: EntryStatus.COMPLETED,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
        totalFee: 50,
        classes: [completedClass, acceptedClass],
        dogs: [
          {
            id: 'completed-1',
            dogId: 'dog-completed',
            dogName: 'Completed Dog',
            classes: [completedClass],
            entryStatus: EntryStatus.COMPLETED,
          },
          {
            id: 'accepted-1',
            dogId: 'dog-accepted',
            dogName: 'Accepted Dog',
            classes: [acceptedClass],
            entryStatus: EntryStatus.ACCEPTED,
          },
        ],
      });

      expect(deriveEntryNextAction(entry, { now: NOW })).toEqual({ kind: 'finish-payment' });
    });
  });
});
