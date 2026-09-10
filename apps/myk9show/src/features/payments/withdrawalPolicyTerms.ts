/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  return /\b(?:no|full|partial)\s+refunds?\b|\brefunds?\b.*\b(?:after|before|until|once|none)\b|\b(?:retain(?:s|ed|ing)?|keeps?|kept|non[- ]?refundable|retention|cutoffs?|deadlines?)\b|\d+(?:\.\d+)?\s*%|\$\s*\d/i.test(
    notes ?? ''
  );
}
