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
const payoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/cron-process-payouts/index.ts'),
  'utf8'
);

describe('Stripe persisted-id mode scoping', () => {
  it('scopes checkout customer and club-account lookups by livemode', () => {
    expect(checkoutSource).toContain('isStripeLiveMode(stripeSecret)');
    expect(checkoutSource).toContain(".eq('livemode', stripeLivemode)");
    expect(checkoutSource).toContain('livemode: stripeLivemode');
    expect(checkoutSource).toContain('isStripeResourceMissing');
  });

  it('scopes customer portal lookup by livemode', () => {
    expect(portalSource).toContain('isStripeLiveMode(stripeSecret)');
    expect(portalSource).toContain(".eq('livemode', stripeLivemode)");
  });

  it('scopes connect onboarding reuse and insert by livemode', () => {
    expect(connectSource).toContain('isStripeLiveMode(stripeSecret)');
    expect(connectSource).toContain(".eq('livemode', stripeLivemode)");
    expect(connectSource).toContain('livemode: stripeLivemode');
  });

  it('stamps connected account webhook rows with Stripe livemode', () => {
    expect(webhookSource).toContain('accountToRowPatch(account)');
    expect(
      readFileSync(
        resolve(__dirname, '../../../supabase/functions/_shared/connectAccountMapper.ts'),
        'utf8'
      )
    ).toContain('livemode: account.livemode === true');
  });

  it('payout cron skips and alerts when the connected account mode mismatches the running key', () => {
    expect(payoutSource).toContain('isStripeLiveMode(stripeSecret)');
    expect(payoutSource).toContain('mode_mismatch');
    expect(payoutSource).toContain('Payout skipped for Stripe mode mismatch');
  });
});
