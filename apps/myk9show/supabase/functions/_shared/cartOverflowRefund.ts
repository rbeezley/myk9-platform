import { makeWholeRefundCents, type PlatformFeeRates } from './platformFee.ts';

export interface CartOverflowRefundInput {
  paymentIntentId: string | null;
  sessionAmountTotalCents: number | null;
  paidLineIds: string[];
  noServiceLineIds: string[];
  lineAmountsById: Map<string, number>;
  /**
   * The rates this cart was PRICED with (the stamped rates). The flat
   * per-checkout component and the floor are earned once per CHARGE, so they
   * stay with the served lines instead of being split across the overflow —
   * see `makeWholeRefundCents` (MYK9-197 B1).
   */
  platformFeeRates: PlatformFeeRates;
}

export type CartOverflowRefundDecision =
  | { action: 'none'; paidAmountCents: number | null }
  | {
      action: 'refund';
      amountCents: number;
      paidAmountCents: number;
      reason: 'full_make_whole' | 'partial_no_service_lines';
    }
  | { action: 'needs_manual_amount'; missingLineIds: string[]; paidAmountCents: number | null }
  | {
      action: 'cannot_refund';
      reason: 'missing_payment_intent' | 'missing_amount';
      paidAmountCents: number | null;
    };

export function decideCartOverflowRefund(
  input: CartOverflowRefundInput
): CartOverflowRefundDecision {
  if (input.noServiceLineIds.length === 0) {
    return { action: 'none', paidAmountCents: input.sessionAmountTotalCents };
  }

  const paidForLineIds = [...input.paidLineIds, ...input.noServiceLineIds];
  const missingLineIds = paidForLineIds.filter(id => !input.lineAmountsById.has(id));
  if (missingLineIds.length > 0) {
    return { action: 'needs_manual_amount', missingLineIds, paidAmountCents: null };
  }

  if (!input.sessionAmountTotalCents || input.sessionAmountTotalCents <= 0) {
    return {
      action: 'cannot_refund',
      reason: 'missing_amount',
      paidAmountCents: null,
    };
  }

  const paidSubtotalCents = sumLineAmounts(input.lineAmountsById, input.paidLineIds);
  const noServiceSubtotalCents = sumLineAmounts(input.lineAmountsById, input.noServiceLineIds);
  const subtotalCents = paidSubtotalCents + noServiceSubtotalCents;
  if (subtotalCents <= 0 || noServiceSubtotalCents <= 0) {
    return {
      action: 'needs_manual_amount',
      missingLineIds: input.noServiceLineIds,
      paidAmountCents: null,
    };
  }

  const refundAmountCents =
    input.paidLineIds.length === 0
      ? input.sessionAmountTotalCents
      : makeWholeRefundCents({
          fullSubtotalCents: subtotalCents,
          acceptedSubtotalCents: paidSubtotalCents,
          amountTotalCents: input.sessionAmountTotalCents,
          rates: input.platformFeeRates,
        });
  const paidAmountCents = Math.max(0, input.sessionAmountTotalCents - refundAmountCents);

  if (!input.paymentIntentId) {
    return {
      action: 'cannot_refund',
      reason: 'missing_payment_intent',
      paidAmountCents,
    };
  }

  return {
    action: 'refund',
    amountCents: refundAmountCents,
    paidAmountCents,
    reason: input.paidLineIds.length === 0 ? 'full_make_whole' : 'partial_no_service_lines',
  };
}

function sumLineAmounts(lineAmountsById: Map<string, number>, lineIds: string[]): number {
  return lineIds.reduce((sum, id) => sum + (lineAmountsById.get(id) ?? 0), 0);
}
