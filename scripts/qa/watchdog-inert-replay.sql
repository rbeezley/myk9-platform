-- QA-HEALTH-WATCHDOG-INERT-2026-08-22 -- closure replay for daily-health-snapshot-watchdog.
--
-- MANUAL script. Not wired into any runner: scripts/qa/run-behavioral-sql-tests.sh
-- reads only supabase/tests/, and the migration-parsing tests read only
-- supabase/migrations/. Nothing here runs in CI.
--
-- What it proves: the watchdog raises an alert when the 07:00 nightly full run is
-- missing even though the five-minute continuous runs are present -- and that the
-- PRE-FIX predicate stays silent on identical data. It executes the DEPLOYED cron
-- body pulled from cron.job.command, rewriting ONLY the two table names, so it
-- tests what is live rather than a retyped copy.
--
-- Safety: every table it touches is a TEMP table, and the whole run is wrapped in
-- BEGIN/ROLLBACK. It never writes to system_health_snapshots or operator_alerts.
-- The Supabase MCP connection is read-only and cannot run this; use psql:
--
--   set -a && . supabase/.env && set +a && export PGPASSWORD="$SUPABASE_DB_PASSWORD"
--   psql -h "$(cut -d@ -f2 supabase/.temp/pooler-url | cut -d: -f1)" -p 5432 \
--     -U postgres.sojmvhhwsjxmfistvzbe -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/qa/watchdog-inert-replay.sql
--
-- Expected: scenarios 1/3/5 report 0 alerts, scenarios 2/4 report 1, ROLLBACK at the end.

\set ON_ERROR_STOP on
BEGIN;

-- Nothing below touches a real table. The watchdog body is the DEPLOYED text
-- pulled from cron.job; only the two table names are rewritten to temp tables.

CREATE TEMP TABLE replay_snapshots (
  id uuid DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL,
  source text NOT NULL,
  overall_status text NOT NULL,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_duration_ms integer,
  run_mode text
) ON COMMIT DROP;

CREATE TEMP TABLE replay_alerts (
  id uuid DEFAULT gen_random_uuid(),
  source text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  detail jsonb,
  dedupe_key text,
  resolved_at timestamptz
) ON COMMIT DROP;
CREATE UNIQUE INDEX replay_alerts_dedupe ON replay_alerts (source, dedupe_key)
  WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

CREATE TEMP TABLE results (
  step int, scenario text, predicate text, alerts int, evidence text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.replay(strip_run_mode boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE body text;
BEGIN
  SELECT command INTO body FROM cron.job WHERE jobname = 'daily-health-snapshot-watchdog';
  IF body IS NULL THEN RAISE EXCEPTION 'watchdog job not found'; END IF;
  body := replace(body, 'public.system_health_snapshots', 'replay_snapshots');
  body := replace(body, 'public.operator_alerts', 'replay_alerts');
  IF strip_run_mode THEN
    body := replace(body, 'AND snapshots.run_mode IS DISTINCT FROM ''continuous''', '');
  END IF;
  EXECUTE body;
END $fn$;

-- Sanity: prove the rewrite actually removed the clause in the stripped variant,
-- so scenario C is really the old predicate and not a mislabelled copy.
DO $$
DECLARE body text; stripped text;
BEGIN
  SELECT command INTO body FROM cron.job WHERE jobname = 'daily-health-snapshot-watchdog';
  stripped := replace(body, 'AND snapshots.run_mode IS DISTINCT FROM ''continuous''', '');
  -- Match the PREDICATE, not the bare substring: the alert payload contains
  -- 'snapshot_run_mode', which a naive check reads as a surviving clause.
  IF position('run_mode IS DISTINCT FROM' in body) = 0 THEN
    RAISE EXCEPTION 'deployed body has no run_mode predicate -- fix is not live';
  END IF;
  IF position('run_mode IS DISTINCT FROM' in stripped) <> 0 THEN
    RAISE EXCEPTION 'strip failed; scenario C would not be the old predicate';
  END IF;
  RAISE NOTICE 'deployed body carries % run_mode predicate(s); stripped variant carries 0',
    (length(body) - length(replace(body, 'run_mode IS DISTINCT FROM', ''))) / length('run_mode IS DISTINCT FROM');
END $$;

-- ---------------------------------------------------------------- scenario A
-- Healthy day: 12 five-minute continuous runs AND the 07:00 nightly full run.
INSERT INTO replay_snapshots (created_at, source, overall_status, run_mode)
SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
         + interval '7 hours' + (n * interval '5 minutes'),
       'cron-health-check', 'ok', 'continuous'
FROM generate_series(0, 11) n;

INSERT INTO replay_snapshots (created_at, source, overall_status, run_mode)
VALUES (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          + interval '7 hours' + interval '2 seconds',
        'cron-health-check', 'ok', 'full');

SELECT pg_temp.replay();
INSERT INTO results
SELECT 1, 'A. nightly ran (+12 continuous)', 'new (deployed)', count(*),
       'expect 0 -- nothing wrong, stay quiet' FROM replay_alerts;

-- ---------------------------------------------------------------- scenario B
-- The nightly full run never fired. The 12 continuous runs still did.
DELETE FROM replay_alerts;
DELETE FROM replay_snapshots WHERE run_mode = 'full';

SELECT pg_temp.replay();
INSERT INTO results
SELECT 2, 'B. nightly MISSING (+12 continuous)', 'new (deployed)', count(*),
       coalesce(max(dedupe_key), '(no alert)') FROM replay_alerts;

-- ---------------------------------------------------------------- scenario C
-- Identical data, pre-fix predicate. This is the bug being reproduced.
DELETE FROM replay_alerts;
SELECT pg_temp.replay(strip_run_mode => true);
INSERT INTO results
SELECT 3, 'B data, PRE-FIX predicate', 'old (08-04..08-22)', count(*),
       coalesce(max(dedupe_key), '(no alert -- 18 days blind)') FROM replay_alerts;

-- ---------------------------------------------------------------- scenario D
-- Dedupe still holds: two watchdog runs on a missing nightly = one alert.
DELETE FROM replay_alerts;
SELECT pg_temp.replay();
SELECT pg_temp.replay();
INSERT INTO results
SELECT 4, 'B, watchdog run twice', 'new (deployed)', count(*),
       'expect 1 -- ON CONFLICT dedupe' FROM replay_alerts;

-- ---------------------------------------------------------------- scenario E
-- Legacy rows (run_mode NULL, written before the deploy) must still count as
-- nightly, or the migration landing before the deploy would false-alarm.
DELETE FROM replay_alerts;
DELETE FROM replay_snapshots;
INSERT INTO replay_snapshots (created_at, source, overall_status, run_mode)
VALUES (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          + interval '7 hours' + interval '2 seconds',
        'cron-health-check', 'ok', NULL);
SELECT pg_temp.replay();
INSERT INTO results
SELECT 5, 'E. legacy NULL run_mode only', 'new (deployed)', count(*),
       'expect 0 -- deploy-order safety' FROM replay_alerts;

SELECT step, scenario, predicate, alerts, evidence FROM results ORDER BY step;

ROLLBACK;
