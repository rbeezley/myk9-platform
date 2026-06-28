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
const compactMigrationSql = migrationSql.replace(/\s+/g, ' ');

describe('stripe webhook online cart capacity gate', () => {
  it('routes paid cart entry creation through the atomic capacity RPC', () => {
    expect(webhookSource).toContain("rpc('create_online_paid_entry'");
    expect(webhookSource).not.toContain(
      ".from('entries')\n      .insert(\n        buildEntryInsert"
    );
  });

  it('locks each judge-day before reading capacity and inserting the online entry', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_online_paid_entry');
    expect(migrationSql).toContain('RETURNS TABLE');
    expect(migrationSql).toContain('outcome text');
    expect(compactMigrationSql).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
    expect(migrationSql).toContain(
      'FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)'
    );
    expect(migrationSql).toContain('COALESCE(v_judge_capacity.available_spots, 0) <= 0');
    expect(migrationSql).toContain('INSERT INTO public.entries');
  });

  it('routes paid overflow through existing class waitlist policy', () => {
    expect(migrationSql).toContain('COALESCE(c.allow_waitlist, false)');
    expect(migrationSql).toContain("outcome := 'denied'");
    expect(migrationSql).toContain('INSERT INTO public.waitlist_entries');
    expect(migrationSql).toContain('joined_via');
    expect(migrationSql).toContain("'online'");
    expect(migrationSql).toContain("outcome := 'waitlisted'");
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
