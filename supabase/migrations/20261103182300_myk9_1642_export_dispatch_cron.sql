-- MYK9-1642: trigger the hourly independent database export from Supabase
-- pg_cron instead of relying on GitHub's `schedule` event.
--
-- GitHub fired the workflow's `7 * * * *` cron only 4-6 times a day between
-- Oct 29 and Nov 2, so weekend hourly slots were missed and Export Health went
-- red. Scheduled workflows are best-effort on GitHub; pg_cron is ours.
--
-- pg_cron calls GitHub's REST `workflow_dispatch` endpoint through pg_net with
-- `inputs.force = "false"`, so the workflow's existing due-slot selector
-- (weekend-window.ts, then export.ts's due-slot check) decides whether to
-- export. The GitHub `schedule` trigger stays as an idempotent fallback: a
-- second run inside a slot that already has an export is a no-op.
--
-- Credential: a fine-grained GitHub token (repository rbeezley/myk9-platform,
-- permission Actions: read and write) stored in Vault as
-- `github_export_dispatch_token`. It is read in the cron command so
-- list_cron_vault_secret_refs() / audit_cron_vault_secrets() see the
-- dependency; /admin/health goes red if the secret is missing. With no secret
-- the function logs a NOTICE and sends nothing.
--
-- pg_net records each response in net._http_response (pruned by pg_net); no
-- logging table is added here (cron history retention, MYK9-1052).

BEGIN;

CREATE OR REPLACE FUNCTION private.dispatch_database_export(p_token text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  IF nullif(p_token, '') IS NULL THEN
    RAISE NOTICE 'dispatch_database_export skipped because Vault secret github_export_dispatch_token is not set';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://api.github.com/repos/rbeezley/myk9-platform/actions/workflows/independent-database-exports.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || p_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'myk9-platform-pg-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('force', 'false')),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION private.dispatch_database_export(text) IS
  'MYK9-1642: cron entry point. POSTs workflow_dispatch (ref main, inputs.force=false) for independent-database-exports.yml with the Vault token github_export_dispatch_token. No-op with a NOTICE when the token is missing.';

REVOKE EXECUTE ON FUNCTION private.dispatch_database_export(text) FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'database-export-dispatch';

SELECT cron.schedule(
  'database-export-dispatch',
  '3 * * * *',
  $job$
  select private.dispatch_database_export(
    (select decrypted_secret from vault.decrypted_secrets where name = 'github_export_dispatch_token')
  );
  $job$
);

COMMIT;
