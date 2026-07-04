-- =============================================================================
-- Migration: list_cron_vault_secret_refs() — the observable parser behind
--            audit_cron_vault_secrets() (added 20260704160000).
--
-- Why: audit_cron_vault_secrets() returns only the MISSING subset, so its healthy
-- state is the empty set — which is indistinguishable from a silently-broken
-- regex that matches nothing. A test asserting "== []" therefore can't tell
-- "healthy" from "parser is dead". This companion exposes EVERY parsed
-- (jobname, secret_name, secret_exists) reference so the parser itself is
-- observable and testable, and re-points audit_*() at it so the extraction regex
-- lives in exactly one place (DRY).
--
-- Contract: list_cron_vault_secret_refs() = every Vault-secret reference parsed
-- from pg_cron commands, with whether each exists. audit_cron_vault_secrets() is
-- exactly the secret_exists = false subset (empty = healthy, unchanged).
--
-- Access model identical to audit_*(): SECURITY DEFINER (reads cron.job +
-- vault.decrypted_secrets), service_role only, exposes secret NAMES not values.
--
-- New migration only. Rollback = a follow-up migration that DROPs the new
-- function and restores audit_*()'s inline body.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_cron_vault_secret_refs()
RETURNS TABLE (jobname text, secret_name text, secret_exists boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH refs AS (
    -- regexp_matches with 'g' is a set-returning function: in the SELECT list it
    -- emits ZERO rows for a command with no match (non-Vault jobs drop out) and
    -- ONE row per match for commands referencing multiple secrets.
    SELECT
      j.jobname::text AS jobname,
      (pg_catalog.regexp_matches(
        j.command,
        $re$vault\.decrypted_secrets\s+where\s+name\s*=\s*'([^']+)'$re$,
        'g'
      ))[1] AS secret_name
    FROM cron.job j
  )
  SELECT
    r.jobname,
    r.secret_name,
    EXISTS (SELECT 1 FROM vault.decrypted_secrets s WHERE s.name = r.secret_name)
      AS secret_exists
  FROM refs r
  ORDER BY r.jobname, r.secret_name;
$fn$;

COMMENT ON FUNCTION public.list_cron_vault_secret_refs() IS
  'Every (jobname, secret_name, secret_exists) Vault-secret reference parsed from '
  'pg_cron commands. Superset of audit_cron_vault_secrets() (= the secret_exists=false '
  'subset). Exists so the parser is observable/testable, not just its missing-only view. '
  'Known limitation: matches only the inline `vault.decrypted_secrets where name = ''lit''` '
  'idiom (all current jobs use it) — misses parameterized/uppercased/indirected reads, so it '
  'fails OPEN (a missed ref reads as healthy). service_role only.';

REVOKE ALL ON FUNCTION public.list_cron_vault_secret_refs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cron_vault_secret_refs() TO service_role;

-- Re-point audit_cron_vault_secrets() at the shared parser: one regex, two views.
-- Body changes from an inline regex to the missing-only projection of the parser;
-- return shape and empty=healthy contract are unchanged.
CREATE OR REPLACE FUNCTION public.audit_cron_vault_secrets()
RETURNS TABLE (jobname text, missing_secret text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT r.jobname, r.secret_name
  FROM public.list_cron_vault_secret_refs() r
  WHERE NOT r.secret_exists
  ORDER BY r.jobname, r.secret_name;
$fn$;
