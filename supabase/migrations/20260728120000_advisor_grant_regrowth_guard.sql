-- MYK9-108: re-disposition SECURITY DEFINER grant drift after the 2026-07-12 sweep.
--
-- Applied-database inventory on 2026-07-28 found 17 anon-executable and 96
-- authenticated-executable SECURITY DEFINER identities. Seven anon identities are
-- unnecessary. The two broadcast functions are trigger targets, so authenticated
-- EXECUTE is unnecessary too. The other five functions are authenticated RPCs with
-- internal authorization gates; keep authenticated and service_role, revoke anon.

-- Reinforce the default for both migration owners. The repository contract test
-- separately requires an explicit per-object decision in every future migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'MYK9-108: could not revoke supabase_admin default function/table privileges. '
                'Run this ALTER DEFAULT PRIVILEGES as supabase_admin to finish.';
END $$;

-- Trigger functions fire through their triggers; no API role needs direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.broadcast_showday_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_paperwork_print_change()
  FROM PUBLIC, anon, authenticated;

-- Authenticated reconciliation RPCs authorize the requested scope internally.
REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_orders(
  text,
  uuid,
  uuid,
  integer,
  timestamp with time zone,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_orders(
  text,
  uuid,
  uuid,
  integer,
  timestamp with time zone,
  uuid
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_payouts(
  text,
  uuid,
  uuid,
  integer,
  timestamp with time zone,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_payouts(
  text,
  uuid,
  uuid,
  integer,
  timestamp with time zone,
  uuid
) TO authenticated, service_role;

-- Owner/admin RPCs gate every call with auth.uid() and scoped authorization.
REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_requests()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_requests()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text)
  TO authenticated, service_role;

-- These tables intentionally expose no direct API path. Their worker/money flows
-- use SECURITY DEFINER RPCs or service_role, so RLS with no policy is deny-all.
COMMENT ON TABLE public.stripe_order_refunds IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor '
  'rls_enabled_no_policy INFO ACCEPTED 2026-07-28 (MYK9-108). Refund snapshots are '
  'written and read only by reconciliation SECURITY DEFINER RPCs and service-role paths.';

COMMENT ON TABLE public.waitlist_notification_events IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor '
  'rls_enabled_no_policy INFO ACCEPTED 2026-07-28 (MYK9-108). Retryable delivery events '
  'are written and read only by waitlist worker SECURITY DEFINER RPCs and service-role paths.';

NOTIFY pgrst, 'reload schema';
