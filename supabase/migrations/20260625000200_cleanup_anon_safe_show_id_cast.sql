-- =============================================================================
-- Migration 20260625000200: harden cleanup_stale_ringside_anon_users show_id cast
--
-- Plan: docs/plan-ringside-entries-read-authz.md (Phase E). Follow-up to
-- 20260625000100 (code review of PR #953, suggestion 1).
--
-- The prior version joined shows with `s.id = (raw_app_meta_data->>'show_id')::uuid`
-- directly in the LEFT JOIN's ON clause. That cast is evaluated while joining, so
-- a SINGLE malformed (non-UUID) show_id in ANY auth.users row's app_metadata —
-- including a non-anonymous account that happens to carry an unrelated 'show_id'
-- key — would raise `invalid input syntax for type uuid` and abort the entire
-- cleanup. Because this runs as an unwatched daily cron, that would silently kill
-- cleanup forever and let anon users re-accumulate.
--
-- Fix (re-emit the function; only the v_ids query changes):
--   1. Filter to is_anonymous FIRST in a CTE, so the cast never runs over
--      non-anonymous rows.
--   2. Safe-cast show_id: a value that is not a well-formed UUID yields NULL,
--      which the (kind='ringside_passcode' AND s.id IS NULL) branch already treats
--      as "show gone" -> eligible for deletion. So one bad value can never abort
--      the run.
-- The child-delete / FK-safe-order / is_anonymous re-assert logic is unchanged.
-- =============================================================================

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
  -- Anonymous rows only (CTE), with a SAFE show_id cast (NULL on any non-UUID),
  -- so no stray app_metadata value can abort the cron.
  WITH stale AS (
    SELECT
      u.id,
      u.deleted_at,
      u.created_at,
      (u.raw_app_meta_data->>'kind') AS kind,
      CASE
        WHEN (u.raw_app_meta_data->>'show_id')
             ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (u.raw_app_meta_data->>'show_id')::uuid
      END AS show_id
    FROM auth.users u
    WHERE u.is_anonymous = true
  )
  SELECT array_agg(st.id) INTO v_ids
  FROM stale st
  LEFT JOIN public.shows s ON s.id = st.show_id
  WHERE
    st.deleted_at IS NOT NULL
    OR (
      st.kind IS DISTINCT FROM 'ringside_passcode'
      AND st.created_at < now() - p_claimless_ttl
    )
    OR (
      st.kind = 'ringside_passcode'
      AND (
        s.id IS NULL
        OR s.end_date < (now() - p_ended_grace)::date
        -- Backstop for a claim whose show has a bad/far-future end_date. Assumes
        -- no legitimate show runs longer than p_max_age (14d) — real dog shows are
        -- a few days; a purged user simply re-enters the passcode.
        OR st.created_at < now() - p_max_age
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
