import { describe, expect, it } from 'vitest';
import { calculateWhatIsLeft } from '@/features/show-closeout/whatIsLeft';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import {
  findExpiredOffers,
  findHeldEntries,
  findOpenWaitlistSpots,
  findRefundsToDecide,
  type WaitlistSpotClass,
  type WaitlistSpotEntry,
} from '..';

describe('findRefundsToDecide', () => {
  const entries: ShowDayReconciliationEntry[] = [
    { id: 'pulled-paid', entry_status: 'scratched', payment_status: 'paid', entry_fee: 25 },
    { id: 'pulled-refunded', entry_status: 'scratched', payment_status: 'refunded' },
    {
      id: 'withdrawn-paid',
      entry_status: 'withdrawn',
      payment_status: 'paid',
      withdrawal_reason_code: 'in_season',
    },
    { id: 'removed-paid', entry_status: 'withdrawn', payment_status: 'PAID' },
    { id: 'pulled-unpaid', entry_status: 'scratched', payment_status: 'pending' },
    { id: 'running-paid', entry_status: 'confirmed', payment_status: 'paid' },
  ];

  it('counts paid pulls and removals, with the rows it counted', () => {
    const list = findRefundsToDecide(entries);
    expect(list.rows.map(row => row.entry.id)).toEqual([
      'pulled-paid',
      'withdrawn-paid',
      'removed-paid',
    ]);
    expect(list.rows.map(row => row.removal)).toEqual(['pulled', 'withdrawn', 'removed']);
    expect(list.count).toBe(list.rows.length);
  });

  it("equals Finish the show's refund line on the same fixture", () => {
    const left = calculateWhatIsLeft({
      classes: [],
      trials: [],
      entries,
      incidents: null,
      submissions: null,
    });
    const line = left.lines.find(candidate => candidate.kind === 'refund-review');
    expect(findRefundsToDecide(entries).count).toBe(3);
    expect(line?.count).toBe(findRefundsToDecide(entries).count);
    expect(left.refundReview.count).toBe(findRefundsToDecide(entries).count);
  });

  it('is empty when nothing is waiting', () => {
    expect(findRefundsToDecide([])).toEqual({ count: 0, rows: [] });
  });
});

describe('findHeldEntries', () => {
  const dog = {
    id: 'd1',
    name: 'Scout',
    callName: 'Scout',
    breed: 'Beagle',
    registrations: [],
  } as unknown as Dog;
  function entry(id: string, dogId: string, held: boolean): EntryManagementEntry {
    return {
      id,
      registrationId: `reg-${id}`,
      entryNumber: id,
      showId: 'show-1',
      dogId,
      dogName: dogId,
      ownerName: 'Owner',
      ownerEmail: '',
      handlerName: 'Handler',
      classes: [
        {
          id,
          classId: 'c1',
          name: 'Novice',
          number: '1',
          fee: 25,
          status: 'entered',
          trialId: 't1',
        },
      ],
      totalFee: 25,
      paidAmount: 0,
      entryStatus: EntryStatus.ACCEPTED,
      rawEntryStatus: 'confirmed',
      paymentStatus: PaymentStatus.PENDING,
      submittedAt: new Date(2026, 6, 1),
      lastUpdated: new Date(2026, 6, 1),
      awaitingRegistrationNumber: held,
    };
  }

  it('counts the entries the server holds, rows included', () => {
    const list = findHeldEntries({
      entries: [entry('a', 'd1', true), entry('b', 'd2', false), entry('c', 'd3', true)],
      trials: [{ id: 't1', registry_id: 'AKC' }],
      dogs: [dog],
    });
    expect(list.rows.map(row => row.entry.id)).toEqual(['a', 'c']);
    expect(list.count).toBe(2);
  });

  it('is empty when no entry is held', () => {
    expect(
      findHeldEntries({ entries: [entry('b', 'd2', false)], trials: [{ id: 't1' }], dogs: [] })
    ).toEqual({ count: 0, rows: [] });
  });
});

const cls = (over: Partial<WaitlistSpotClass> = {}): WaitlistSpotClass => ({
  id: 'c1',
  name: 'Container Novice A',
  maxEntries: null,
  seatHoldingCount: 5,
  ...over,
});
const wl = (id: string, over: Partial<WaitlistSpotEntry> = {}): WaitlistSpotEntry => ({
  id,
  classId: 'c1',
  dogId: `dog-${id}`,
  status: 'waiting',
  position: Number(id.replace(/\D/g, '')) || 1,
  ...over,
});
const day = (over: Partial<JudgeDayCapacity> = {}): JudgeDayCapacity => ({
  judgeId: 'j1',
  judgeName: 'Pat Donovan',
  showDate: '2026-11-16',
  capacity: 10,
  confirmedCount: 5,
  waitlistCount: 2,
  mailInReserved: 0,
  availableSpots: 5,
  classIds: ['c1'],
  classNames: ['Container Novice A'],
  ...over,
});

