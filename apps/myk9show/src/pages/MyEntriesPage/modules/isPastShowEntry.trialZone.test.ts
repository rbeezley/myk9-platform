import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';
import { onlineLedgerFor } from '@/test/fixtures/myShowsFixtures';
import {
  isCurrentSummaryEntry,
  mapEntryRowToBalanceSource,
  type EntryBalanceSource,
} from '@/features/payments/entryBalanceSummary';
import { summarizeEntryBalances } from '@/features/payments/entryBalanceSummary';
import { deriveEntryNextAction } from './entryNextAction';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { deriveMyEntryCardState } from './myEntryCardState';
import { countUpcomingClassesByDog, isPastShowEntry } from './myEntriesStats.helpers';
import { getContextualStatusMessage } from './myEntriesUtils';
import { derivePaidStrip } from './paidStripSeen';
import { deriveShowMoneyState } from './showMoneyState';
import type { EntryClass, MyEntry } from './my-entries-types';

/**
 * MYK9-1607: every "is the show over?" caller reckons in the trial's zone.
 *
 * The show's last day is Jun 10. The clocks are built from the DEVICE's local
 * time so the old device-local rule says "past" on any machine timezone:
 * DEVICE_AHEAD is 00:30 local on Jun 11. The trial zone is UTC-12
 * (Etc/GMT+12), which is still on Jun 10 for any device offset between
 * UTC-11 and UTC+12, so the trial-zone rule says "not past". ZONE_ROLLED is
 * Jun 13 local, past in UTC-12 too for every real device offset.
 */
const LAST_DAY = new Date(2026, 5, 10);
const DEVICE_AHEAD = new Date(2026, 5, 11, 0, 30);
const ZONE_ROLLED = new Date(2026, 5, 13, 0, 30);
const TRIAL_ZONE = 'Etc/GMT+12';
// UTC+14: already past Jun 10 whenever DEVICE_AHEAD happens.
const FAR_EAST_ZONE = 'Etc/GMT-14';
const PAID_AT = new Date('2026-06-09T10:00:00Z');

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return withFixtureKind({
    id: 'c1',
    entryStatus: EntryStatus.ACCEPTED,
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 45,
    status: 'entered',
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: null,
    trialTimezone: TRIAL_ZONE,
    trialDate: LAST_DAY,
    ...overrides,
  });
}

function makeRow(overrides: Partial<MyEntry> = {}): MyEntry {
  const { classes = [makeClass()], ...rest } = overrides;
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Aloha Classic',
    showDate: LAST_DAY,
    showEndDate: LAST_DAY,
    location: { venue: 'Expo Hall', city: 'Honolulu', state: 'HI' },
    dogName: 'Rex',
    dogId: 'd1',
    classes,
    dogs: [],
    totalFee: 45,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'online',
    submittedAt: PAID_AT,
    lastUpdated: PAID_AT,
    ...rest,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isPastShowEntry', () => {
  it('is not past while the last day is still running in the trial zone', () => {
    expect(isPastShowEntry(makeRow(), DEVICE_AHEAD)).toBe(false);
  });

  it('is past once the trial zone rolls over', () => {
    expect(isPastShowEntry(makeRow(), ZONE_ROLLED)).toBe(true);
  });

  it('with no trial zone waits until every zone agrees (UTC-12)', () => {
    const noZone = makeRow({ classes: [makeClass({ trialTimezone: undefined })] });
    expect(isPastShowEntry(noZone, DEVICE_AHEAD)).toBe(false);
    expect(isPastShowEntry(noZone, ZONE_ROLLED)).toBe(true);
  });

  it('never calls an undated show past', () => {
    expect(isPastShowEntry({ showDate: undefined, showEndDate: undefined }, ZONE_ROLLED)).toBe(
      false
    );
  });
});

