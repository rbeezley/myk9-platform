import { describe, expect, it, vi } from 'vitest';
import { refundUnfulfillableCheckout } from './checkoutRefund';

const input = { sessionId: 'cs_1', paymentIntentId: 'pi_1', reason: 'frozen total mismatch' };

describe('refundUnfulfillableCheckout', () => {
  it('refunds a paid mismatch once with a stable Stripe idempotency key', async () => {
    const create = vi.fn().mockResolvedValue({ id: 're_1' });
    const alert = vi.fn().mockResolvedValue(undefined);
    await refundUnfulfillableCheckout(input, { create, alert });
    expect(create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        metadata: {
          type: 'entry_checkout_auto_refund',
          checkout_session_id: 'cs_1',
          myk9_make_whole: 'true',
        },
      },
      { idempotencyKey: 'entry-checkout-auto-refund-cs_1' }
    );
    expect(alert).toHaveBeenCalledWith(
      'Paid entry checkout auto-refunded',
      expect.stringContaining('frozen total mismatch'),
      expect.objectContaining({ dedupeKey: 'entry-checkout-auto-refunded-cs_1' })
    );
  });

  it('propagates Stripe failure so the webhook returns 5xx for retry', async () => {
    const create = vi.fn().mockRejectedValue(new Error('Stripe unavailable'));
    await expect(
      refundUnfulfillableCheckout(input, {
        create,
        alert: vi.fn(),
      })
    ).rejects.toThrow('Stripe unavailable');
  });
});
