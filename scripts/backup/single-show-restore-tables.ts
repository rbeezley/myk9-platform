// Table classification for the single-show restore (MYK9-110 drill 4). Fail-closed: every table
// in the show's cascade closure must be named in exactly one of these sets, or the plan refuses.
// A new table is therefore a conscious decision, never a silent default in either direction.
//
// SHOW_DATA_TABLES was built on 2026-11-15 from the cascade closure of public.shows in
// supabase/migrations (CREATE TABLE plus ON DELETE CASCADE foreign keys, honouring DROP TABLE and
// the registrations -> enrollments rename). `promo_codes` was dropped by MYK9-1299 and is kept
// only so an export taken before that migration still classifies.

/** Stripe ledger, payouts, refunds, checkout and cart state. Excluded unless --include-money. */
export const MONEY_TABLES: ReadonlySet<string> = new Set(
  [
    'cart_checkout_leases',
    'cart_fulfillment_lines',
    'cart_fulfillments',
    'cart_spot_holds',
    'club_stripe_accounts',
    'entry_cart_items',
    'entry_carts',
    'entry_payment_links',
    'orders',
    'payments',
    'payouts',
    'refund_request_attempts',
    'refund_requests',
    'refunds',
    'show_money_locks',
    'show_payments',
    'show_payouts',
    'stripe_customers',
    'stripe_order_refunds',
    'stripe_orders',
    'stripe_subscriptions',
  ].map(t => `public.${t}`)
);

/** Show data restored by default. */
export const SHOW_DATA_TABLES: ReadonlySet<string> = new Set(
  [
    'activity_log',
    'announcement_reads',
    'announcements',
    'armbands',
    'calendar_feed_tokens',
    'class_visibility_overrides',
    'classes',
    'dog_favorites',
    'enrollments',
    'entries',
    'entry_form_notes',
    'entry_status_history',
    'judge_assignments',
    'nationals_advancement',
    'nationals_rankings',
    'nationals_scores',
    'offline_scoring',
    'paperwork_prints',
    'premium_generation_attempts',
    'premium_generations',
    'promo_codes',
    'result_submissions',
    'ringside_sessions',
    'show_announcement_reads',
    'show_announcements',
    'show_close_notes',
    'show_eve_nudge_log',
    'show_incidents',
    'show_judge_supplies',
    'show_lifecycle_email_attempts',
    'show_lifecycle_email_job_requests',
    'show_lifecycle_email_jobs',
    'show_lifecycle_email_steps',
    'show_message_threads',
    'show_messages',
    'show_officials',
    'show_passcodes',
    'show_visibility_settings',
    'shows',
    'sms_proximity_sends',
    'trial_checklist_state',
    'trial_lunch_orders',
    'trial_packet_generation_claims',
    'trial_packet_print_reminders',
    'trial_visibility_overrides',
    'trials',
    'user_roles',
    'volunteer_class_assignments',
    'volunteer_general_assignments',
    'volunteers',
    'waitlist_entries',
    'waitlist_notification_events',
  ].map(t => `public.${t}`)
);

export const isMoneyTable = (table: string): boolean => MONEY_TABLES.has(table);

/** Closure tables named in neither set and not explicitly excluded by the operator. */
export function unclassifiedTables(
  closure: Iterable<string>,
  excluded: ReadonlySet<string>,
  showData: ReadonlySet<string> = SHOW_DATA_TABLES
): string[] {
  return [...closure]
    .filter(t => !MONEY_TABLES.has(t) && !showData.has(t) && !excluded.has(t))
    .sort();
}

export function unclassifiedMessage(tables: string[]): string {
  return `refusing to plan: ${tables.join(', ')} ${tables.length === 1 ? 'is' : 'are'} in the show's cascade closure but not classified as money or show data. Pass --exclude-table for each, or add it to MONEY_TABLES or SHOW_DATA_TABLES in scripts/backup/single-show-restore-tables.ts`;
}
