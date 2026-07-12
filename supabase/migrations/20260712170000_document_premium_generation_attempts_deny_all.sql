-- Advisor disposition sweep (plan docs/improve-audit-2026-07-11/009) — completeness follow-up.
--
-- The advisor lists 4 rls_enabled_no_policy tables, not 3: premium_generation_attempts (created by
-- SA-025's 20260712120000_premium_generation_throttle.sql) is also RLS-enabled with no policies.
-- It is deny-all-to-API by design, same as the other three. Document the disposition in-schema so
-- the advisor INFO is dispositioned rather than merely observed. (Owned by SA-025; commented here
-- to keep the 009 advisor sweep's rls_enabled_no_policy coverage complete.)
COMMENT ON TABLE public.premium_generation_attempts IS
  'RLS enabled with no policies = deny-all to anon/authenticated by design — advisor rls_enabled_no_policy INFO ACCEPTED 2026-07-12 (plan improve-audit-2026-07-11/009). Premium-generation throttle ledger (SA-025), written/read only via the SECURITY DEFINER check_and_record_premium_generation_attempt function and service-role paths.';
