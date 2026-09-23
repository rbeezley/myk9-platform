import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const webhookSource = readFileSync(
  resolve(root, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const allMigrationSql = readdirSync(resolve(root, 'supabase/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');

const capacityGateMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260628202146_create_online_paid_entry_capacity_gate.sql'),
  'utf8'
);
const recoveredCartMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260906140000_link_recovered_cart_items_to_entries.sql'),
  'utf8'
);
const settlementMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260923022007_myk9_639_authoritative_entry_settlement.sql'),
  'utf8'
);
const lineageMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260923021937_myk9_639_entry_payment_lineage.sql'),
  'utf8'
);
const compactCapacityGateMigration = capacityGateMigration.replace(/\s+/g, ' ');

describe('stripe webhook online cart capacity gate', () => {
  it('fresh-verifies and refunds a paid session when its cart is missing', () => {
    const missingCartStart = webhookSource.indexOf('if (cartError || !cart)');
    const missingCartEnd = webhookSource.indexOf('\n  const freshSession =', missingCartStart);
    const missingCartPath = webhookSource.slice(missingCartStart, missingCartEnd);

    expect(missingCartPath).toContain('stripe.checkout.sessions.retrieve(session.id)');
    expect(missingCartPath).toContain('decideFreshSessionGate(missingCartSession)');
    expect(missingCartPath).toContain('issueCartOverflowAutoRefund(');
    expect(missingCartPath).toContain('fullCartRefundDecision(missingCartGate.amountTotalCents');
    expect(missingCartPath).toContain('invalidCartItemIds: []');
  });

  it('routes cart and payment-link settlement through one SQL authority', () => {
    expect(webhookSource.match(/'settle_entry_order'/g)).toHaveLength(2);
    expect(webhookSource).toContain('loadEntrySettlementLinePricesFromStripe');
    expect(webhookSource).toContain("'cart_item_id'");
    expect(webhookSource).toContain("'entry_id'");
    expect(webhookSource).not.toContain('reconcileEntryPaymentRequest');
    expect(webhookSource).not.toContain('resolvePaidWaitlistOffers');
  });

  it('keeps capacity creation and recovered lineage resolution in SQL', () => {
    expect(settlementMigration).toContain('public.create_online_paid_entry');
    expect(settlementMigration).toContain('resolve_entry_payment_lineage');
    expect(lineageMigration).toContain('quote_entry_payment_lineage');
    expect(settlementMigration).toContain("payment_status = 'paid'");
    expect(settlementMigration).toContain("payment_method = 'online'");
    expect(settlementMigration).toContain("entry_status = 'confirmed'");
    expect(settlementMigration).toContain("status = 'accepted'");
    expect(webhookSource).not.toContain(".from('entries').update({");
    expect(recoveredCartMigration).toContain('ADD COLUMN IF NOT EXISTS entry_id uuid');
    expect(recoveredCartMigration).toContain('entry_cart_items_entry_id_idx');
    expect(recoveredCartMigration.toLowerCase()).toContain(
      'after update of dog_id, class_id, entry_id'
    );
    expect(recoveredCartMigration.toLowerCase()).toContain(
      'old.entry_id is distinct from new.entry_id'
    );
    expect(recoveredCartMigration).toContain("TG_OP = 'DELETE'");
    expect(recoveredCartMigration).toContain('RETURN OLD');
  });

  it('locks each judge-day before reading capacity and inserting the online entry', () => {
    expect(capacityGateMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.create_online_paid_entry'
    );
    expect(capacityGateMigration).toContain('RETURNS TABLE');
    expect(capacityGateMigration).toContain('outcome text');
    expect(capacityGateMigration).toContain('VOLATILE');
    expect(compactCapacityGateMigration).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
    expect(capacityGateMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_judge_day_capacity_live'
    );
    expect(capacityGateMigration).toContain('FROM public.get_judge_day_capacity_live');
    expect(capacityGateMigration).not.toContain('FROM public.get_judge_day_capacity(');
    expect(capacityGateMigration).toContain('SELECT COUNT(*)');
    expect(capacityGateMigration).toContain('v_capacity - v_confirmed - v_reserved');
    expect(capacityGateMigration).toContain('INSERT INTO public.entries');
  });

  it('routes paid overflow through existing class waitlist policy', () => {
    expect(capacityGateMigration).toContain('COALESCE(c.allow_waitlist, false)');
    expect(capacityGateMigration).toContain("outcome := 'denied'");
    expect(capacityGateMigration).toContain('INSERT INTO public.waitlist_entries');
    expect(capacityGateMigration).toContain('joined_via');
    expect(capacityGateMigration).toContain("'online'");
    expect(capacityGateMigration).toContain("outcome := 'waitlisted'");
  });

  it('makes waitlist overflow idempotent for an active dog/class row', () => {
    expect(capacityGateMigration).toContain('waitlist_entries_active_class_dog_key');
    expect(capacityGateMigration).toContain("WHERE status IN ('waiting', 'offered')");
    expect(capacityGateMigration).toContain('AND dog_id = p_dog_id');
    expect(capacityGateMigration).toContain('IF FOUND THEN');
    expect(capacityGateMigration).toContain('waitlist_entry_id := v_waitlist_entry.id');
  });

  it('refunds rejected settlement lines using the SQL-computed amount', () => {
    expect(webhookSource).toContain('expectedMakeWholeRefundCents');
    expect(webhookSource).toContain('issueCartOverflowAutoRefund');
    expect(webhookSource).toContain("type: 'entry_cart_overflow_auto_refund'");
    expect(webhookSource).toContain('waitlistedCartItemIds');
    expect(webhookSource).toContain('deniedCartItemIds');
  });

  it('persists exact issuance snapshots and gross overflow refund metadata', () => {
    expect(settlementMigration).toContain('entry_fee_snapshot');
    expect(settlementMigration).toContain("'overflow_refund'");
    expect(settlementMigration).toContain("'paid_amount_cents', p_verified_gross_cents");
    expect(settlementMigration).toContain('p_verified_gross_cents');
  });

  it('keeps the online capacity RPC service-role only', () => {
    expect(capacityGateMigration).toContain(
      'REVOKE ALL ON FUNCTION public.create_online_paid_entry'
    );
    expect(capacityGateMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.create_online_paid_entry'
    );
    expect(capacityGateMigration).toContain('TO service_role');
    expect(allMigrationSql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_online_paid_entry\([^;]+\)\s+TO\s+authenticated/i
    );
  });
});
