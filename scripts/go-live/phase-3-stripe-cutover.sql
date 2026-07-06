-- Go Live Runbook Phase 3 Stripe cutover database evidence checklist.
-- Read-only by design. Run only after approval with a read-capable DB URL.

\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

WITH checks(ordinal, check_key, ok, detail) AS (
  SELECT
    1,
    'stripe_customers_livemode_column',
    count(*) = 1,
    count(*)::text || ' matching columns'
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'stripe_customers'
    AND column_name = 'livemode'

  UNION ALL

  SELECT
    2,
    'club_stripe_accounts_livemode_column',
    count(*) = 1,
    count(*)::text || ' matching columns'
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'club_stripe_accounts'
    AND column_name = 'livemode'

  UNION ALL

  SELECT
    3,
    'stripe_customers_cached_rows_after_purge',
    count(*) = 0,
    count(*)::text || ' cached rows'
  FROM public.stripe_customers

  UNION ALL

  SELECT
    4,
    'exhibitor_profiles_cached_customer_ids_after_purge',
    count(*) = 0,
    count(*)::text || ' non-null cached customer ids'
  FROM public.exhibitor_profiles
  WHERE stripe_customer_id IS NOT NULL

  UNION ALL

  SELECT
    5,
    'club_stripe_accounts_cached_rows_after_purge',
    count(*) = 0,
    count(*)::text || ' cached rows'
  FROM public.club_stripe_accounts

  UNION ALL

  SELECT
    6,
    'nightly_show_payouts_cron_active',
    count(*) > 0,
    count(*)::text || ' active cron rows'
  FROM cron.job
  WHERE jobname = 'nightly-show-payouts'
    AND active
)
SELECT
  CASE WHEN ok THEN 'ok' ELSE 'fail' END AS status,
  check_key,
  detail
FROM checks
ORDER BY ordinal;

ROLLBACK;
