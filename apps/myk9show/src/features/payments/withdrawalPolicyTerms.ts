/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  return /\b(refund|retain(?:ed|ing)?|retention|kept|non-refundable|cutoff|deadline)\b|\d+(?:\.\d+)?\s*%|\$\s*\d|\bfull\s+(?:refund|until)\b|\bnone\s+after\b|\b(?:after|before)\s+(?:the\s+)?(?:cutoff|deadline|\d)/i.test(
    notes ?? ''
  );
}