describe('findOpenWaitlistSpots', () => {
  it('opens a spot when both limits have room and names who is next', () => {
    const result = findOpenWaitlistSpots({
      classes: [cls({ maxEntries: 8 })],
      waitlist: [wl('w2'), wl('w1')],
      judgeDays: [day()],
    });
    expect(result.count).toBe(1);
    expect(result.rows[0]).toMatchObject({ classId: 'c1', reason: 'open', spotsOpen: 3 });
    expect(result.rows[0]?.nextInLine?.id).toBe('w1');
  });

  it("a class with room whose judge's day is full has no open spot, and says so", () => {
    const result = findOpenWaitlistSpots({
      classes: [cls({ maxEntries: 20 })],
      waitlist: [wl('w1')],
      judgeDays: [day({ confirmedCount: 10, availableSpots: 0 })],
    });
    expect(result.count).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.classes[0]?.reason).toBe('judge-day-full');
    expect(result.classes[0]?.explanation).toBe(
      "Container Novice A has room, but Pat Donovan's Monday is full."
    );
  });

  it("a full class with a judge's day that has room is class-full", () => {
    const result = findOpenWaitlistSpots({
      classes: [cls({ maxEntries: 5, seatHoldingCount: 5 })],
      waitlist: [wl('w1')],
      judgeDays: [day()],
    });
    expect(result.count).toBe(0);
    expect(result.classes[0]?.reason).toBe('class-full');
  });

  it('one spot with one open offer leaves nothing to offer', () => {
    // The offer's pending-payment entry already holds the seat (6 of 6), so the class is at its limit.
    const result = findOpenWaitlistSpots({
      classes: [cls({ maxEntries: 6, seatHoldingCount: 6 })],
      waitlist: [wl('w1', { status: 'offered' }), wl('w2')],
      judgeDays: [day({ confirmedCount: 6, availableSpots: 4 })],
    });
    expect(result.count).toBe(0);
    expect(result.classes[0]?.reason).toBe('offers-cover-spots');
    expect(result.classes[0]?.openOffers).toHaveLength(1);
  });

  it('skips a dog that already has an open offer when naming next in line', () => {
    const result = findOpenWaitlistSpots({
      classes: [cls()],
      waitlist: [
        wl('w1', { status: 'offered', dogId: 'scout' }),
        wl('w2', { dogId: 'scout' }),
        wl('w3', { dogId: 'rex' }),
      ],
      judgeDays: [day()],
    });
    expect(result.rows[0]?.nextInLine?.dogId).toBe('rex');
  });

  it('does not claim a spot while the server judge-day answer is unavailable', () => {
    const result = findOpenWaitlistSpots({
      classes: [cls()],
      waitlist: [wl('w1')],
      judgeDays: null,
    });
    expect(result.count).toBe(0);
    expect(result.classes[0]?.reason).toBe('judge-day-unknown');
  });

  it('a class with no judge-day and no limit is open, and a class with nobody waiting is left out', () => {
    const result = findOpenWaitlistSpots({
      classes: [cls(), cls({ id: 'c2', name: 'Empty' })],
      waitlist: [wl('w1')],
      judgeDays: [],
    });
    expect(result.rows.map(row => row.classId)).toEqual(['c1']);
    expect(result.classes.map(state => state.classId)).toEqual(['c1']);
  });
});

describe('findExpiredOffers', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const past = '2026-11-13T12:00:00Z';
  const future = '2026-11-15T12:00:00Z';

  it('counts closed expired offers and lapsed open ones, while a dog waits for the spot', () => {
    const list = findExpiredOffers({
      now,
      waitlist: [
        wl('w1', { status: 'expired' }),
        wl('w2', { status: 'offered', offerExpiresAt: past, dogId: 'a' }),
        wl('w3', { status: 'offered', offerExpiresAt: future, dogId: 'b' }),
        wl('w4', { status: 'offered', offerExpiresAt: past, joinedVia: 'mail_in', dogId: 'c' }),
        wl('w5', { dogId: 'd' }),
      ],
    });
    expect(list.rows.map(row => [row.offer.id, row.closed])).toEqual([
      ['w1', true],
      ['w2', false],
    ]);
    expect(list.count).toBe(2);
  });

  it('does not count an expired offer in a class where nobody is waiting', () => {
    expect(findExpiredOffers({ now, waitlist: [wl('w1', { status: 'expired' })] })).toEqual({
      count: 0,
      rows: [],
    });
  });
});
