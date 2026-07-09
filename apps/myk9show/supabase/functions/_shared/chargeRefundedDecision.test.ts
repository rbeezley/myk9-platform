import { describe, expect, it } from 'vitest';
import {
  allRefundsAppOriginated,
  decideShowRefundStampAlert,
  findShowRefundId,
  isAppOriginatedRefund,
} from './chargeRefundedDecision';

describe('isAppOriginatedRefund', () => {
  it('recognizes a per-entry refund', () => {
    expect(isAppOriginatedRefund({ metadata: { entry_id: 'e1' } })).toBe(true);
  });

  it('recognizes an entry payment request auto-refund', () => {
    expect(
      isAppOriginatedRefund({ metadata: { type: 'entry_payment_request_auto_refund' } })
    ).toBe(true);
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
    expect(
      allRefundsAppOriginated([{ metadata: { entry_id: 'e1' } }, { metadata: {} }])
    ).toBe(false);
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
