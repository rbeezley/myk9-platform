import { describe, it, expect } from 'vitest';
import { deriveEntryNextAction } from './entryNextAction';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, EntryClass } from './my-entries-types';

const NOW = new Date('2026-09-01T12:00:00Z');

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
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
    ...overrides,
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
});
