/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  return /\b(?:no|full|partial)\s+(?<![@\w])refunds?\b|(?<![@\w])\brefunds?\b(?!@)[\s\S]{0,80}\b(?:no|none|full|partial|after|before|until)\b|\bfull\s+until\b|\b(?:\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)[\s\S]{0,80}\b(?:after|before|until|none|less|refund|entry fee|office fee|fee)\b|\b(?:entry fees?|office fees?|fees?|amount|proceeds)\b[\s\S]{0,100}\b(?:after|before|until|none|less|retain(?:s|ed|ing)?|keeps?|non[- ]?refundable)\b|\b(?:retain(?:s|ed|ing)?|keeps?|kept|non[- ]?refundable)\b[\s\S]{0,80}\b(?<![@\w])(?:refunds?\b(?!@)|entry fees?|office fees?|fees?|amount|\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)\b/is.test(
    notes ?? ''
  );
}
