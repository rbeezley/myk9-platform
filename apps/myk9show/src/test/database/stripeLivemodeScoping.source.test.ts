import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);
const portalSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-customer-portal/index.ts'),
  'utf8'
);
const connectSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-connect-onboard/index.ts'),
  'utf8'
);
const webhookSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const paymentLinkSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-payment-link/index.ts'),
  'utf8'
);
// MYK9-2170 moved the per-show flow from index.ts to processShow.ts.
const payoutSource = ['index.ts', 'processShow.ts']
  .map(file =>
    readFileSync(
      resolve(__dirname, '../../../supabase/functions/cron-process-payouts', file),
      'utf8'
    )
  )
  .join('\n');

function requireSlice(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThanOrEqual(0);
  return source.slice(startIndex, endIndex);
}

describe('Stripe persisted-id mode scoping', () => {
  it('scopes checkout customer and club-account lookups by livemode', () => {
    expect(checkoutSource).toContain('requireStripeLivemode(stripeSecret)');
    expect(checkoutSource).toContain(".eq('livemode', stripeLivemode)");
    expect(checkoutSource).toContain('livemode: stripeLivemode');
    expect(checkoutSource).toContain('isStripeResourceMissing');
  });

  it('scopes customer portal lookup by livemode', () => {
    expect(portalSource).toContain('requireStripeLivemode(stripeSecret)');
    expect(portalSource).toContain(".eq('livemode', stripeLivemode)");
  });

  it('scopes connect onboarding reuse and insert by livemode', () => {
    expect(connectSource).toContain('requireStripeLivemode(stripeSecret)');
    expect(connectSource).toContain(".eq('livemode', stripeLivemode)");
    expect(connectSource).toContain('livemode: stripeLivemode');
  });

  it('stamps connected account webhook rows with Stripe livemode', () => {
    // MYK9-2187: from the event, never the account payload (which has none).
    expect(webhookSource).toContain('event.id, event.livemode)');
    expect(webhookSource).toContain('accountToRowPatch(account, livemode)');
  });

  it('scopes secretary payment-link club-account readiness by livemode', () => {
    const clubAccountLookup = requireSlice(
      paymentLinkSource,
      ".from('club_stripe_accounts')",
      '.maybeSingle()'
    );

    expect(paymentLinkSource).toContain('requireStripeLivemode(stripeSecret)');
    expect(clubAccountLookup).toContain(".eq('club_id', show.club_id)");
    expect(clubAccountLookup).toContain(".eq('livemode', stripeLivemode)");
  });

  it('scopes cart payment history customer lookup by livemode', () => {
    const cartCustomerLookup = requireSlice(
      webhookSource,
      'const { data: stripeCustomer } = ctx.exhibitorPersonId',
      '// Immutable financial snapshot'
    );

    expect(cartCustomerLookup).toContain(".from('stripe_customers')");
    expect(cartCustomerLookup).toContain(".eq('person_id', ctx.exhibitorPersonId)");
    expect(cartCustomerLookup).toContain(".eq('livemode', stripeLivemode)");
  });

  it('payout cron skips and alerts when the connected account mode mismatches the running key', () => {
    expect(payoutSource).toContain('stripeKeyMode(stripeSecret)');
    expect(payoutSource).toContain('mode_mismatch');
    expect(payoutSource).toContain('Payout skipped for Stripe mode mismatch');
  });
});
