-- =============================================================================
-- Migration: audit_cron_vault_secrets() — proactive guard against the
--            "scheduled cron references a Vault secret that was never seeded"
--            failure mode.
--
-- Motivation: the `waitlist-offer-expiration` job failed on every run because
-- its scheduled DO block read Vault secret `cron_secret`, which had never been
-- created (fixed 2026-07-04). That class of bug leaves NO code diff — the value
-- is seeded at runtime via vault.create_secret, deliberately outside migration
-- history — so it escapes code review and only surfaces once the job runs and
-- RAISEs. Worse, because net.http_post (pg_net) is fire-and-forget, seeding only
-- one end can flip the cron to `succeeded` while the edge fn silently 401s.
--
-- This function closes that gap by parsing every cron.job command for the
-- `... from vault.decrypted_secrets where name = '<secret>'` idiom that all our
-- Vault-backed jobs use, and reporting any referenced secret that does not exist
-- in vault.decrypted_secrets. It is PROACTIVE (config-drift, pre-run) and thus
-- complementary to — not a duplicate of — a reactive job_run_details status
-- check. The planned system-health check-runner should CALL this rather than
-- reimplement cron-command parsing.
--
-- Contract: returns one row per (job, missing secret). EMPTY result = healthy.
--
-- Access model: SECURITY DEFINER (must read cron.job + vault.decrypted_secrets,
-- which authenticated/anon cannot). It exposes secret NAMES only (never values),
-- and only for secrets that are MISSING, but that is still operational metadata —
-- lock EXECUTE to service_role (the check-runner's identity). No app role calls
-- it directly; the /admin/health board reads snapshots, not this function.
--
-- New migration only. Rollback = a follow-up migration that DROPs the function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_cron_vault_secrets()
RETURNS TABLE (jobname text, missing_secret text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH refs AS (
    -- regexp_matches with 'g' is a set-returning function: in the SELECT list it
    -- emits ZERO rows for a command with no match (non-Vault jobs correctly drop
    -- out of `refs`) and ONE row per match for commands referencing multiple
    -- secrets (each is checked). That fan-out/drop is exactly the contract here.
    SELECT
      j.jobname::text AS jobname,
      (pg_catalog.regexp_matches(
        j.command,
        $re$vault\.decrypted_secrets\s+where\s+name\s*=\s*'([^']+)'$re$,
        'g'
      ))[1] AS secret_name
    FROM cron.job j
  )
  SELECT r.jobname, r.secret_name
  FROM refs r
  WHERE NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s WHERE s.name = r.secret_name
  )
  ORDER BY r.jobname, r.secret_name;
$fn$;

COMMENT ON FUNCTION public.audit_cron_vault_secrets() IS
  'Guard: returns (jobname, missing_secret) for every pg_cron job that references '
  'a vault.decrypted_secrets name which does not exist. Empty result = healthy. '
  'Catches Vault-backed crons scheduled without their secret seeded (see '
  'waitlist-offer-expiration regression 2026-07-04). service_role only.';

REVOKE ALL ON FUNCTION public.audit_cron_vault_secrets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_cron_vault_secrets() TO service_role;
