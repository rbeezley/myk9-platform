import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  buildEntryBalanceRecoveryHref,
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceSource,
} from './entryBalanceSummary';
import {
  DEFAULT_SHOW_TIMEZONE,
  formatEntryCloseDeadline,
  formatShowWithEntryCloseDeadline,
} from './entryCloseDeadline';

function entry(overrides: Partial<EntryBalanceSource>): EntryBalanceSource {
  return {
    id: 'entry-1',
    showId: 'show-1',
    showName: 'Spring Trial',
    showDate: new Date(2026, 5, 10),
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'online',
    totalFee: 25,
    ...overrides,
  };
}

const now = new Date(2026, 5, 1);

describe('summarizeEntryBalances', () => {
  it('sums current accepted and pending-review fees into the same amount due My Shows displays', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'accepted-online', totalFee: 25 }),
        entry({
          id: 'pending-online',
          entryStatus: EntryStatus.PENDING,
          totalFee: 30,
        }),
        entry({
          id: 'paid-online',
          paymentStatus: PaymentStatus.PAID_ONLINE,
          totalFee: 10,
        }),
        entry({
          id: 'waitlist',
          entryStatus: EntryStatus.WAITLIST,
          totalFee: 40,
        }),
        entry({
          id: 'past-unpaid',
          showDate: new Date(2026, 4, 1),
          showEndDate: new Date(2026, 4, 2),
          totalFee: 50,
        }),
      ],
      now
    );

    expect(summary.currentFeesCents).toBe(6500);
    expect(summary.amountDueCents).toBe(5500);
    expect(summary.onlineDueCents).toBe(5500);
  });

  it('keeps pay-at-show balances in amount due without adding them to cart checkout links', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'online', paymentMethod: 'online', totalFee: 25 }),
        entry({ id: 'cash', paymentMethod: 'cash', totalFee: 30 }),
      ],
      now
    );

    expect(summary.amountDueCents).toBe(5500);
    expect(summary.onlineDueCents).toBe(2500);
    expect(summary.payAtShowDueCents).toBe(3000);
    expect(summary.onlineShowBalances).toHaveLength(1);
    expect(summary.onlineShowBalances[0].entryIds).toEqual(['online']);
  });

  it('routes mixed online and pay-at-show balances to My Payments instead of a partial cart', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'online', paymentMethod: 'online', totalFee: 25 }),
        entry({ id: 'cash', paymentMethod: 'cash', totalFee: 30 }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe('/exhibitor/payments?due=1');
  });

  it('builds an exact cart recovery link for one online show', () => {
    const summary = summarizeEntryBalances(
      [
        entry({
          id: 'grouped',
          classes: [{ id: 'entry-a' }, { id: 'entry-b' }],
        }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe(
      '/cart?showId=show-1&entryIds=entry-a%2Centry-b'
    );
  });

  it('sends multi-show balances to My Payments instead of choosing the wrong cart', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'entry-a', showId: 'show-1', showName: 'A Trial' }),
        entry({ id: 'entry-b', showId: 'show-2', showName: 'B Trial' }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe('/exhibitor/payments?due=1');
  });
});

describe('entry-close deadline on the amount-due summary', () => {
  it('reads the close day from the timestamptz UTC parts, never the local ones', () => {
    // Stored as midnight UTC of the typed day. Read through local getters this
    // is Sep 13 in every US zone, which would show the exhibitor a deadline a
    // day earlier than the one the server enforces.
    const source = mapEntryRowToBalanceSource({
      id: 'entry-1',
      entry_fee: 25,
      payment_status: 'pending',
      payment_method: 'online',
      entry_status: 'accepted',
      show: {
        id: 'show-1',
        name: 'Spring Trial',
        start_date: '2026-09-20T00:00:00+00:00',
        entry_close_date: '2026-09-14T00:00:00+00:00',
      },
    });

    expect(source.entryCloseDay).toBe('2026-09-14');
  });

  it('accepts a bare date-only close value unchanged', () => {
    const source = mapEntryRowToBalanceSource({
      id: 'entry-1',
      show: { id: 'show-1', name: 'Spring Trial', entry_close_date: '2026-09-14' },
    });

    expect(source.entryCloseDay).toBe('2026-09-14');
  });

  it('carries the close day onto the per-show balance', () => {
    const summary = summarizeEntryBalances(
      [entry({ id: 'entry-a', entryCloseDay: '2026-06-14' })],
      now
    );

    expect(summary.onlineShowBalances[0].entryCloseDay).toBe('2026-06-14');
  });

  it('reports a null close day for a show that has none', () => {
    const summary = summarizeEntryBalances([entry({ id: 'entry-a' })], now);

    expect(summary.onlineShowBalances[0].entryCloseDay).toBeNull();
  });

  it('keeps a known close day when another row for the same show lacks one', () => {
    // The relation-less row can arrive first (replication fallback rows resolve
    // their show join independently), so first-known-wins must not be
    // last-write-wins.
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'entry-a', entryCloseDay: null }),
        entry({ id: 'entry-b', entryCloseDay: '2026-06-14' }),
      ],
      now
    );

    expect(summary.onlineShowBalances).toHaveLength(1);
    expect(summary.onlineShowBalances[0].entryCloseDay).toBe('2026-06-14');
  });

  it('carries the show timezone from the entry trial onto the balance', () => {
    const source = mapEntryRowToBalanceSource({
      id: 'entry-1',
      show: { id: 'show-1', name: 'Spring Trial', entry_close_date: '2026-09-14T00:00:00+00:00' },
      trial: { timezone: 'America/Chicago' },
    });

    expect(source.showTimezone).toBe('America/Chicago');
    expect(summarizeEntryBalances([entry({ showTimezone: 'America/Chicago' })], now)
      .onlineShowBalances[0].showTimezone).toBe('America/Chicago');
  });

  it('reads the timezone through class -> trial for rows with a null entries.trial_id', () => {
    const source = mapEntryRowToBalanceSource({
      id: 'entry-1',
      show: { id: 'show-1', name: 'Spring Trial' },
      class: { trial: { timezone: 'America/Denver' } },
    });

    expect(source.showTimezone).toBe('America/Denver');
  });

  it('falls back to the server guard default when no trial timezone is known', () => {
    const source = mapEntryRowToBalanceSource({ id: 'entry-1', show: { id: 'show-1' } });

    expect(source.showTimezone).toBe(DEFAULT_SHOW_TIMEZONE);
    expect(summarizeEntryBalances([entry({})], now).onlineShowBalances[0].showTimezone).toBe(
      DEFAULT_SHOW_TIMEZONE
    );
  });

  it("keeps each show's own close day when several shows owe money", () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'entry-a', showId: 'show-1', showName: 'A Trial', entryCloseDay: '2026-06-14' }),
        entry({ id: 'entry-b', showId: 'show-2', showName: 'B Trial', entryCloseDay: '2026-07-02' }),
      ],
      now
    );

    expect(summary.onlineShowBalances.map(s => [s.showName, s.entryCloseDay])).toEqual([
      ['A Trial', '2026-06-14'],
      ['B Trial', '2026-07-02'],
    ]);
  });
});

