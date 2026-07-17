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

  it('updates ONLY refunded_cents in the refund path (no charge-fact rewrite)', () => {
    const start = webhookSource.indexOf('async function handleChargeRefunded');
    const end = webhookSource.indexOf('\nasync function', start + 1);
    const body = webhookSource.slice(start, end);
    expect(body).toContain('refunded_cents: charge.amount_refunded');
    // The refund path must not touch the immutable charge facts.
    expect(body).not.toContain('platform_fee_cents');
    expect(body).not.toContain('entry_subtotal_cents');
    expect(body).not.toContain('stripe_processing_fee_cents');
  });

  it('tolerates delayed balance-transaction data by alerting pending, not zeroing', () => {
    expect(webhookSource).toContain('warnMissingProcessingFee');
    expect(webhookSource).toContain('net income cannot be finalized');
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
