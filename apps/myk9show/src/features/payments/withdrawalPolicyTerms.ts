/** Returns true when notes contain policy terms that could change the refund. */
export function notesDescribeRefundTerms(notes: string | null): boolean {
  const policyText = (notes ?? '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '');
  const naturalScheduleTerms =
    /\b(?:payments?|funds?)\b[\s\S]{0,80}\b(?:final|returned)\b[\s\S]{0,40}\b(?:after|before|until|deadline|closing)\b/i;
  if (naturalScheduleTerms.test(policyText)) return true;
  if (
    /\bwithdrawals?\b[\s\S]{0,100}\b(?:non[- ]?refundable|not\s+refundable|forfeit(?:s|ed|ing)?|no\s+refunds?)\b|\b(?:non[- ]?refundable|not\s+refundable)\b[\s\S]{0,100}\bwithdrawals?\b/i.test(
      policyText
    )
  ) {
    return true;
  }
  if (
    /\brefunds?\b[\s\S]{0,80}\b(?:not allowed|not permitted|prohibited|forbidden)\b/i.test(
      policyText
    )
  ) {
    return true;
  }
  if (
    /\b(?:charge|fee|assessment)\b[\s\S]{0,100}\b(?:appl(?:y|ies)|charged|deducted|withheld)\b/i.test(
      policyText
    )
  ) {
    return true;
  }
  return /\b(?:no|full|partial)\s+refunds?\b|\b(?:money|funds?|payments?)\s+(?:back|returned|final)\b|\bpaid\s+back\b|\brefunds?\b[\s\S]{0,80}\b(?:no|none|full|partial|after|before|until)\b|\bfull\s+until\b|\b(?:\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)[\s\S]{0,80}\b(?:after|before|until|none|less|refund|entry fee|office fee|fee|forfeit)\b|\b(?:entry fees?|office fees?|fees?|amount|proceeds)\b[\s\S]{0,100}\b(?:after|before|until|none|less|retain(?:s|ed|ing)?|keeps?|non[- ]?refundable|forfeit(?:s|ed|ing)?)\b|\b(?:retain(?:s|ed|ing)?|keeps?|kept|non[- ]?refundable|forfeit(?:s|ed|ing)?)\b[\s\S]{0,80}\b(?:refunds?|entry fees?|office fees?|fees?|amount|\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d{1,2})?|\d+\s+dollars?)\b|\bforfeit(?:s|ed|ing)?\b[\s\S]{0,80}\b(?:fees?|refunds?|amount)\b/is.test(
    policyText
  );
}
