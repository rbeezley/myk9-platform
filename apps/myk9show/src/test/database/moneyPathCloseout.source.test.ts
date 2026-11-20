import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhookSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
// MP-04: the request-level webhook envelope (verify signature, dispatch to
// the handler, map crashes to a 500) was extracted from index.ts into
// webhookHandler.ts (MYK9-41). The "await the handler so a crash yields a
// non-2xx that Stripe retries" invariant now lives there.
const webhookHandlerSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/webhookHandler.ts'),
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
const refundShowSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-refund-show/index.ts'),
  'utf8'
);
const payoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/cron-process-payouts/index.ts'),
  'utf8'
);
const freshSessionGateSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/freshSessionGate.ts'),
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
    // The dispatch call is awaited inside the try block, so a handler crash
    // rejects the promise, is caught, and returns a 500 — Stripe then retries.
    // Removing this await (fire-and-forget dispatch) would let a crash ack 2xx.
    expect(webhookHandlerSource).toContain('await deps.dispatch(event)');
    // Guard against re-introducing a fire-and-forget ack that swallows crashes.
    expect(webhookHandlerSource).not.toContain('EdgeRuntime.waitUntil');
    expect(webhookHandlerSource).not.toContain('Stripe already received its 200');
    // index.ts must actually wire the real event handler into that awaited
    // dispatch slot — otherwise the awaited call above would be a no-op.
    expect(webhookSource).toContain('dispatch: handleEvent');
    expect(webhookSource).not.toContain('EdgeRuntime.waitUntil');
  });

  it('keeps entry checkout card-only and refuses unpaid fresh sessions', () => {
    expect(checkoutSource).toContain("payment_method_types: ['card']");
    // MP-05/MP-07: the unpaid-session refusal lives in the shared
    // decideFreshSessionGate decision, called on the fresh retrieve by both
    // entry payment handlers (cart checkout + payment link).
    expect(webhookSource).toContain('decideFreshSessionGate(freshSession)');
    expect(freshSessionGateSource).toContain("fresh.payment_status !== 'paid'");
  });

  it('serializes per-show refund and payout critical sections with show_money_locks', () => {
    expect(refundEntrySource).toContain('acquireShowMoneyLock');
    expect(refundEntrySource).toContain("holder: 'stripe-refund-entry'");
    expect(refundShowSource).toContain('acquireShowMoneyLock');
    expect(refundShowSource).toContain("holder: 'stripe-refund-show'");
    expect(payoutSource).toContain('acquireShowMoneyLock');
    expect(payoutSource).toContain("holder: 'cron-process-payouts'");
    expect(payoutSource).toContain('money_lock_busy: 0');
  });

  it('does not overwrite a stronger existing entry refund stamp', () => {
    expect(refundEntrySource).toContain(".eq('payment_status', 'paid')");
    expect(refundEntrySource).toContain(".or('refund_amount.is.null,refund_amount.eq.0')");
  });

  // SA-2026-09-05-02 was raised against this function and was WRONG: the audit
  // read secretMatches() in isolation and concluded that an unset
  // PAYOUT_CRON_SECRET would let `x-function-secret: undefined` authenticate,
  // because TextEncoder.encode(undefined) encodes the string "undefined". The
  // module-load guard below makes that unreachable — Deno.serve is never
  // registered, so every request fails. cron-health-check has the identical
  // guard and cronHealthCheck.source.test.ts already pins it; this is the same
  // assertion for the money-moving twin, which had none.
  //
  // MYK9-2187 moved the Stripe key out of the boot guard: a missing or
  // unrecognised key now reaches the operator alert in the handler instead of
  // failing the function silently at load. The database and cron secrets still
  // fail closed at boot.
  //
  // Both regexes require real code, not a comment mentioning the names, and
  // deleting either guard makes this test red rather than merely un-asserted.
  it('fails closed on missing DB and cron secrets at boot, and on a missing or unknown Stripe key at request time with an alert', () => {
    const requiredEnvironmentGuard = payoutSource.match(
      /if \(!supabaseUrl \|\| !supabaseServiceKey \|\| !cronSecret\) \{[\s\S]*?\}/
    )?.[0];

    expect(
      requiredEnvironmentGuard,
      'cron-process-payouts must fail closed at module load on a missing DB or cron secret'
    ).toBeDefined();
    expect(requiredEnvironmentGuard).toContain('throw new Error');

    const stripeKeyRefusal = payoutSource.match(
      /if \(\(await refuseUnknownKeyMode\([^)]*\)\) \|\| !stripeSecret\) \{\s*return Response\.json\([^;]*\);/
    )?.[0];

    expect(
      stripeKeyRefusal,
      'cron-process-payouts must refuse a missing or unknown Stripe key before any money work'
    ).toBeDefined();
    expect(stripeKeyRefusal).toContain('status: 500');
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
