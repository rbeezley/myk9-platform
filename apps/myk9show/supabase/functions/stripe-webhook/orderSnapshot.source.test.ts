// Source-pins the immutable Stripe order snapshot wiring (financial-reconciliation,
// MYK9-54). index.ts reads Deno.env at module scope and cannot be imported under
// plain vitest, so — following the source-text-regression convention (#624) — we
// assert against the file text. Grep this file before touching the snapshot
// population at the three stripe_orders insert sites or the refund path.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhookSource = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
const migrationSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260717120000_stripe_order_snapshots.sql'
  ),
  'utf8'
);

describe('stripe-webhook snapshot wiring (source-pinned)', () => {
  it('imports the pure snapshot helpers', () => {
    expect(webhookSource).toContain('buildOrderSnapshotFields');
    expect(webhookSource).toContain('extractProcessingFeeCents');
    // The payment-link snapshot is built from the ACCEPTED entries, never
    // back-derived from the gross session total (review finding 2): deriving it
    // from the total made `amount == subtotal + fee` true by construction, so a
    // make-whole refund guaranteed a false Mismatch and the tie-out was a
    // tautology on that path.
    expect(webhookSource).toContain('resolveAcceptedEntrySnapshot');
    expect(webhookSource).not.toContain('deriveEntryFeeFromTotalCents');
  });

  it('fetches the charge balance transaction to capture the processing fee', () => {
    expect(webhookSource).toContain("expand: ['latest_charge.balance_transaction']");
  });

  it('spreads snapshot fields into all THREE stripe_orders inserts', () => {
    const spreads = webhookSource.match(/\.\.\.buildOrderSnapshotFields\(/g) ?? [];
    expect(spreads.length).toBe(3);
  });

  it('never rewrites the immutable charge facts in the refund path', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    // The refund path must not touch the immutable charge facts.
    expect(body).not.toContain('platform_fee_cents');
    expect(body).not.toContain('entry_subtotal_cents');
    expect(body).not.toContain('stripe_processing_fee_cents');
  });

  it('records the refunds for EVERY refund source, before any early return', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    const ledgerWrite = body.indexOf('recordOrderRefundCents(');
    const appRefundEarlyReturn = body.indexOf('if (allFromAppRefund) {');
    expect(ledgerWrite).toBeGreaterThan(-1);
    // App-originated refunds (per-entry, auto-refund, show refund) return early;
    // the refunds must already be recorded by then or reconciliation understates.
    expect(ledgerWrite).toBeLessThan(appRefundEarlyReturn);
  });

  it('books ONE LEDGER ROW PER REFUND, never a guess from the cumulative total', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    // `charge.amount_refunded` is a CUMULATIVE total across both refund kinds;
    // deriving the split from it is what forced the monotonic counters. Stripe
    // carries the individual refunds on charge.refunds.data.
    expect(body).toMatch(/for \(const refund of refunds\)/);
    expect(body).toMatch(/refundId:\s*refund\.id/);
    expect(body).toMatch(/amountCents:\s*refund\.amount \?\? 0/);
    expect(body).toMatch(/kind:\s*'post_hoc'/);
    expect(body).not.toMatch(/chargeTotalCents/);
    expect(body).not.toMatch(/amountCents:\s*charge\.amount_refunded/);
  });

  it('expands the refund list when the payload lacks it, and NEVER throws on failure', () => {
    const start = webhookSource.indexOf('async function resolveChargeRefunds');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain('stripe.refunds.list');
    // A bookkeeping failure must not disturb a committed payment: return null,
    // let the caller alert, and leave the ledger untouched.
    expect(body).toContain('return null');
    expect(body).not.toContain('throw');
    const handler = webhookSource.slice(
      webhookSource.indexOf('async function handleChargeRefunded'),
      webhookSource.indexOf(
        '\nasync function',
        webhookSource.indexOf('async function handleChargeRefunded') + 1
      )
    );
    expect(handler).toContain('resolvedRefunds === null');
    expect(handler).toContain('order ledger NOT updated');
  });

  it('skips refunds Stripe already reports as failed/canceled', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toMatch(/refund\.status === 'failed' \|\| refund\.status === 'canceled'/);
  });

  it('FAILS CLOSED: does not stamp refunded when the amount did not persist', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    // The ledger write returns null when the amount did not persist; the handler
    // must bail out THERE rather than continuing. Otherwise the order reads
    // refunded with 0 refunded cents and the drift is invisible to attention
    // logic precisely because the status already says refunded (finding 5).
    const guard = body.indexOf('if (recordedRows === null) {');
    expect(guard).toBeGreaterThan(-1);
    expect(body).toContain('deliberately NOT marking the order refunded');

    // And there must be NO blanket status stamp in this handler: the status
    // transition happens atomically inside record_order_refund_cents, which
    // stamps 'refunded' IFF fully refunded. A blanket update here would mark a
    // PARTIALLY refunded order as fully refunded (finding 1).
    expect(body).not.toMatch(/\.update\(\{[^}]*status: 'refunded'/s);
  });

  it('uses the ATOMIC SQL compare-and-set, not a read-then-write JS max', () => {
    const start = webhookSource.indexOf('async function recordOrderRefundCents');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain("supabase.rpc('record_order_refund_cents'");
    // A select-then-update here is the non-atomic pattern that let two
    // concurrent deliveries both read 0 (review finding 4).
    expect(body).not.toContain(".from('stripe_orders')");
    expect(body).not.toContain('resolveCumulativeRefundedCents');
  });

  it('keeps amount_cents GROSS at the cart insert (no pre-netted overflow refund)', () => {
    // Collection invariant: pre-netting the overflow refund out of amount_cents
    // AND recording it in refunded_cents double-subtracts it (review finding A).
    expect(webhookSource).toContain('amount_cents: freshTotalCents');
    // Word-boundary: metadata.paid_amount_cents legitimately carries the
    // paid-only figure; the amount_cents COLUMN must not.
    expect(webhookSource).not.toMatch(/\bamount_cents: paidOrderAmountCents/);
  });

  it('records the cart-overflow auto-refund it issues as MAKE-WHOLE, not post-hoc', () => {
    const start = webhookSource.indexOf('async function issueCartOverflowAutoRefund');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain('recordOrderRefundCents(input.paymentIntentId!, {');
    // Cart overflow refunds lines NEVER accepted: no fee earned, no club
    // transfer, so it must never land in refunded_cents as a platform loss.
    expect(body).toMatch(/kind:\s*'make_whole'/);
    expect(body).toMatch(/amountCents:\s*refund\.amount/);
    expect(body).not.toContain('chargeTotalCents');
    // The Stripe refund id is the ledger PRIMARY KEY, so a duplicate delivery is
    // an upsert of the same row rather than a second add.
    expect(body).toMatch(/refundId:\s*refund\.id/);
    // Fail closed: an unwritten refund leaves the order looking collected in
    // full, so it must alert rather than continue silently (finding 5).
    expect(body).toContain('recordedRows === null || recordedRows.length === 0');
    // No status stamp here — record_order_refund_cents owns the transition and
    // stamps 'refunded' IFF fully refunded.
    expect(body).not.toMatch(/\.update\(\{[^}]*status: 'refunded'/s);
  });

  it('records the payment-link make-whole auto-refund as MAKE-WHOLE too', () => {
    const start = webhookSource.indexOf('async function issueEntryPaymentAutoRefund');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain('recordOrderRefundCents(input.paymentIntentId, {');
    expect(body).toMatch(/kind:\s*'make_whole'/);
    expect(body).toMatch(/amountCents:\s*refund\.amount/);
    expect(body).not.toContain('chargeTotalCents');
    expect(body).toMatch(/refundId:\s*refund\.id/);
    expect(body).toContain('recordedRows === null || recordedRows.length === 0');
    expect(body).not.toMatch(/\.update\(\{[^}]*status: 'refunded'/s);
  });

  it('tolerates delayed balance-transaction data by alerting pending, not zeroing', () => {
    expect(webhookSource).toContain('warnMissingProcessingFee');
    expect(webhookSource).toContain('net income cannot be finalized');
  });

  it('does NOT claim the pending processing fee self-heals (nothing retries it)', () => {
    const start = webhookSource.indexOf('async function warnMissingProcessingFee');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).not.toMatch(/self-heals/);
    expect(body).toContain('MANUAL BACKFILL REQUIRED');
    expect(body).toContain('does NOT resolve on its own');
  });
});

