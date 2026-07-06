import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhookSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const checkoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);
const refundEntrySource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-refund-entry/index.ts'),
  'utf8'
);
const payoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/cron-process-payouts/index.ts'),
  'utf8'
);
const runbookSource = readFileSync(
  resolve(__dirname, '../../../../../docs/operations/go-live-runbook.md'),
  'utf8'
);
const stripeSetupSource = readFileSync(
  resolve(__dirname, '../../../../../docs/operations/stripe-platform-setup.md'),
  'utf8'
);

describe('money-path closeout source contracts', () => {
  it('awaits Stripe webhook handlers so handler crashes return non-2xx for Stripe retry', () => {
    expect(webhookSource).toContain('await handleEvent(event)');
    expect(webhookSource).not.toContain('EdgeRuntime.waitUntil');
    expect(webhookSource).not.toContain('Stripe already received its 200');
  });

  it('keeps entry checkout card-only and refuses unpaid fresh sessions', () => {
    expect(checkoutSource).toContain("payment_method_types: ['card']");
    expect(webhookSource).toContain("freshSession.payment_status !== 'paid'");
  });

  it('serializes per-show refund and payout critical sections with show_money_locks', () => {
    expect(refundEntrySource).toContain('acquireShowMoneyLock');
    expect(refundEntrySource).toContain("holder: 'stripe-refund-entry'");
    expect(payoutSource).toContain('acquireShowMoneyLock');
    expect(payoutSource).toContain("holder: 'cron-process-payouts'");
  });

  it('does not overwrite a stronger existing entry refund stamp', () => {
    expect(refundEntrySource).toContain(".eq('payment_status', 'paid')");
    expect(refundEntrySource).toContain(".or('refund_amount.is.null,refund_amount.eq.0')");
  });

  it('scopes go-live Stripe ID purge to sandbox rows after livemode columns exist', () => {
    expect(runbookSource).toContain('delete from stripe_customers where livemode = false');
    expect(runbookSource).toContain('delete from club_stripe_accounts where livemode = false');
    expect(stripeSetupSource).toMatch(
      /delete from public\.stripe_customers\s+where livemode = false/
    );
    expect(stripeSetupSource).toMatch(/where stripe_customer_id is not null\s+and not exists/);
    expect(stripeSetupSource).toMatch(
      /delete from public\.club_stripe_accounts\s+where livemode = false/
    );
  });
});