describe('callers agree with the trial-zone rule near device midnight', () => {
  it('entryNextAction still offers finish-payment', () => {
    expect(deriveEntryNextAction(makeRow(), { now: DEVICE_AHEAD })).toEqual({
      kind: 'finish-payment',
    });
    expect(deriveEntryNextAction(makeRow(), { now: ZONE_ROLLED })).toEqual({ kind: 'view-show' });
  });

  it('myEntryCardState keeps the pay link and the not-past flag', () => {
    const [order] = groupEntriesByOrder([makeRow()], DEVICE_AHEAD);
    const live = deriveMyEntryCardState(order, DEVICE_AHEAD);
    expect(live.isPastShow).toBe(false);
    expect(live.paymentHref).not.toBeNull();
    const over = deriveMyEntryCardState(order, ZONE_ROLLED);
    expect(over.isPastShow).toBe(true);
    expect(over.paymentHref).toBeNull();
  });

  it('myEntriesUtils status copy keeps "still to run" while the zone is on the last day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEVICE_AHEAD);
    const entry = {
      showDate: LAST_DAY,
      showEndDate: LAST_DAY,
      entryStatus: EntryStatus.ACCEPTED,
      entryStatusKind: 'completed' as const,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      submittedAt: PAID_AT,
      lastUpdated: PAID_AT,
      classes: [
        makeClass({ id: 'c1', isScored: true, status: 'completed' }),
        makeClass({ id: 'c2' }),
      ],
    };
    const message = () =>
      getContextualStatusMessage(
        entry,
        () => 'x',
        () => 'x',
        () => false,
        () => false,
        () => 1
      ).message;
    expect(message()).toMatch(/still to run|In ring/);
    vi.setSystemTime(ZONE_ROLLED);
    expect(message()).toMatch(/without a result/);
  });

  it('myEntriesStats per-dog upcoming count keeps the dog until the zone rolls over', () => {
    const [order] = groupEntriesByOrder([makeRow()], DEVICE_AHEAD);
    expect(countUpcomingClassesByDog([order], DEVICE_AHEAD)).toEqual({ d1: 1 });
    expect(countUpcomingClassesByDog([order], ZONE_ROLLED)).toEqual({});
  });

  it('paidStripSeen still shows the payment strip until the zone rolls over', () => {
    const paidClass = makeClass({
      paymentStatus: PaymentStatus.PAID_ONLINE,
      paymentMethod: 'online',
    });
    const rows = groupEntriesByOrder(
      [makeRow({ paymentStatus: PaymentStatus.PAID_ONLINE, classes: [paidClass] })],
      DEVICE_AHEAD
    );
    const ledger = onlineLedgerFor(rows);
    expect(derivePaidStrip(rows, DEVICE_AHEAD, () => false, ledger)).not.toBeNull();
    expect(derivePaidStrip(rows, ZONE_ROLLED, () => false, ledger)).toBeNull();
  });

  it('showMoneyState keeps balance-due (Pay now) until the zone rolls over', () => {
    const rows = groupEntriesByOrder([makeRow()], DEVICE_AHEAD);
    const live = deriveShowMoneyState(rows, DEVICE_AHEAD, 'confirmed');
    expect(live.kind).toBe('balance-due');
    expect(live.paymentHref).not.toBeNull();
    const over = deriveShowMoneyState(rows, ZONE_ROLLED, 'confirmed');
    expect(over.kind).toBe('unresolved');
    expect(over.paymentHref).toBeNull();
  });
});

describe('deriveShowMoneyState across orders in different trial zones', () => {
  const eastOrder = makeRow({
    id: 'e-east',
    classes: [makeClass({ id: 'c-east', trialTimezone: FAR_EAST_ZONE })],
  });
  const westOrder = makeRow({
    id: 'e-west',
    registrationId: 'r2',
    dogId: 'd2',
    dogName: 'Bella',
    classes: [makeClass({ id: 'c-west', trialTimezone: TRIAL_ZONE })],
  });

  it.each([
    ['east first', [eastOrder, westOrder]],
    ['west first', [westOrder, eastOrder]],
  ])('keeps Pay now while one zone is still on the last day (%s)', (_label, input) => {
    const orders = groupEntriesByOrder(input, DEVICE_AHEAD);
    expect(orders.length).toBe(2);
    const state = deriveShowMoneyState(orders, DEVICE_AHEAD, 'confirmed');
    expect(state.kind).toBe('balance-due');
    expect(state.paymentHref).not.toBeNull();
  });
});

