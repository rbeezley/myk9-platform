/**
 * MYK9-229 — the fee line item on the CART checkout session.
 *
 * `_shared/entryPaymentLink.ts` has a behavioural test (its session builder is a
 * pure function). `stripe-checkout/index.ts` does not and cannot here: it is a
 * Deno edge function that builds its line items inline against the Stripe SDK.
 * So this is a source assertion — the repo's established fallback for that
 * function (see stripeCheckoutCloseGuard.source.test.ts) — and it is only
 * defensible because the thing being asserted IS a literal string handed to
 * Stripe, not a behaviour standing in for one.
 *
 * Two invariants, both of which a rename could quietly break:
 *
 *  1. The line must not describe the WHOLE fee as processing. Part of it is
 *     Stripe's card processing and part is myK9Show's; "Online entry processing
 *     fee" said otherwise on every receipt.
 *  2. There must be exactly ONE fee line. The exact processing cost is unknown
 *     until the balance transaction settles, so splitting the receipt into the
 *     estimated components /fees publishes would state an estimate as though it
 *     were exact — and when the real fee differs (Amex, international) the
 *     receipt would name a number that never happened.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '../../..');

const PRODUCERS = [
  ['stripe-checkout', 'supabase/functions/stripe-checkout/index.ts'],
  ['entry payment link', 'supabase/functions/_shared/entryPaymentLink.ts'],
] as const;

describe.each(PRODUCERS)('%s fee line item', (_label, path) => {
  const source = readFileSync(resolve(APP_ROOT, path), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  it('names the charge a service fee, not a processing fee', () => {
    expect(code).toContain("name: 'Service fee'");
    expect(code).toContain("description: 'Card processing and myK9Show'");
  });

  it('no longer calls the whole fee "processing"', () => {
    expect(code).not.toContain('Online entry processing fee');
    expect(code).not.toContain("name: 'Platform Fee'");
  });

  it('builds exactly one fee line — the receipt is never split into estimates', () => {
    expect(code.match(/name: 'Service fee'/g)).toHaveLength(1);
    // No line item named after either half of the split...
    expect(code).not.toMatch(/name: '[^']*[Cc]ard processing[^']*'/);
    // ...and no estimated split reaching the charge builder at all. (A bare
    // `name: 'myK9Show'` would be too loose to assert: stripe-checkout passes
    // exactly that as Stripe's appInfo, which is not a line item.)
    expect(code).not.toMatch(/cardProcessingCents|splitPlatformFee|estimateCardProcessing/);
  });
});
