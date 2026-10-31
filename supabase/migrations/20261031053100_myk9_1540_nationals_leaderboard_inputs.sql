-- MYK9-1540: the ringside Nationals Leaderboard's data read.
--
-- The Results tab builds the leaderboard from the caller's replica, which is
-- NOT a complete, score-authorized feed for ringside staff: an account judge's
-- replica holds only the classes they are assigned, and a steward's has
-- points_earned masked by view_authenticated_entry_results. This function
-- returns the board's input rows for ONE nationals show to a caller admitted
-- to that show's ringside staff, with scores only for RELEASED classes.
--
-- Admission = the staff arms the results view and entry_results_changed_since
-- admit rows by (copied from 20261031014300_myk9_1521_changed_since_caller_access.sql,
-- the latest definition), minus the exhibitor arms: site admin, manager of the
-- show's club, show- or club-scoped steward, a current ringside passcode claim
-- (judge, steward or admin) for THIS show, and a judge assigned to a class of
-- this show (entries or not). An exhibitor, another show's staff and a signed-out caller get no
-- rows. managed_show_ids is always empty since MYK9-114, so that arm is not
-- restated.
--
-- Filters restated from the view: live entries only (deleted_at IS NULL); the show, trial
-- and class must be live too, so a deleted class never ranks.
-- Release gate: results_released_at IS NOT NULL on the entry's class (the
-- same stamp the Results tab ranks by). An entry in an unreleased class is
-- still returned (a withdrawal is a lifecycle fact the board shows) but its
-- is_scored, result_status, points_earned and search_time_seconds arrive
-- NULL/false, so an unreleased score never leaves the server.
--
-- ROLLBACK: DROP FUNCTION public.get_nationals_leaderboard_inputs(uuid);

CREATE OR REPLACE FUNCTION public.get_nationals_leaderboard_inputs(p_show_id uuid)
RETURNS TABLE (
  entry_id uuid,
  class_id uuid,
  dog_id uuid,
  dog_name text,
  dog_call_name text,
  armband text,
  handler_name text,
  entry_status text,
  check_in_status text,
  is_scored boolean,
  result_status text,
  points_earned integer,
  search_time_seconds numeric,
  class_results_released_at timestamptz,
  trial_date date,
  show_start_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ctx record;
  v_club_id uuid;
  v_start date;
  v_found boolean;
  v_authorized boolean;
BEGIN
  IF p_show_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT s.club_id, s.start_date, true INTO v_club_id, v_start, v_found
  FROM public.shows s
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL
    AND s.is_nationals IS TRUE;
  IF v_found IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT * INTO ctx FROM private.entry_results_caller_context();

  v_authorized := COALESCE(
    ctx.is_site_admin
    OR v_club_id = ANY(ctx.managed_club_ids)
    OR p_show_id = ANY(ctx.steward_show_ids)
    OR v_club_id = ANY(ctx.steward_club_ids)
    OR (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = p_show_id::text
      AND ctx.claim_generation_current
      AND ctx.claim_role IN ('judge', 'steward', 'admin')
    ),
    false
  );

  IF NOT v_authorized AND ctx.assigned_class_ids IS NOT NULL THEN
    -- A judge assigned to ANY class of this show, even one with no entries yet.
    v_authorized := EXISTS (
      SELECT 1
      FROM public.classes ac
      JOIN public.trials atr ON atr.id = ac.trial_id
      WHERE atr.show_id = p_show_id
        AND ac.id = ANY(ctx.assigned_class_ids)
    );
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.class_id,
    e.dog_id,
    d.name,
    d.call_name,
    e.armband,
    COALESCE(
      NULLIF(btrim(e.handler), ''),
      NULLIF(btrim(concat_ws(' ', hp.first_name, hp.last_name)), ''),
      NULLIF(btrim(concat_ws(' ', op.first_name, op.last_name)), '')
    ),
    e.entry_status,
    e.check_in_status,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.is_scored ELSE false END,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.result_status END,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.points_earned END,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.search_time_seconds END,
    c.results_released_at,
    t.date,
    v_start
  FROM public.entries e
  JOIN public.classes c ON c.id = e.class_id AND c.deleted_at IS NULL
  JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
  LEFT JOIN public.dogs d ON d.id = e.dog_id
  LEFT JOIN public.people hp ON hp.id = e.handler_id
  LEFT JOIN public.people op ON op.id = d.owner_id
  WHERE e.show_id = p_show_id
    AND e.deleted_at IS NULL
  -- Stable order: the client pages this result under PostgREST's max_rows.
  ORDER BY e.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_nationals_leaderboard_inputs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nationals_leaderboard_inputs(uuid) FROM anon;
-- Passcode sessions are anonymous Supabase sessions that authenticate as the
-- `authenticated` role; the claim arm above admits them by show.
GRANT EXECUTE ON FUNCTION public.get_nationals_leaderboard_inputs(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_nationals_leaderboard_inputs(uuid) IS
  'MYK9-1540: leaderboard input rows for one nationals show, for ringside staff only (site admin, club manager, steward, ringside passcode claim, assigned judge). Scores arrive only for classes with results_released_at set. Other callers, non-nationals shows and unknown shows return no rows.';
