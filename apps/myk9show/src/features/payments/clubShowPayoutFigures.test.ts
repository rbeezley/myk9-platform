import { describe, expect, it } from 'vitest';
import { toClubShowPayoutFigures, type ClubShowPayoutFiguresRow } from './clubShowPayoutFigures';
import {
  calculateShowPayoutCents,
  sumOnlineCollectedCents,
  sumRefundedCents,
  type LedgerEntryRow,
} from './payoutLedger';

function row(overrides: Partial<ClubShowPayoutFiguresRow> = {}): ClubShowPayoutFiguresRow {
  return {
    show_id: 'show-1',
    show_name: 'Spring Trial',
    show_end_date: '2026-11-01',
    show_deleted: false,
    collected_cents: 5000,
    refunded_cents: 0,
    owed_cents: 5000,
    payout_id: null,
    payout_status: null,
    payout_amount_cents: null,
    payout_failure_reason: null,
    payout_completed_at: null,
    payout_created_at: null,
    paid_cents: 0,
    ...overrides,
  };
}

describe('toClubShowPayoutFigures', () => {
  it('a fully refunded show closed at $0 has no sent payment and reads fully refunded', () => {
    const figures = toClubShowPayoutFigures(
      row({
        collected_cents: 4000,
        refunded_cents: 4000,
        owed_cents: 0,
        payout_id: 'payout-0',
        payout_status: 'completed',
        payout_amount_cents: 0,
        payout_completed_at: '2026-11-05T10:00:00Z',
        payout_created_at: '2026-11-04T10:00:00Z',
        paid_cents: 0,
      })
    );
    expect(figures.paid).toEqual({ kind: 'none' });
    expect(figures.fullyRefunded).toBe(true);
  });

  it('a completed payout above $0 is sent, with its amount', () => {
    const figures = toClubShowPayoutFigures(
      row({
        payout_id: 'payout-1',
        payout_status: 'completed',
        payout_amount_cents: 5000,
        payout_completed_at: '2026-11-05T10:00:00Z',
        payout_created_at: '2026-11-04T10:00:00Z',
        paid_cents: 5000,
      })
    );
    expect(figures.paid).toEqual({ kind: 'sent', cents: 5000 });
    expect(figures.fullyRefunded).toBe(false);
    expect(figures.payout).toEqual({
      id: 'payout-1',
      status: 'completed',
      amountCents: 5000,
      failureReason: null,
      completedAt: '2026-11-05T10:00:00Z',
      createdAt: '2026-11-04T10:00:00Z',
    });
  });

  it('a processing payout is in flight, not sent', () => {
    const figures = toClubShowPayoutFigures(
      row({ payout_id: 'payout-2', payout_status: 'processing', payout_amount_cents: 3000 })
    );
    expect(figures.paid).toEqual({ kind: 'in-flight', cents: 3000 });
  });

  it.each(['pending', 'awaiting_approval', 'approved', 'held', 'failed'])(
    'a %s payout has paid nothing',
    status => {
      const figures = toClubShowPayoutFigures(
        row({ payout_id: 'payout-3', payout_status: status, payout_amount_cents: 3000 })
      );
      expect(figures.paid).toEqual({ kind: 'none' });
    }
  );

  it('a show with no payout row has payout null and paid none', () => {
    const figures = toClubShowPayoutFigures(row());
    expect(figures.payout).toBeNull();
    expect(figures.paid).toEqual({ kind: 'none' });
    expect(figures.fullyRefunded).toBe(false);
  });

  it('a show with nothing refunded and nothing owed is not fully refunded', () => {
    const figures = toClubShowPayoutFigures(
      row({ collected_cents: 0, refunded_cents: 0, owed_cents: 0 })
    );
    expect(figures.fullyRefunded).toBe(false);
  });

  it('keeps a soft-deleted show and its identity', () => {
    const figures = toClubShowPayoutFigures(row({ show_deleted: true }));
    expect(figures).toMatchObject({
      showId: 'show-1',
      showName: 'Spring Trial',
      showEndDate: '2026-11-01',
      showDeleted: true,
    });
  });

  it('an unknown payout status is kept as unknown and pays nothing', () => {
    const figures = toClubShowPayoutFigures(
      row({ payout_id: 'payout-4', payout_status: 'reversed', payout_amount_cents: 3000 })
    );
    expect(figures.payout?.status).toBe('unknown');
    expect(figures.paid).toEqual({ kind: 'none' });
  });
});

/**
 * The "agrees with the owner's ledger" proof on the client side.
 *
 * These entries are the fixture of supabase/tests/myk9_2454_club_show_payout_figures_test.sql,
 * which asserts club_show_payout_figures returns the cents below for them. Here the owner
 * ledger's own functions (payoutLedger.ts) are run on the same entries and must produce the
 * same cents, and the mapper must carry them through unchanged. Change the three together.
 */
function entry(overrides: Partial<LedgerEntryRow> & Pick<LedgerEntryRow, 'id'>): LedgerEntryRow {
  return {
    show_id: 'show-1',
    entry_status: 'confirmed',
    entry_fee: 0,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
    ...overrides,
  };
}

const SQL_FIXTURE_SHOWS: Array<{
  name: string;
  entries: LedgerEntryRow[];
  server: { collected: number; refunded: number; owed: number };
}> = [
  {
    name: 'a partial refund',
    entries: [entry({ id: 'e1', entry_fee: 50, payment_status: 'refunded', refund_amount: 20 })],
    server: { collected: 5000, refunded: 2000, owed: 3000 },
  },
  {
    name: 'a refund larger than the fee',
    entries: [entry({ id: 'e2', entry_fee: 25, payment_status: 'refunded', refund_amount: 30 })],
    server: { collected: 2500, refunded: 3000, owed: 0 },
  },
  {
    name: 'a fully refunded show',
    entries: [entry({ id: 'e3', entry_fee: 40, payment_status: 'refunded', refund_amount: 40 })],
    server: { collected: 4000, refunded: 4000, owed: 0 },
  },
  {
    name: 'online money beside cash and check',
    entries: [
      entry({ id: 'e4', entry_fee: 50 }),
      entry({ id: 'e5', entry_fee: 25, payment_method: 'cash' }),
      entry({ id: 'e6', entry_fee: 15, payment_method: 'check' }),
    ],
    server: { collected: 5000, refunded: 0, owed: 5000 },
  },
];

describe('club figures agree with the owner payout ledger', () => {
  it.each(SQL_FIXTURE_SHOWS)('$name', ({ entries, server }) => {
    expect({
      collected: sumOnlineCollectedCents(entries),
      refunded: sumRefundedCents(entries),
      owed: calculateShowPayoutCents(entries),
    }).toEqual(server);

    const figures = toClubShowPayoutFigures(
      row({
        collected_cents: server.collected,
        refunded_cents: server.refunded,
        owed_cents: server.owed,
      })
    );
    expect({
      collected: figures.collectedCents,
      refunded: figures.refundedCents,
      owed: figures.owedCents,
    }).toEqual(server);
  });
});
