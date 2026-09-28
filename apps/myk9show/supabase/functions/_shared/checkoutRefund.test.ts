import { describe, expect, it, vi } from 'vitest';
import { findActiveAutoRefund, refundUnfulfillableCheckout } from './checkoutRefund';

const input = { sessionId: 'cs_1', paymentIntentId: 'pi_1', reason: 'frozen total mismatch' };

describe('refundUnfulfillableCheckout', () => {
  it('refunds a paid mismatch once with a stable Stripe idempotency key', async () => {
    const create = vi.fn().mockResolvedValue({ id: 're_1' });
    const findExisting = vi.fn().mockResolvedValue(null);
    const alert = vi.fn().mockResolvedValue(undefined);
    await refundUnfulfillableCheckout(input, { create, findExisting, alert });
    expect(findExisting).toHaveBeenCalledWith('pi_1', 'cs_1');
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
        findExisting: vi.fn().mockResolvedValue(null),
        alert: vi.fn(),
      })
    ).rejects.toThrow('Stripe unavailable');
  });

  it('reuses an existing refund after the idempotency window rather than charging twice', async () => {
    const create = vi.fn();
    const alert = vi.fn().mockResolvedValue(undefined);
    await refundUnfulfillableCheckout(input, {
      create,
      findExisting: vi.fn().mockResolvedValue({ id: 're_original' }),
      alert,
    });
    expect(create).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Paid entry checkout auto-refunded',
      expect.stringContaining('re_original'),
      expect.anything()
    );
  });

  it('treats an externally refunded charge as complete and alerts for verification', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockRejectedValue({ code: 'charge_already_refunded' });
    await refundUnfulfillableCheckout(input, {
      create,
      findExisting: vi.fn().mockResolvedValue(null),
      alert,
    });
    expect(alert).toHaveBeenCalledWith(
      'Paid entry checkout was already refunded',
      expect.stringContaining('pi_1'),
      expect.anything()
    );
  });
});

describe('findActiveAutoRefund', () => {
  it('finds only an active refund for the same session, type and reason', () => {
    const refunds = [
      {
        id: 'old',
        status: 'failed',
        metadata: {
          type: 'entry_payment_request_auto_refund',
          checkout_session_id: 'cs_1',
          reason: 'full_make_whole',
        },
      },
      {
        id: 'other',
        status: 'succeeded',
        metadata: {
          type: 'entry_payment_request_auto_refund',
          checkout_session_id: 'cs_2',
          reason: 'full_make_whole',
        },
      },
      {
        id: 'match',
        status: 'pending',
        metadata: {
          type: 'entry_payment_request_auto_refund',
          checkout_session_id: 'cs_1',
          reason: 'full_make_whole',
        },
      },
    ];
    expect(
      findActiveAutoRefund(refunds, 'entry_payment_request_auto_refund', 'cs_1', 'full_make_whole')
        ?.id
    ).toBe('match');
    expect(
      findActiveAutoRefund(
        refunds,
        'entry_payment_request_auto_refund',
        'cs_1',
        'partial_invalid_entries'
      )
    ).toBeUndefined();
  });
});
