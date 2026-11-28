export const SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE = String.raw`\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b`;

const PAYMENT_REFUND_PATTERN = new RegExp(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE, 'i');

export function isPaymentOrRefundQuestion(message: string): boolean {
  return PAYMENT_REFUND_PATTERN.test(message);
}

// MYK9-2505: a money topic alone is not a reason to skip the guides. Only a question about a
// specific account, charge, payout or refund goes to a person; how-it-works questions are quoted
// from the guides, whose prompt rule already forbids answering from account data.
const MONEY_NOUN = String.raw`(?:refunds?|charges?|charged|payments?|payouts?|invoices?|receipts?|transactions?|withdrawals?|deposits?|balance)`;

const ACCOUNT_SPECIFIC_PATTERNS: RegExp[] = [
  // "my refund", "my Stripe payment", "our payout"
  new RegExp(String.raw`\b(?:my|our|his|her|their)\s+(?:[\w'-]+\s+){0,2}${MONEY_NOUN}\b`, 'i'),
  // "I was charged", "we got billed", "charged twice", "double charged"
  /\b(?:i|we)(?:'ve|\s+have|\s+was|\s+were|\s+got|\s+been|\s+am|\s+are|\s+get)?\s+(?:been\s+|was\s+|were\s+|got\s+)?(?:double[-\s])?(?:charged|billed|overcharged)\b/i,
  /\b(?:charged|billed)\s+(?:twice|again|double|too\s+much|incorrectly|wrongly)\b/i,
  /\b(?:was|were|been|got)\s+(?:double[-\s])?(?:charged|billed|overcharged)\b/i,
  // "where is the refund", "where's the payout"
  new RegExp(
    String.raw`\bwhere(?:'s|\s+is|\s+are|\s+did)\s+(?:[\w'-]+\s+){0,3}${MONEY_NOUN}\b`,
    'i'
  ),
  // "haven't received", "never got"
  new RegExp(
    String.raw`\b(?:haven't|have\s+not|hasn't|has\s+not|never|didn't|did\s+not|not)\s+(?:yet\s+)?(?:received|got|gotten|arrived|come)\b`,
    'i'
  ),
  // a dollar amount, or a dated instance of a money event
  /\$\s?\d/,
  new RegExp(String.raw`\b${MONEY_NOUN}\s+for\s+(?:last|this\s+past|the\s+past|\d)`, 'i'),
];

/** A money question that names a specific account, charge, payout or refund. */
export function isAccountSpecificPaymentQuestion(message: string): boolean {
  return ACCOUNT_SPECIFIC_PATTERNS.some(pattern => pattern.test(message));
}

/** Escalate to a person only when the question is about money AND about a specific account. */
export function needsPaymentEscalation(message: string): boolean {
  return isPaymentOrRefundQuestion(message) && isAccountSpecificPaymentQuestion(message);
}
