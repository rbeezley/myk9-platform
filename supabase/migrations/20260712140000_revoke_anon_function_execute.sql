-- Advisor disposition sweep (plan docs/improve-audit-2026-07-11/009) — Verdict 2, structural half.
--
-- Root cause: Postgres grants EXECUTE on new functions to PUBLIC by default, so every SECURITY
-- DEFINER function ever created silently became anon-executable (advisor: 112
-- anon_security_definer_function_executable WARNs). The fix is structural: stop the default bleed,
-- then per-function REVOKE the implicit PUBLIC grant and GRANT back only the intended roles.
--
-- Derivation (live DB, 2026-07-12):
--   * Keep-list (anon must retain EXECUTE): the RLS predicate helpers referenced by anon/public
--     policies, derived mechanically via  pg_policies.qual ~ '\m<fn>\M'  for anon/public policies.
--     Result = 8 helper names (is_show_secretary has two overloads, both kept). Revoking anon on
--     these would make every anon read of the tables whose policies call them start erroring.
--   * Genuine anon RPC surface = 0: grepped the client for direct .rpc() on validate_passcode,
--     self_checkin_entry, increment_promo_usage, validate_promo_code,
--     insert_club_access_request_from_signup, system_health_probe — all are either service-role
--     edge-function calls or authenticated exhibitor flows; none run as the anon role.
--   * Trigger + test functions: revoked from anon AND authenticated (triggers fire internally,
--     independent of EXECUTE grants; test_* have no business being API-callable in prod).
--   * Every other over-granted function keeps authenticated (its internal is_*()/claim gate is the
--     authz layer — the SECURITY DEFINER pattern this repo uses) and keeps service_role.
--
-- The loop is scoped to functions anon can CURRENTLY execute, so already-locked-down
-- service-role-only functions (recalculate_class_placements, record_login_attempt, …) are left
-- untouched and are NOT widened to authenticated.

-- 1. Stop the bleeding for functions created in the future by this migration role.
--    NOTE: ALTER DEFAULT PRIVILEGES is scoped to the EXECUTING role's future objects (postgres via
--    the migration CLI). Functions created by a different owner (e.g. the dashboard SQL editor under
--    another identity) could still inherit PUBLIC EXECUTE — re-run the Verdict-2 sweep if the advisor
--    count regrows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2. Sweep the existing over-granted SECURITY DEFINER functions.
DO $$
DECLARE
  r record;
  sig text;
  keep_anon text[] := ARRAY[
    -- RLS predicate helpers referenced by anon/public policy quals:
    'get_my_person_id','has_role','is_club_admin','is_platform_admin',
    'is_show_official','is_show_secretary','is_site_admin','is_trial_secretary',
    -- Helper called by the anon-facing SECURITY DEFINER views view_public_entry_results /
    -- view_own_entry_results (EXECUTE is checked against the anon caller). Kept here so a
    -- standalone re-run of this sweep stays self-contained and cannot re-break anon reads.
    'resolve_class_result_visibility'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           (p.prorettype = 'trigger'::regtype) AS is_trigger,
           (p.proname IN ('test_as_anon','test_as_user','test_reset')) AS is_test,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')   -- the 112 currently over-granted
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);

    -- Remove the implicit PUBLIC grant (the real source of anon EXECUTE) and any direct grants.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', sig);

    IF r.is_trigger OR r.is_test THEN
      CONTINUE;  -- triggers fire internally; test_* stay service-role-only. No grants back.
    END IF;

    -- Intended callers of the remaining RPCs / RLS helpers.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);

    -- RLS predicate helpers referenced by anon/public policies keep anon EXECUTE.
    IF r.proname = ANY(keep_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
    END IF;
  END LOOP;
END $$;
