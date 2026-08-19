import { describe, expect, it } from 'vitest';
import {
  formatAlertDetail,
  parseOperatorAlert,
  severityToBadgeVariant,
} from './operatorAlertsSelectors';
import type { OperatorAlertRow } from './operatorAlertsTypes';

function row(overrides: Partial<OperatorAlertRow> = {}): OperatorAlertRow {
  return {
    id: 'alert-1',
    created_at: '2026-07-09T12:00:00Z',
    source: 'stripe-webhook',
    severity: 'warn',
    title: 'Unmatched refund for payment intent pi_123 — no order found',
    detail: { paymentIntentId: 'pi_123', chargeId: 'ch_456', refundedAmountCents: 5000 },
    dedupe_key: 'evt_789',
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

describe('parseOperatorAlert', () => {
  it('normalizes a well-formed row', () => {
    const alert = parseOperatorAlert(row());
    expect(alert).toEqual({
      id: 'alert-1',
      createdAt: '2026-07-09T12:00:00Z',
      source: 'stripe-webhook',
      severity: 'warn',
      title: 'Unmatched refund for payment intent pi_123 — no order found',
      detail: { paymentIntentId: 'pi_123', chargeId: 'ch_456', refundedAmountCents: 5000 },
      dedupeKey: 'evt_789',
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it('falls back an unrecognized severity to error rather than crashing', () => {
    const alert = parseOperatorAlert(row({ severity: 'critical' }));
    expect(alert.severity).toBe('error');
  });

  it('normalizes a non-object detail to null', () => {
    expect(parseOperatorAlert(row({ detail: 'not an object' })).detail).toBeNull();
    expect(parseOperatorAlert(row({ detail: null })).detail).toBeNull();
  });

  it('carries resolved fields through when set', () => {
    const alert = parseOperatorAlert(
      row({ resolved_at: '2026-07-09T13:00:00Z', resolved_by: 'user-1' })
    );
    expect(alert.resolvedAt).toBe('2026-07-09T13:00:00Z');
    expect(alert.resolvedBy).toBe('user-1');
  });
});

describe('severityToBadgeVariant', () => {
  it('maps error to the error variant', () => {
    expect(severityToBadgeVariant('error')).toBe('error');
  });
  it('maps warn to the warning variant', () => {
    expect(severityToBadgeVariant('warn')).toBe('warning');
  });
  it('maps info to a neutral variant', () => {
    expect(severityToBadgeVariant('info')).toBe('muted');
  });
});

describe('formatAlertDetail', () => {
  it('renders key-value pairs from a detail object', () => {
    expect(formatAlertDetail({ paymentIntentId: 'pi_123', amount: 5000 })).toBe(
      'paymentIntentId: pi_123, amount: 5000'
    );
  });

  it('returns an empty string for null detail', () => {
    expect(formatAlertDetail(null)).toBe('');
  });

  it('returns an empty string for an empty object', () => {
    expect(formatAlertDetail({})).toBe('');
  });

  // Production alerts store rendered markup under an `html` key; show the
  // sentence, never the serialization (same rule as summarizeAlertDetail on
  // the admin dashboard).
  it('shows markup-valued keys as their text, without the key prefix', () => {
    expect(formatAlertDetail({ html: '<p>Auto-refund <code>re_123</code> issued.</p>' })).toBe(
      'Auto-refund re_123 issued.'
    );
  });

  it('skips nested objects instead of printing [object Object]', () => {
    expect(formatAlertDetail({ amount: 20, meta: { a: 1 } })).toBe('amount: 20');
  });
});
