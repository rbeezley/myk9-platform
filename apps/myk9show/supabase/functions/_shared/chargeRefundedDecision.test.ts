import { describe, expect, it } from 'vitest';
import {
  allRefundsAppOriginated,
  buildUnmatchedRefundAlert,
  decideShowRefundStampAlert,
  findShowRefundId,
  isAppOriginatedRefund,
} from './chargeRefundedDecision';

describe('isAppOriginatedRefund', () => {
  it('recognizes a per-entry refund', () => {
    expect(isAppOriginatedRefund({ metadata: { entry_id: 'e1' } })).toBe(true);
  });

  it('recognizes an entry payment request auto-refund', () => {
    expect(isAppOriginatedRefund({ metadata: { type: 'entry_payment_request_auto_refund' } })).toBe(
      true
    );
  });

  it('recognizes a cart overflow auto-refund', () => {
    expect(isAppOriginatedRefund({ metadata: { type: 'entry_cart_overflow_auto_refund' } })).toBe(
      true
    );
  });

  it('recognizes a bulk show-cancellation refund', () => {
    expect(isAppOriginatedRefund({ metadata: { show_refund: 'show_a' } })).toBe(true);
  });

  it('rejects a dashboard refund with no app metadata', () => {
    expect(isAppOriginatedRefund({ metadata: {} })).toBe(false);
    expect(isAppOriginatedRefund({ metadata: null })).toBe(false);
  });
});

describe('allRefundsAppOriginated', () => {
  it('is true when every refund on the charge is app-originated', () => {
    expect(
      allRefundsAppOriginated([
        { metadata: { entry_id: 'e1' } },
        { metadata: { show_refund: 'show_a' } },
      ])
    ).toBe(true);
  });

  it('is false when mixed with a dashboard refund (never masks it)', () => {
    expect(allRefundsAppOriginated([{ metadata: { entry_id: 'e1' } }, { metadata: {} }])).toBe(
      false
    );
  });

  it('is false for an empty refund list', () => {
    expect(allRefundsAppOriginated([])).toBe(false);
  });
});

describe('findShowRefundId', () => {
  it('extracts the show id from a show-refund-tagged refund', () => {
    expect(findShowRefundId([{ metadata: { show_refund: 'show_a' } }])).toBe('show_a');
  });

  it('returns undefined when no refund is show-tagged', () => {
    expect(findShowRefundId([{ metadata: { entry_id: 'e1' } }])).toBeUndefined();
  });
});

describe('decideShowRefundStampAlert', () => {
  it('does not alert when every entry on the intent is already stamped', () => {
    expect(decideShowRefundStampAlert(0)).toEqual({ action: 'none' });
  });

  it('alerts exactly once when entries are unstamped, regardless of count', () => {
    expect(decideShowRefundStampAlert(1)).toEqual({ action: 'alert', unstampedEntryCount: 1 });
    expect(decideShowRefundStampAlert(200)).toEqual({
      action: 'alert',
      unstampedEntryCount: 200,
    });
  });
});

describe('buildUnmatchedRefundAlert', () => {
  const input = {
    paymentIntentId: 'pi_123',
    chargeId: 'ch_456',
    refundedAmountCents: 5000,
    eventId: 'evt_789',
  };

  it('includes the payment intent id, charge id, and refunded amount in detail', () => {
    const alert = buildUnmatchedRefundAlert(input);
    expect(alert.detail).toEqual({
      paymentIntentId: 'pi_123',
      chargeId: 'ch_456',
      refundedAmountCents: 5000,
    });
  });

  it('keys dedupeKey on the Stripe event id so re-delivery does not duplicate', () => {
    const alert = buildUnmatchedRefundAlert(input);
    expect(alert.dedupeKey).toBe('evt_789');
  });

  it('uses warn severity (needs investigation, not yet a confirmed money loss)', () => {
    const alert = buildUnmatchedRefundAlert(input);
    expect(alert.severity).toBe('warn');
  });

  it('mentions the payment intent id and dollar amount in the human-readable title/html', () => {
    const alert = buildUnmatchedRefundAlert(input);
    expect(alert.title).toContain('pi_123');
    expect(alert.html).toContain('pi_123');
    expect(alert.html).toContain('ch_456');
    expect(alert.html).toContain('50.00');
  });
});
