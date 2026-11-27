/**
 * Test fixtures: one club_show_payout_figures row, mapped the way the app maps it.
 *
 * Tests feed the Payments tab RPC-shaped rows through toClubShowPayoutFigures, never a
 * hand-built ClubShowPayoutFigures, so `paid` and `fullyRefunded` are always the mapper's
 * answer for the row (MYK9-1985).
 */
import {
  toClubShowPayoutFigures,
  type ClubShowPayoutFigures,
  type ClubShowPayoutFiguresRow,
} from './clubShowPayoutFigures';

/** Cedar Valley Classic: $50.00 collected online, nothing refunded, no payout row yet. */
export function payoutFiguresRow(
  overrides: Partial<ClubShowPayoutFiguresRow> = {}
): ClubShowPayoutFiguresRow {
  return {
    show_id: 'show-1',
    show_name: 'Cedar Valley Classic',
    show_end_date: '2026-12-09T00:00:00+00:00',
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

/**
 * The same row with a canonical payout in `status`. A completed payout gets a completion
 * time and, when above $0, its amount as paid_cents, the way the RPC returns it.
 */
export function payoutFiguresRowWith(
  status: string,
  overrides: Partial<ClubShowPayoutFiguresRow> = {}
): ClubShowPayoutFiguresRow {
  const amountCents = overrides.payout_amount_cents ?? 5000;
  const completed = status === 'completed';
  return payoutFiguresRow({
    payout_id: 'payout-1',
    payout_status: status,
    payout_amount_cents: amountCents,
    payout_completed_at: completed ? '2026-12-12T15:00:00Z' : null,
    payout_created_at: '2026-12-12T08:00:00Z',
    paid_cents: completed && amountCents > 0 ? amountCents : 0,
    ...overrides,
  });
}

export function payoutFigures(
  overrides: Partial<ClubShowPayoutFiguresRow> = {}
): ClubShowPayoutFigures {
  return toClubShowPayoutFigures(payoutFiguresRow(overrides));
}

export function payoutFiguresWith(
  status: string,
  overrides: Partial<ClubShowPayoutFiguresRow> = {}
): ClubShowPayoutFigures {
  return toClubShowPayoutFigures(payoutFiguresRowWith(status, overrides));
}
