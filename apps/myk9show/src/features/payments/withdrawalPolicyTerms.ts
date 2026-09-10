/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  const policyText = (notes ?? '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '');
  return /\b(?:no|full|partial)\s+refunds?\b|\brefunds?\b[\s\S]{0,80}\b(?:no|none|full|partial|after|before|until)\b|\bfull\s+until\b|\b(?:\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)[\s\S]{0,80}\b(?:after|before|until|none|less|refund|entry fee|office fee|fee|forfeit)\b|\b(?:entry fees?|office fees?|fees?|amount|proceeds)\b[\s\S]{0,100}\b(?:after|before|until|none|less|retain(?:s|ed|ing)?|keeps?|non[- ]?refundable|forfeit(?:s|ed|ing)?)\b|\b(?:retain(?:s|ed|ing)?|keeps?|kept|non[- ]?refundable|forfeit(?:s|ed|ing)?)\b[\s\S]{0,80}\b(?:refunds?|entry fees?|office fees?|fees?|amount|\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)\b|\bforfeit(?:s|ed|ing)?\b[\s\S]{0,80}\b(?:fees?|refunds?|amount)\b/is.test(
    policyText
  );
}
