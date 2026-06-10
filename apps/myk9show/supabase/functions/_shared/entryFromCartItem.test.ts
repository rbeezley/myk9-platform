import { describe, it, expect } from 'vitest';
import { buildEntryInsert, extractPaymentIntentId } from './entryFromCartItem';

const item = {
  dog_id: 'dog-1',
  class_id: 'class-1',
  handler_id: 'handler-1',
  entry_fee_cents: 5000,
  jump_height: '16',
  special_requests: 'first dog in ring',
};

const context = { showId: 'show-1', trialId: 'trial-1' };

describe('buildEntryInsert', () => {
  it('stamps the stripe payment intent id onto the entry row', () => {
    const row = buildEntryInsert(item, 'pi_test_123', '2026-06-09T12:00:00.000Z', context);
    expect(row.stripe_payment_intent_id).toBe('pi_test_123');
  });

  it('builds a row matching the REAL entries schema (verified against migrations 003 + 20260518)', () => {
    // entries has NO source/notes/entry_fee_cents columns: fee is DECIMAL
    // dollars (entry_fee), free text goes to special_requests, and the
    // online/desk discriminator is payment_method (May 2026 migration).
    // show_id/trial_id MUST be set: no trigger derives them, and the payout
    // calc, refund join, and secretary entries list all key on show_id.
    expect(buildEntryInsert(item, 'pi_test_123', '2026-06-09T12:00:00.000Z', context)).toEqual({
      dog_id: 'dog-1',
      class_id: 'class-1',
      trial_id: 'trial-1',
      show_id: 'show-1',
      handler_id: 'handler-1',
      entry_status: 'paid',
      payment_status: 'paid',
      entry_fee: 50,
      jump_height: '16',
      special_requests: 'first dog in ring',
      payment_method: 'online',
      submitted_at: '2026-06-09T12:00:00.000Z',
      stripe_payment_intent_id: 'pi_test_123',
    });
  });

  it('converts odd cent amounts to exact dollars', () => {
    const row = buildEntryInsert({ ...item, entry_fee_cents: 4533 }, 'pi_x', 't', context);
    expect(row.entry_fee).toBe(45.33);
  });

  it('tolerates a missing trial mapping (trial_id null) but show_id is always required', () => {
    const row = buildEntryInsert(item, 'pi_x', 't', { showId: 'show-1', trialId: null });
    expect(row.show_id).toBe('show-1');
    expect(row.trial_id).toBeNull();
  });

  it('writes NULL intent when the session had none (entry stays non-refundable)', () => {
    const row = buildEntryInsert(item, null, '2026-06-09T12:00:00.000Z', context);
    expect(row.stripe_payment_intent_id).toBeNull();
  });
});

describe('extractPaymentIntentId', () => {
  it('passes through a string id', () => {
    expect(extractPaymentIntentId('pi_abc')).toBe('pi_abc');
  });

  it('unwraps an expanded PaymentIntent object', () => {
    expect(extractPaymentIntentId({ id: 'pi_expanded' })).toBe('pi_expanded');
  });

  it('returns null for null/undefined/malformed values', () => {
    expect(extractPaymentIntentId(null)).toBeNull();
    expect(extractPaymentIntentId(undefined)).toBeNull();
    expect(extractPaymentIntentId({})).toBeNull();
    expect(extractPaymentIntentId(42)).toBeNull();
  });
});
