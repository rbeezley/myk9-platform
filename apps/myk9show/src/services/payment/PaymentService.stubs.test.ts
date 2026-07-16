import { describe, expect, it } from 'vitest';
import { PaymentService } from './PaymentService';

// These methods are documented stubs (see PaymentService.ts file header): they
// don't yet talk to Stripe/Edge Functions, but their call signatures and
// return shapes are part of the contract callers rely on today.
describe('PaymentService stub write methods', () => {
  const service = PaymentService.getInstance();

  describe('createPaymentIntent', () => {
    it('resolves with a paymentId and clientSecret', async () => {
      const result = await service.createPaymentIntent(
        'entry-1',
        'user-1',
        35,
        'usd',
        'Entry fee'
      );

      expect(result).not.toBeNull();
      expect(result?.paymentId).toEqual(expect.stringMatching(/^mock_/));
      expect(result?.clientSecret).toEqual(expect.stringMatching(/^mock_client_secret_/));
    });

    it('defaults currency to usd and metadata to an empty object without throwing', async () => {
      const result = await service.createPaymentIntent(
        'entry-1',
        'user-1',
        35,
        undefined,
        'Entry fee'
      );

      expect(result).not.toBeNull();
    });
  });

  describe('confirmPayment', () => {
    it('resolves true given a paymentId, transactionId, and payment method info', async () => {
      await expect(
        service.confirmPayment('payment-1', 'txn-1', { type: 'card', last4: '4242' })
      ).resolves.toBe(true);
    });
  });

  describe('failPayment', () => {
    it('resolves true (marks the failure) even without an error message', async () => {
      await expect(service.failPayment('payment-1')).resolves.toBe(true);
    });

    it('resolves true with an error message supplied', async () => {
      await expect(service.failPayment('payment-1', 'card_declined')).resolves.toBe(true);
    });
  });

  describe('processRefund', () => {
    it('resolves with a mock refund id', async () => {
      const refundId = await service.processRefund('payment-1', 35, 'requested_by_customer');

      expect(refundId).toEqual(expect.stringMatching(/^mock_refund_/));
    });
  });

  describe('testPaymentService', () => {
    it('resolves true', async () => {
      await expect(service.testPaymentService()).resolves.toBe(true);
    });
  });
});
