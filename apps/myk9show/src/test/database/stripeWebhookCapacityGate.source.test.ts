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
const replayableFulfillmentMigration = readFileSync(
  resolve(root, 'supabase/migrations/20261004214700_myk9_964_replayable_cart_fulfillment.sql'),
  'utf8'
);
const cartFulfillmentSource = readFileSync(
  resolve(root, 'apps/myk9show/supabase/functions/stripe-webhook/cartFulfillment.ts'),
  'utf8'
);
const compactCapacityGateMigration = capacityGateMigration.replace(/\s+/g, ' ');
// MYK9-964: a Finish Payment line is paid in place by payFinishPaymentLine.
const recoveredBranchStart = webhookSource.indexOf('async function payFinishPaymentLine(');
const recoveredBranch = webhookSource.slice(
  recoveredBranchStart,
  webhookSource.indexOf('\n}\n', recoveredBranchStart)
);

describe('stripe webhook online cart capacity gate', () => {
  it('routes paid cart entry creation through the atomic capacity RPC, once per line (MYK9-964)', () => {
    // Each new line goes through fulfill_cart_line, which calls
    // create_online_paid_entry at most once and records the outcome.
    expect(cartFulfillmentSource).toContain("'fulfill_cart_line'");
    expect(webhookSource).not.toContain("rpc('create_online_paid_entry'");
    expect(webhookSource).not.toContain(".from('entries')\n      .insert(");
    expect(replayableFulfillmentMigration).toContain('FROM public.create_online_paid_entry(');
  });

  it('marks recovered existing entries paid instead of inserting duplicate rows', () => {
    expect(recoveredBranchStart).toBeGreaterThan(0);
    expect(recoveredBranch).toContain("payment_status: 'paid'");
    expect(recoveredBranch).toContain("payment_method: 'online'");
    expect(recoveredBranch).toContain("entry_status: 'confirmed'");
    // MYK9-879: the fee was FROZEN at entry creation and this line was charged exactly
    // that, so marking the entry paid must not write entry_fee back.
    expect(recoveredBranch).not.toMatch(/entry_fee: /);
    expect(recoveredBranch).toContain(".eq('payment_status', 'pending')");
    expect(recoveredBranch).toContain(".eq('dog_id', line.dog_id)");
    expect(recoveredBranch).toContain(".eq('class_id', line.class_id)");
    expect(recoveredBranch).toContain(".eq('show_id', ctx.showId)");
    expect(recoveredBranch).toContain(".is('deleted_at', null)");
    expect(recoveredBranch).toContain('INACTIVE_ENTRY_STATUSES.has');
    expect(recoveredBranch).toContain('expireRecoveredEntryPaymentLinks');
    expect(webhookSource).toContain('await resolvePaidWaitlistOffers(paidLineIds, session.id)');
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

  it('queues the no-service overflow share for approval with the latch (MYK9-964)', () => {
    expect(webhookSource).toContain('decideCartOverflowRefund');
    expect(webhookSource).toContain('closeCartFulfillment(refundQueueDeps');
    expect(cartFulfillmentSource).toContain("'complete_cart_fulfillment'");
    // The by-hand operator alert (option C on #2689) is gone.
    expect(webhookSource).not.toContain('cartOverflowManualRefundAlert');
    expect(cartFulfillmentSource).not.toContain('cartOverflowManualRefundAlert');
    // MYK9-876: refunds are never automatic.
    expect(webhookSource).not.toContain('refunds.create');
    expect(cartFulfillmentSource).not.toContain('refunds.create');
    expect(cartFulfillmentSource).toContain('waitlisted_cart_item_ids');
    expect(cartFulfillmentSource).toContain('denied_cart_item_ids');
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