describe('formatEntryCloseDeadline', () => {
  it('formats an upcoming close day without a year', () => {
    expect(formatEntryCloseDeadline('2026-06-14', now)).toBe('Jun 14');
  });

  it('still states the deadline on the close day itself', () => {
    // Entries are open through the whole of the close day, so today is not past.
    expect(formatEntryCloseDeadline('2026-06-01', now)).toBe('Jun 1');
  });

  it('adds the year when the close day is not in the current year', () => {
    expect(formatEntryCloseDeadline('2027-06-14', now)).toBe('Jun 14, 2027');
  });

  it('says nothing when the show has no close day', () => {
    expect(formatEntryCloseDeadline(null, now)).toBeNull();
    expect(formatEntryCloseDeadline(undefined, now)).toBeNull();
  });

  it('says nothing when the close day has already passed', () => {
    // "pay by May 20" printed on Jun 1 reads as an overdue accusation the app
    // cannot back up. Silence, not a warning.
    expect(formatEntryCloseDeadline('2026-05-20', now)).toBeNull();
  });

  it('says nothing for an unparseable value', () => {
    expect(formatEntryCloseDeadline('not-a-date', now)).toBeNull();
  });

  it('decides "past" in the show timezone, not the viewer\'s', () => {
    // Midnight Sep 15 in New York — still the evening of Sep 14 in Hawaii.
    // The checkout guard has already closed this show, so the card must not
    // still be promising the exhibitor a Sep 14 deadline.
    const justAfterMidnightEastern = new Date('2026-09-15T04:00:00Z');

    expect(
      formatEntryCloseDeadline('2026-09-14', justAfterMidnightEastern, 'America/New_York')
    ).toBeNull();
  });

  it('keeps the deadline while the show timezone is still on the close day', () => {
    // The same instant, for a show that reckons its days in Hawaii: there it
    // is still Sep 14, entries are open, and the deadline stands.
    const justAfterMidnightEastern = new Date('2026-09-15T04:00:00Z');

    expect(
      formatEntryCloseDeadline('2026-09-14', justAfterMidnightEastern, 'Pacific/Honolulu')
    ).toBe('Sep 14');
  });

  it('degrades to a deadline rather than blanking on an unresolvable timezone', () => {
    // getTrialTimezone should never hand us one, but Intl throws on a bad zone
    // and a thrown card is worse than a slightly-off boundary.
    expect(formatEntryCloseDeadline('2026-06-14', now, 'Not/AZone')).toBe('Jun 14');
  });
});

describe('formatShowWithEntryCloseDeadline', () => {
  it('joins the show name and deadline with a hyphen', () => {
    expect(formatShowWithEntryCloseDeadline('Spring Trial', '2026-06-14', now)).toBe(
      'Spring Trial - pay by Jun 14'
    );
  });

  it('falls back to the bare show name with no deadline to state', () => {
    expect(formatShowWithEntryCloseDeadline('Spring Trial', null, now)).toBe('Spring Trial');
    expect(formatShowWithEntryCloseDeadline('Spring Trial', '2026-05-20', now)).toBe(
      'Spring Trial'
    );
  });
});
