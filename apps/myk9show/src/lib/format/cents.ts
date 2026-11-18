/**
 * Dollars for an integer-cents figure: `$12.50`. No thousands separator, and a
 * negative figure reads `$-5.00`; callers that show a deduction use
 * `formatDeductionCents`. Display only: money arithmetic stays in cents.
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A deduction (a refund), signed: `-$5.00`, or `$0.00` when there is none. */
export function formatDeductionCents(cents: number): string {
  return cents > 0 ? `-${formatCents(cents)}` : formatCents(0);
}
