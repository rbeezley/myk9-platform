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
    expect(webhookSource).toContain('deriveEntryFeeFromTotalCents');
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

  it('records the cumulative refund for EVERY refund source, before any early return', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    const ledgerWrite = body.indexOf('recordCumulativeRefundedCents(');
    const appRefundEarlyReturn = body.indexOf('if (allFromAppRefund) {');
    expect(ledgerWrite).toBeGreaterThan(-1);
    // App-originated refunds (per-entry, auto-refund, show refund) return early;
    // the refund must already be recorded by then or reconciliation understates it.
    expect(ledgerWrite).toBeLessThan(appRefundEarlyReturn);
    expect(body).toContain('charge.amount_refunded ?? 0');
  });

  it('keeps amount_cents GROSS at the cart insert (no pre-netted overflow refund)', () => {
    // Collection invariant: pre-netting the overflow refund out of amount_cents
    // AND recording it in refunded_cents double-subtracts it (review finding A).
    expect(webhookSource).toContain('amount_cents: freshTotalCents');
    // Word-boundary: metadata.paid_amount_cents legitimately carries the
    // paid-only figure; the amount_cents COLUMN must not.
    expect(webhookSource).not.toMatch(/\bamount_cents: paidOrderAmountCents/);
  });

  it('records the cart-overflow auto-refund it issues itself', () => {
    const start = webhookSource.indexOf('async function issueCartOverflowAutoRefund');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain('recordCumulativeRefundedCents(input.paymentIntentId!, refund.amount)');
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
  it('adds the five immutable snapshot columns', () => {
    for (const col of [
      'entry_subtotal_cents',
      'platform_fee_cents',
      'platform_fee_rate',
      'stripe_processing_fee_cents',
      'refunded_cents',
    ]) {
      expect(migrationSource).toContain(col);
    }
  });

  it('defaults refunded_cents to 0 and keeps it NOT NULL', () => {
    expect(migrationSource).toMatch(/refunded_cents integer NOT NULL DEFAULT 0/);
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
    expect(migrationSource.toLowerCase()).toContain('no historical backfill');
  });
});
