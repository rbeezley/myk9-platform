import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const webhookSource = readFileSync(
  resolve(root, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

const migrationSql = readdirSync(resolve(root, 'supabase/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');
const capacityGateMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260628202146_create_online_paid_entry_capacity_gate.sql'),
  'utf8'
);
const compactCapacityGateMigration = capacityGateMigration.replace(/\s+/g, ' ');

describe('stripe webhook online cart capacity gate', () => {
  it('routes paid cart entry creation through the atomic capacity RPC', () => {
    expect(webhookSource).toContain("rpc('create_online_paid_entry'");
    expect(webhookSource).not.toContain(
      ".from('entries')\n      .insert(\n        buildEntryInsert"
    );
  });

  it('marks recovered existing entries paid instead of inserting duplicate rows', () => {
    expect(webhookSource).toContain('entry_id,');
    expect(webhookSource).toContain('if (item.entry_id)');
    expect(webhookSource).toContain("payment_status: 'paid'");
    expect(webhookSource).toContain("payment_method: 'online'");
    expect(webhookSource).toContain(".eq('payment_status', 'pending')");
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS entry_id uuid');
    expect(migrationSql).toContain('entry_cart_items_entry_id_idx');
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
    expect(migrationSql).toContain('COALESCE(c.allow_waitlist, false)');
    expect(migrationSql).toContain("outcome := 'denied'");
    expect(migrationSql).toContain('INSERT INTO public.waitlist_entries');
    expect(migrationSql).toContain('joined_via');
    expect(migrationSql).toContain("'online'");
    expect(migrationSql).toContain("outcome := 'waitlisted'");
  });

  it('makes waitlist overflow idempotent for an active dog/class row', () => {
    expect(migrationSql).toContain('waitlist_entries_active_class_dog_key');
    expect(migrationSql).toContain("WHERE status IN ('waiting', 'offered')");
    expect(capacityGateMigration).toContain('AND dog_id = p_dog_id');
    expect(capacityGateMigration).toContain('IF FOUND THEN');
    expect(capacityGateMigration).toContain('waitlist_entry_id := v_waitlist_entry.id');
  });

  it('refunds no-service overflow lines instead of leaving paid missing entries', () => {
    expect(webhookSource).toContain('decideCartOverflowRefund');
    expect(webhookSource).toContain('issueCartOverflowAutoRefund');
    expect(webhookSource).toContain("type: 'entry_cart_overflow_auto_refund'");
    expect(webhookSource).toContain('waitlistedCartItemIds');
    expect(webhookSource).toContain('deniedCartItemIds');
    expect(webhookSource).not.toContain('Paid entries missing — manual reconciliation needed');
  });

  it('keeps stripe_orders scoped to paid entries and records overflow explicitly', () => {
    expect(webhookSource).toContain('amount_cents: paidOrderAmountCents');
    expect(webhookSource).toContain('entry_ids: entryIds');
    expect(webhookSource).toContain('collected_amount_cents');
    expect(webhookSource).toContain('overflow_refund');
    expect(webhookSource).toContain('waitlisted_cart_item_ids');
    expect(webhookSource).toContain('denied_cart_item_ids');
  });

  it('keeps the online capacity RPC service-role only', () => {
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.create_online_paid_entry');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.create_online_paid_entry');
    expect(migrationSql).toContain('TO service_role');
    expect(migrationSql).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid) TO authenticated'
    );
  });
});
