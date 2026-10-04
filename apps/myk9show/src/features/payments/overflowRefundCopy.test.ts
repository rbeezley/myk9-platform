import { describe, expect, it } from 'vitest';
import { overflowRefundMessage } from './overflowRefundCopy';

describe('overflowRefundMessage', () => {
  it.each([
    [9630, 9630, true, 'Your payment of $96.30 has been refunded in full, service fee included.'],
    [9630, 9630, false, 'Your payment of $96.30 is being refunded in full, service fee included.'],
    [
      9000,
      9630,
      true,
      '$90.00 of your $96.30 has been refunded: your entry fees. The service fee is not refundable.',
    ],
    [
      9000,
      9630,
      false,
      '$90.00 of your $96.30 is being refunded: your entry fees. The service fee is not refundable.',
    ],
    [null, 9630, true, 'Your refund has been issued.'],
    [9000, undefined, false, 'Your refund is being processed.'],
    [0, 9630, false, 'Your refund is being processed.'],
  ] as const)('refund %s of charge %s (issued: %s)', (refundCents, chargedCents, issued, text) => {
    expect(overflowRefundMessage({ refundCents, chargedCents, issued })).toBe(text);
  });
});
