/**
 * The checkout-success line for an all-overflow checkout (no class could take
 * any line), chosen from the ACTUAL refund and charge, never from a date or a
 * rule version (Codex on #2745):
 *
 * - refund == charge: a full refund, service fee included (the 2026-10-04
 *   owner rule refunds an unserved cart line its share of the fee too);
 * - refund < charge: "$X of your $Y", the entry fees, the service fee kept
 *   (orders refunded under MYK9-966's entry-fees-only rule);
 * - either amount unknown: a neutral line that claims neither.
 */
export function overflowRefundMessage(input: {
  refundCents: number | null | undefined;
  chargedCents: number | null | undefined;
  issued: boolean;
}): string {
  const { refundCents, chargedCents, issued } = input;
  const known =
    typeof refundCents === 'number' &&
    typeof chargedCents === 'number' &&
    refundCents > 0 &&
    chargedCents > 0;
  if (!known) {
    return issued ? 'Your refund has been issued.' : 'Your refund is being processed.';
  }
  if (refundCents >= chargedCents) {
    return issued
      ? `Your payment of ${dollars(chargedCents)} has been refunded in full, service fee included.`
      : `Your payment of ${dollars(chargedCents)} is being refunded in full, service fee included.`;
  }
  const part = `${dollars(refundCents)} of your ${dollars(chargedCents)}`;
  return issued
    ? `${part} has been refunded: your entry fees. The service fee is not refundable.`
    : `${part} is being refunded: your entry fees. The service fee is not refundable.`;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
