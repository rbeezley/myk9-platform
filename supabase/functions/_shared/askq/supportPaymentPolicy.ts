export const SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE = String.raw`\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b`;

const PAYMENT_REFUND_PATTERN = new RegExp(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE, 'i');

export function isPaymentOrRefundQuestion(message: string): boolean {
  return PAYMENT_REFUND_PATTERN.test(message);
}
