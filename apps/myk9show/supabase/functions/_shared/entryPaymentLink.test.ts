import { describe, it, expect } from 'vitest';
import { buildEntryPaymentLinkSession } from './entryPaymentLink';

const baseEntries = [
  {
    entryId: 'e1',
    authoritativeFeeCents: 3000,
    dogName: 'Rex',
    className: 'Novice A',
    showName: 'Spring Trial',
  },
  {
    entryId: 'e2',
    authoritativeFeeCents: 3000,
    dogName: 'Bella',
    className: 'Open B',
    showName: 'Spring Trial',
  },
];

const base = {
  entries: baseEntries,
  platformFeeRates: { percent: 7, flatCents: 0, minCents: 0 },
  successUrl: 'https://myk9show.com/pay/success',
  cancelUrl: 'https://myk9show.com/pay/cancel',
  expiresAtEpoch: 1_900_000_000,
};

describe('buildEntryPaymentLinkSession', () => {
  it('tags the session as an entry_payment_request carrying the entry ids (the webhook anti-tamper carrier)', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s.mode).toBe('payment');
    expect(s.metadata.type).toBe('entry_payment_request');
    expect(JSON.parse(s.metadata.entry_ids)).toEqual(['e1', 'e2']);
    // payment_intent_data carries the same tag so refund/charge events can be traced
    expect(s.payment_intent_data.metadata.type).toBe('entry_payment_request');
    expect(JSON.parse(s.payment_intent_data.metadata.entry_ids)).toEqual(['e1', 'e2']);
    expect(s.payment_intent_data.statement_descriptor_suffix).toBe('SPRING');
    expect(s.payment_intent_data.statement_descriptor_suffix).toHaveLength(6);
  });

  it('prices each entry from its authoritative fee, never a client value', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s.line_items[0].price_data.unit_amount).toBe(3000);
    expect(s.line_items[1].price_data.unit_amount).toBe(3000);
    expect(s.line_items[0].price_data.product_data.name).toBe('Rex - Novice A');
  });

  it('stamps each entry product with its entry id so refund math does not depend on array order', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s.line_items[0].price_data.product_data.metadata).toEqual({
      type: 'entry',
      entry_id: 'e1',
    });
    expect(s.line_items[1].price_data.product_data.metadata).toEqual({
      type: 'entry',
      entry_id: 'e2',
    });
  });

  it('adds the platform fee ON TOP as its own line item (fee-on-top — the exhibitor pays it)', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s.line_items).toHaveLength(3); // 2 entries + 1 platform fee
    const fee = s.line_items[s.line_items.length - 1];
    expect(fee.price_data.product_data.name).toBe('Platform Fee');
    expect(fee.price_data.unit_amount).toBe(420); // 7% of 6000
    expect(fee.price_data.product_data.metadata).toEqual({ type: 'platform_fee' });
    // stamp the rates so the webhook validates against the exact charged rates
    expect(s.metadata.platform_fee_percent).toBe('7');
    expect(s.metadata.platform_fee_flat_cents).toBe('0');
    expect(s.metadata.platform_fee_min_cents).toBe('0');
  });

  it('omits the platform-fee line item when every fee component is 0', () => {
    const s = buildEntryPaymentLinkSession({
      ...base,
      platformFeeRates: { percent: 0, flatCents: 0, minCents: 0 },
    });
    expect(s.line_items).toHaveLength(2);
  });

  it('folds the flat component and the floor into the SINGLE Platform Fee line', () => {
    // One line, not three: the exhibitor is shown a platform fee, not an
    // itemised breakdown of how the platform priced it (MYK9-197 decision).
    const s = buildEntryPaymentLinkSession({
      ...base,
      platformFeeRates: { percent: 7, flatCents: 30, minCents: 0 },
    });
    expect(s.line_items).toHaveLength(3); // 2 entries + 1 platform fee
    const fee = s.line_items[s.line_items.length - 1];
    expect(fee.price_data.product_data.name).toBe('Platform Fee');
    expect(fee.price_data.unit_amount).toBe(450); // 7% of 6000, plus 30¢ once
    expect(s.metadata.platform_fee_flat_cents).toBe('30');
  });

  it('still charges the flat component when the percent is 0', () => {
    const s = buildEntryPaymentLinkSession({
      ...base,
      platformFeeRates: { percent: 0, flatCents: 30, minCents: 0 },
    });
    expect(s.line_items).toHaveLength(3);
    expect(s.line_items[2].price_data.unit_amount).toBe(30);
  });

  it('leaves payment-method selection to Stripe dynamic payment methods', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s).not.toHaveProperty('payment_method_types');
  });

  it('carries NO connected-account params — charges land in the platform account (hold-and-transfer)', () => {
    const s = buildEntryPaymentLinkSession(base) as unknown as Record<string, unknown>;
    expect(s.on_behalf_of).toBeUndefined();
    expect(s.transfer_data).toBeUndefined();
    expect(s.application_fee_amount).toBeUndefined();
    expect(s.payment_intent_data).not.toHaveProperty('application_fee_amount');
  });

  it('passes through redirect urls and the expiry clamp', () => {
    const s = buildEntryPaymentLinkSession(base);
    expect(s.success_url).toBe(base.successUrl);
    expect(s.cancel_url).toBe(base.cancelUrl);
    expect(s.expires_at).toBe(base.expiresAtEpoch);
  });

  it('throws rather than create an empty (chargeless) session', () => {
    expect(() => buildEntryPaymentLinkSession({ ...base, entries: [] })).toThrow();
  });

  it('shows the withdrawal policy to the payer via custom_text when provided', () => {
    const s = buildEntryPaymentLinkSession({
      ...base,
      withdrawalPolicyText: 'Full refund until June 1, 2026. Service fees are non-refundable.',
    });
    expect(s.custom_text?.submit.message).toBe(
      'Full refund until June 1, 2026. Service fees are non-refundable.'
    );
  });

  it('omits custom_text when no disclosure is supplied (or it is blank)', () => {
    expect(buildEntryPaymentLinkSession(base).custom_text).toBeUndefined();
    expect(
      buildEntryPaymentLinkSession({ ...base, withdrawalPolicyText: '   ' }).custom_text
    ).toBeUndefined();
  });

  it('clamps custom_text to Stripe’s 1200-char limit', () => {
    const s = buildEntryPaymentLinkSession({
      ...base,
      withdrawalPolicyText: 'x'.repeat(2000),
    });
    expect(s.custom_text?.submit.message.length).toBe(1200);
  });
});
