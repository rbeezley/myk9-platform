import { describe, expect, it } from 'vitest';
import {
  formatAlertDetail,
  groupOperatorAlerts,
  parseOperatorAlert,
  severityToBadgeVariant,
} from './operatorAlertsSelectors';
import type { OperatorAlert, OperatorAlertRow } from './operatorAlertsTypes';

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

  // A key whose value IS the message needs no "html:" label in front of it.
  it('strips HTML tags from string values, and drops the message key prefix', () => {
    expect(
      formatAlertDetail({ html: '<p>Auto-refund <code>re_3U5z1FAIej</code> issued.</p>' })
    ).toBe('Auto-refund re_3U5z1FAIej issued.');
  });

  it('keeps the key prefix for keys that label their value', () => {
    expect(formatAlertDetail({ amount: 20, note: 'partial' })).toBe('amount: 20, note: partial');
  });

  it('truncates values longer than 120 characters with an ellipsis', () => {
    const long = 'x'.repeat(150);
    expect(formatAlertDetail({ note: long })).toBe(`note: ${'x'.repeat(120)}…`);
  });

  it('renders nested objects as compact JSON instead of [object Object]', () => {
    expect(formatAlertDetail({ charge: { id: 'ch_1', amount: 500 } })).toBe(
      'charge: {"id":"ch_1","amount":500}'
    );
  });

  it('leaves comparison prose alone; only tag-shaped text is stripped', () => {
    expect(formatAlertDetail({ message: 'cpu < 80 and mem > 90' })).toBe('cpu < 80 and mem > 90');
  });
});

describe('groupOperatorAlerts', () => {
  const at = (iso: string, over: Partial<OperatorAlert> = {}): OperatorAlert => ({
    id: `id-${iso}`,
    createdAt: iso,
    source: 'stripe-webhook',
    severity: 'error',
    title: 'Cart overflow charge auto-refunded',
    detail: null,
    dedupeKey: null,
    resolvedAt: null,
    resolvedBy: null,
    ...over,
  });

  it('collapses repeats of the same source, severity and title', () => {
    const groups = groupOperatorAlerts([
      at('2026-08-19T03:00:00Z'),
      at('2026-08-19T02:00:00Z'),
      at('2026-08-19T01:00:00Z', { title: 'Paid cart had overflow lines' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].alerts).toHaveLength(2);
    expect(groups[0].title).toBe('Cart overflow charge auto-refunded');
    expect(groups[1].alerts).toHaveLength(1);
  });

  // dedupe_key embeds the refund/session id, so it identifies ONE event and can
  // never be the grouping key — grouping on it yields N groups of 1.
  it('groups across differing dedupe keys', () => {
    const groups = groupOperatorAlerts([
      at('2026-08-19T03:00:00Z', { dedupeKey: 'cart-overflow-refund-issued-re_A' }),
      at('2026-08-19T02:00:00Z', { dedupeKey: 'cart-overflow-refund-issued-re_B' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].alerts).toHaveLength(2);
  });

  it('keeps a different severity or source in its own group', () => {
    const groups = groupOperatorAlerts([
      at('2026-08-19T03:00:00Z'),
      at('2026-08-19T02:00:00Z', { severity: 'warn' }),
      at('2026-08-19T01:00:00Z', { source: 'payout-cron' }),
    ]);

    expect(groups).toHaveLength(3);
  });

  it('carries the newest and oldest timestamps of its members', () => {
    const groups = groupOperatorAlerts([
      at('2026-08-19T03:00:00Z'),
      at('2026-08-19T01:00:00Z'),
      at('2026-08-19T02:00:00Z'),
    ]);

    expect(groups[0].newestAt).toBe('2026-08-19T03:00:00Z');
    expect(groups[0].oldestAt).toBe('2026-08-19T01:00:00Z');
  });

  it('preserves the newest-first order the query returned', () => {
    const groups = groupOperatorAlerts([
      at('2026-08-19T01:00:00Z', { title: 'Older type' }),
      at('2026-08-19T05:00:00Z', { title: 'Newer type' }),
    ]);

    expect(groups.map(g => g.title)).toEqual(['Older type', 'Newer type']);
  });

  it('returns an empty list for no alerts', () => {
    expect(groupOperatorAlerts([])).toEqual([]);
  });
});
