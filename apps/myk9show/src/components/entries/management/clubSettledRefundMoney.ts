import { dollarsToCents } from '@/features/financial/entryAccounting';
import type { ClubSettledRefundListRow } from '@/services/database/club-settled-refunds';

/** Net the club has paid back, from the loaded ledger rows (payments minus reversals). */
export function netClubRefundedCents(rows: Pick<ClubSettledRefundListRow, 'amount'>[]): number {
  return rows.reduce((sum, row) => sum + dollarsToCents(row.amount), 0);
}

/**
 * What is left to refund: the entry fee, less the discount, the card refund and the club's net
 * payback. Never below zero. The server cap is authoritative; this only prefills
 * and bounds the field.
 */
export function remainingBalanceCents(
  totalFee: number,
  discountAmount: number | null | undefined,
  cardRefundAmount: number | null | undefined,
  clubRefundedCents: number
): number {
  return Math.max(
    0,
    dollarsToCents(totalFee) -
      dollarsToCents(discountAmount ?? 0) -
      dollarsToCents(cardRefundAmount ?? 0) -
      clubRefundedCents
  );
}

export const centsToDollars = (cents: number): string => (cents / 100).toFixed(2);