describe('stripe_order_snapshots migration (source-pinned)', () => {
  it('adds the six snapshot columns', () => {
    for (const col of [
      'entry_subtotal_cents',
      'platform_fee_cents',
      'platform_fee_rate',
      'stripe_processing_fee_cents',
      'refunded_cents',
      'make_whole_refunded_cents',
    ]) {
      expect(migrationSource).toContain(col);
    }
  });

  it('defaults BOTH refund columns to 0, NOT NULL, non-negative', () => {
    expect(migrationSource).toMatch(/\brefunded_cents integer NOT NULL DEFAULT 0/);
    expect(migrationSource).toMatch(/make_whole_refunded_cents integer NOT NULL DEFAULT 0/);
    expect(migrationSource).toMatch(/CHECK \(make_whole_refunded_cents >= 0\)/);
  });

  it('documents the refund-attribution invariant that separates the two columns', () => {
    expect(migrationSource).toContain(
      'collected = amount_cents − make_whole_refunded_cents − refunded_cents'
    );
    // The make-whole column must be documented as NOT a platform loss, or a
    // consumer will subtract it from net income again.
    expect(migrationSource).toMatch(/NOT a platform loss/);
    expect(migrationSource).toMatch(/POST-HOC refunds only/);
  });

  it('creates the per-refund LEDGER keyed on the Stripe refund id', () => {
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.stripe_order_refunds');
    expect(migrationSource).toMatch(/stripe_refund_id text PRIMARY KEY/);
    expect(migrationSource).toMatch(
      /kind text NOT NULL CHECK \(kind IN \('make_whole', 'post_hoc'\)\)/
    );
    expect(migrationSource).toMatch(/state text NOT NULL DEFAULT 'succeeded'/);
    // The array columns the counters used as idempotency keys are gone; the
    // ledger primary key replaces both.
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS make_whole_refund_ids');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS reversed_refund_ids');
  });

  it('locks the money ledger down: RLS FORCEd, service_role only, no client grants', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE public.stripe_order_refunds ENABLE ROW LEVEL SECURITY'
    );
    expect(migrationSource).toContain(
      'ALTER TABLE public.stripe_order_refunds FORCE ROW LEVEL SECURITY'
    );
    expect(migrationSource).toContain(
      'REVOKE ALL ON public.stripe_order_refunds FROM anon, authenticated'
    );
    expect(migrationSource).toContain('GRANT ALL ON public.stripe_order_refunds TO service_role');
    expect(migrationSource).not.toMatch(
      /GRANT[^;]*ON public\.stripe_order_refunds[^;]*TO (anon|authenticated)/
    );
  });

  it('exposes the refund RPCs, service_role only, with a locked search_path', () => {
    expect(migrationSource).toContain('CREATE FUNCTION public.record_order_refund_cents');
    expect(migrationSource).toContain('CREATE FUNCTION public.recompute_order_refund_totals');
    expect(migrationSource).toContain('SECURITY DEFINER');
    expect(migrationSource).toContain("SET search_path = ''");
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.record_order_refund_cents/);
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_order_refund_cents\(text, text, integer, text\)\s*\n?\s*TO service_role/
    );
    // No client role may execute a money write.
    expect(migrationSource).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_order_refund_cents[^;]*TO (anon|authenticated)/
    );
  });

  it('DERIVES the two columns from the ledger instead of incrementing counters', () => {
    // Monotonic counters cannot represent "this refund was un-done", which is how
    // a redelivered charge.refunded silently undid a refund.failed reversal.
    expect(migrationSource).toMatch(
      /FILTER \(WHERE f\.kind = 'make_whole' AND f\.state = 'succeeded'\)/
    );
    expect(migrationSource).toMatch(
      /FILTER \(WHERE f\.kind = 'post_hoc' AND f\.state = 'succeeded'\)/
    );
    expect(migrationSource).toMatch(/UPDATE public\.stripe_orders AS o/);
    // The reversal is a STATE CHANGE, never a subtraction.
    expect(migrationSource).toMatch(/SET state = 'failed'/);
    expect(migrationSource).toContain('FAILED IS TERMINAL');
  });

  it('is RE-RUNNABLE: drops BOTH the old and the new RPC signatures first', () => {
    for (const sig of [
      'DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, integer)',
      'DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, text, integer)',
      'DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, text, integer, text)',
      'DROP FUNCTION IF EXISTS public.reverse_order_refund_cents(text, text, integer)',
      'DROP FUNCTION IF EXISTS public.recompute_order_refund_totals(text)',
    ]) {
      expect(migrationSource).toContain(sig);
    }
  });

  it('declares explicit read-only client grants and service-role write access', () => {
    expect(migrationSource).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.stripe_orders FROM authenticated, anon'
    );
    expect(migrationSource).toContain('GRANT SELECT ON public.stripe_orders TO authenticated');
    expect(migrationSource).toContain('GRANT ALL ON public.stripe_orders TO service_role');
    // Client code must never gain a write grant to the money table.
    expect(migrationSource).not.toMatch(
      /GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/
    );
  });

  it('documents a reversible down path without rewriting historical facts', () => {
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS stripe_processing_fee_cents');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS make_whole_refunded_cents');
    expect(migrationSource).toContain('DROP FUNCTION IF EXISTS public.record_order_refund_cents');
    expect(migrationSource.toLowerCase()).toContain('no historical backfill');
  });
});
