/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  return /\b(?:no|full|partial)\s+refunds?\b|\brefunds?\b[\s\S]{0,80}\b(?:no|none|full|partial|after|before|until)\b|\bfull\s+until\b|\b(?:retain(?:s|ed|ing)?|keeps?|kept|non[- ]?refundable|retention|cutoffs?)\b|\b(?:refund|retain|retention|keep|kept|non[- ]?refundable)[\s\S]{0,80}(?:\d+(?:\.\d+)?\s*%|\$\s*\d)/is.test(
    notes ?? ''
  );
}
