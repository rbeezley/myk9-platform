import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { checkoutErrorMessage, CART_ERROR } from '../cartErrorCopy';
import { CLUB_PAYOUTS_OFF_SERVER_MESSAGE } from '@/features/payments/cardPausedCopy';
import { CheckoutSessionError } from '@/lib/stripe';

describe('checkoutErrorMessage when the club payouts are off (MYK9-2166)', () => {
  it('reads as paused, not as a failed payment', () => {
    const message = checkoutErrorMessage(
      new CheckoutSessionError(CLUB_PAYOUTS_OFF_SERVER_MESSAGE, 403, null, true)
    );
    expect(message).toBe(
      "Card payment is paused for this show. The club's bank account needs attention. Nothing was charged. Please contact the show secretary to ask how else you can pay."
    );
  });

  it('leaves another 403 in the server words', () => {
    expect(
      checkoutErrorMessage(new CheckoutSessionError('Entries are closed.', 403, null, true))
    ).toBe('Entries are closed.');
  });

  it('does not treat the same words from a transport error as the refusal', () => {
    expect(
      checkoutErrorMessage(
        new CheckoutSessionError(CLUB_PAYOUTS_OFF_SERVER_MESSAGE, 403, null, false)
      )
    ).toBe(CART_ERROR.checkoutFailed);
  });
});