describe('entryBalanceSummary shares the trial-zone rule', () => {
  function source(overrides: Partial<EntryBalanceSource> = {}): EntryBalanceSource {
    return {
      id: 'entry-1',
      showId: 'show-1',
      showName: 'Aloha Classic',
      showDate: LAST_DAY,
      showEndDate: LAST_DAY,
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'online',
      totalFee: 25,
      showTimezone: TRIAL_ZONE,
      ...overrides,
    };
  }

  it('keeps the row current (and not isPastShow) while the show zone is on the last day', () => {
    expect(isCurrentSummaryEntry(source(), DEVICE_AHEAD)).toBe(true);
    expect(isCurrentSummaryEntry(source(), ZONE_ROLLED)).toBe(false);
    const summary = summarizeEntryBalances([source()], DEVICE_AHEAD);
    expect(summary.kind).toBe('known');
    if (summary.kind === 'known') {
      expect(summary.onlineShowBalances[0].isPastShow).toBe(false);
      expect(summary.onlineShowBalances[0].amountDueCents).toBe(2500);
    }
  });

  it('prefers the order trial zones over the show zone', () => {
    const row = source({ showTimezone: FAR_EAST_ZONE, trialZones: [TRIAL_ZONE] });
    expect(isCurrentSummaryEntry(row, DEVICE_AHEAD)).toBe(true);
    expect(isCurrentSummaryEntry({ ...row, trialZones: undefined }, DEVICE_AHEAD)).toBe(false);
  });

  it.each([
    ['east first', [FAR_EAST_ZONE, TRIAL_ZONE]],
    ['west first', [TRIAL_ZONE, FAR_EAST_ZONE]],
  ])('isPastShow stays false while any row zone is on the last day (%s)', (_label, zones) => {
    const rows = zones.map((zone, i) => source({ id: `entry-${i}`, showTimezone: zone }));
    const summary = summarizeEntryBalances(rows, DEVICE_AHEAD);
    expect(summary.kind).toBe('known');
    if (summary.kind === 'known') {
      expect(summary.onlineShowBalances).toHaveLength(1);
      expect(summary.onlineShowBalances[0].isPastShow).toBe(false);
    }
  });

  it('a raw row uses its own trial zone, not the show primary trial zone', () => {
    const rawRow = {
      id: 'entry-raw',
      show_id: 'show-1',
      entry_status: 'accepted',
      payment_status: 'pending',
      payment_method: 'online',
      entry_fee: 25,
      show: {
        id: 'show-1',
        name: 'Aloha Classic',
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        trials: [
          { id: 't-primary', date: '2026-06-09', timezone: FAR_EAST_ZONE },
          { id: 't-entered', date: '2026-06-10', timezone: TRIAL_ZONE },
        ],
      },
      trial: { id: 't-entered', timezone: TRIAL_ZONE },
    };
    const mapped = mapEntryRowToBalanceSource(rawRow);
    expect(mapped.showTimezone).toBe(FAR_EAST_ZONE);
    expect(mapped.trialZones).toEqual([TRIAL_ZONE]);
    expect(isCurrentSummaryEntry(mapped, DEVICE_AHEAD)).toBe(true);
    const summary = summarizeEntryBalances([mapped], DEVICE_AHEAD);
    if (summary.kind === 'known') {
      expect(summary.onlineShowBalances[0].isPastShow).toBe(false);
    }
  });

  it('with no zone at all uses the UTC-12 fallback', () => {
    const row = source({ showTimezone: undefined });
    expect(isCurrentSummaryEntry(row, DEVICE_AHEAD)).toBe(true);
    expect(isCurrentSummaryEntry(row, ZONE_ROLLED)).toBe(false);
  });

  it('leaves the balance totals unchanged away from the boundary', () => {
    const summary = summarizeEntryBalances(
      [source({ totalFee: 25 }), source({ id: 'entry-2', totalFee: 30 })],
      new Date(2026, 5, 1, 12)
    );
    expect(summary.kind).toBe('known');
    if (summary.kind === 'known') {
      expect(summary.onlineShowBalances[0].amountDueCents).toBe(5500);
    }
  });
});
