// Pure builder for a secretary-initiated entry payment-link Checkout Session.
// Deno-free (colocated vitest) — mirrors stripe-checkout's entry line-item +
// fee-on-top model so a link-paid entry charges identically to a self-pay cart.
//
// The whole charge lands in the PLATFORM account (hold-and-transfer model — the
// club is paid later by cron-process-payouts; the platform fee is a retained
// line item). So this session carries NO connected-account params by design.

import { calculatePlatformFeeCents } from './platformFee.ts';

export interface PaymentLinkEntry {
  entryId: string;
  /** Authoritative fee in cents — recomputed server-side, never a client value. */
  authoritativeFeeCents: number;
  dogName: string;
  className: string;
  showName: string;
}

export interface BuildEntryPaymentLinkInput {
  entries: PaymentLinkEntry[];
  platformFeePercent: number;
  successUrl: string;
  cancelUrl: string;
  /** Unix epoch seconds; Stripe's minimum is now + 30 min. */
  expiresAtEpoch: number;
  /** Withdrawal-policy disclosure shown to the PAYER on the Stripe page
   *  (custom_text.submit). Omitted → no custom_text. Stripe caps it at 1200 chars. */
  withdrawalPolicyText?: string;
}

interface LineItem {
  price_data: {
    currency: string;
    unit_amount: number;
    product_data: {
      name: string;
      description?: string;
      metadata?: Record<string, string>;
    };
  };
  quantity: number;
}

export interface EntryPaymentLinkSessionParams {
  mode: 'payment';
  line_items: LineItem[];
  expires_at: number;
  success_url: string;
  cancel_url: string;
  metadata: { type: 'entry_payment_request'; entry_ids: string; platform_fee_percent: string };
  payment_intent_data: { metadata: { type: 'entry_payment_request'; entry_ids: string } };
  /** Present only when a disclosure string is supplied — Stripe shows it above
   *  the Pay button, so the payer sees the policy before paying. */
  custom_text?: { submit: { message: string } };
}

/** Stripe caps custom_text.submit.message at 1200 chars. */
const CUSTOM_TEXT_MAX = 1200;

export function buildEntryPaymentLinkSession(
  input: BuildEntryPaymentLinkInput
): EntryPaymentLinkSessionParams {
  if (input.entries.length === 0) {
    // An empty session would create a $0 (or chargeless) link — never useful and
    // a sign the caller filtered everything out. Fail loud.
    throw new Error('buildEntryPaymentLinkSession: no entries to charge');
  }

  const lineItems: LineItem[] = input.entries.map(e => ({
    price_data: {
      currency: 'usd',
      unit_amount: e.authoritativeFeeCents,
      product_data: {
        name: `${e.dogName} - ${e.className}`,
        description: e.showName,
        metadata: { type: 'entry', entry_id: e.entryId },
      },
    },
    quantity: 1,
  }));

  // Platform fee ON TOP (fee-on-top decision — the exhibitor pays it), summed
  // from the authoritative per-entry fees, mirroring stripe-checkout exactly.
  const subtotal = input.entries.reduce((sum, e) => sum + e.authoritativeFeeCents, 0);
  const platformFeeCents = calculatePlatformFeeCents(subtotal, input.platformFeePercent);
  if (platformFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: platformFeeCents,
        product_data: {
          name: 'Platform Fee',
          description: 'Online entry processing fee',
          metadata: { type: 'platform_fee' },
        },
      },
      quantity: 1,
    });
  }

  // Stripe metadata values are strings; JSON-encode the id list so the webhook
  // reconciles the exact entries this link was built for (anti-tamper carrier).
  const entryIdsJson = JSON.stringify(input.entries.map(e => e.entryId));

  const disclosure = input.withdrawalPolicyText?.trim();

  return {
    mode: 'payment',
    line_items: lineItems,
    expires_at: input.expiresAtEpoch,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      type: 'entry_payment_request',
      entry_ids: entryIdsJson,
      // Stamp the rate this link was computed with so the webhook validates
      // against the exact charged rate, not a live re-read that could drift.
      platform_fee_percent: String(input.platformFeePercent),
    },
    payment_intent_data: {
      metadata: { type: 'entry_payment_request', entry_ids: entryIdsJson },
    },
    ...(disclosure
      ? { custom_text: { submit: { message: disclosure.slice(0, CUSTOM_TEXT_MAX) } } }
      : {}),
  };
}
