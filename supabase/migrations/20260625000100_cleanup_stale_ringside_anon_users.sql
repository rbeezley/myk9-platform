-- =============================================================================
-- Migration 20260625000100: recurring cleanup of stale ringside ANONYMOUS users
--
-- Plan: docs/plan-ringside-entries-read-authz.md (Phase E, recurring cleanup).
--
-- Anonymous sessions are minted for passcode ringside (Phase C/D). They are
-- permanent rows in auth.users until removed, so they accumulate (MAU + abuse
-- surface — security review SA-001/SA-002). This adds a maintenance function +
-- a daily pg_cron job that deletes stale ones.
--
-- This depends on 20260625000000 (the new-user trigger now skips anon users), so
-- anon users created AFTER that migration have only auth.* (cascade) children and
-- delete cleanly. The child-table deletes below are DEFENSIVE — they also purge
-- the people/exhibitor_profiles/user_roles rows that PRE-fix anon users still
-- carry (and are why a bare auth.users delete 500s for them). They are scoped
-- strictly to the collected anonymous user ids; a non-anonymous account is never
-- in that set, so real people/profiles/roles are never touched.
--
-- Deletion criteria (an anon user is stale if ANY holds):
--   (a) already soft-deleted (deleted_at set) — finish the job;
--   (b) claimless (no ringside_passcode claim) AND older than p_claimless_ttl —
--       invalid-passcode orphans + abandoned anon sign-ins;
--   (c) a ringside_passcode claim whose show has ended (+ p_ended_grace), or whose
--       show no longer exists, or that is simply older than p_max_age (backstop).
-- Multi-day shows are preserved: a claim survives until its show's end_date
-- passes (+ grace), not a fixed TTL from sign-in.
-- =============================================================================

-- Wrap the function definition + grants + cron registration in one transaction
-- (matches heritage_cron_vault / payout_cron_schedule): either the function and
-- its schedule both land, or neither does.
BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_stale_ringside_anon_users(
  p_claimless_ttl interval DEFAULT interval '1 day',
  p_ended_grace   interval DEFAULT interval '2 days',
  p_max_age       interval DEFAULT interval '14 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(u.id) INTO v_ids
  FROM auth.users u
  LEFT JOIN public.shows s
    ON s.id = (u.raw_app_meta_data->>'show_id')::uuid
  WHERE u.is_anonymous = true
    AND (
      u.deleted_at IS NOT NULL
      OR (
        (u.raw_app_meta_data->>'kind') IS DISTINCT FROM 'ringside_passcode'
        AND u.created_at < now() - p_claimless_ttl
      )
      OR (
        (u.raw_app_meta_data->>'kind') = 'ringside_passcode'
        AND (
          s.id IS NULL
          OR s.end_date < (now() - p_ended_grace)::date
          OR u.created_at < now() - p_max_age
        )
      )
    );

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Defensive child cleanup (no-op for post-fix anon users), FK-safe order,
  -- scoped to the collected anon ids ONLY.
  DELETE FROM public.user_roles         WHERE auth_user_id = ANY(v_ids);
  DELETE FROM public.exhibitor_profiles WHERE auth_user_id = ANY(v_ids);
  DELETE FROM public.people             WHERE auth_user_id = ANY(v_ids);

  -- Re-assert is_anonymous on the final delete as a belt-and-suspenders guard so
  -- this can never remove a non-anonymous account even if v_ids were mis-built.
  DELETE FROM auth.users WHERE id = ANY(v_ids) AND is_anonymous = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Maintenance function — not for end users. pg_cron runs it as the owner.
REVOKE ALL ON FUNCTION public.cleanup_stale_ringside_anon_users(interval, interval, interval) FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_ringside_anon_users(interval, interval, interval) TO service_role;

-- Daily at 04:00 UTC (quiet hours). Unschedule first so re-running is idempotent.
SELECT cron.unschedule('cleanup-ringside-anon')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-ringside-anon');

SELECT cron.schedule(
  'cleanup-ringside-anon',
  '0 4 * * *',
  $$ SELECT public.cleanup_stale_ringside_anon_users(); $$
);

COMMIT;
