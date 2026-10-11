-- MYK9-1011: a stored Disqualified (DQ) result.
--
-- Scoring could only record Excused, so a dog disqualified for an attack
-- (AKC Scent Work Regs Ch.3 s.36 / Ch.11; UKC Nose Work Rules) printed as EXC on
-- the official marked catalog. This adds result_status = 'disqualified'. The
-- reason rides in the existing entries.disqualification_reason column.
--
-- A DQ is treated exactly like 'excused' wherever the server decides whether a
-- dog is accounted for, still queued, or visible as a result:
--   * accounted for (class completion derivation, MYK9-356),
--   * not in the waiting queue, never reopens a completed class when scored,
--   * counted as a scored result for the entitlement trial rule,
--   * result_text 'DQ' on every results view (public ELSE would read 'pending').
-- It is not 'qualified', so recalculate_class_placements (which ranks only
-- result_status = 'qualified') never places it, and count_dog_blocking_entries
-- (<> 'pending') already counts it. Those two are deliberately NOT re-created.
--
-- Every body below is copied from the LATEST migration that defines it, with the
-- one change noted:
--   refresh_class_scoring_state             20261003200000
--   handle_entry_scoring_state_change       20261009231900
--   get_my_entry_queue_places               20261005014900
--   get_own_entitlement_context             20260724120000
--   view_public_entry_results               20261004152300
--   view_authenticated_entry_results        20261004152300 (the _replication wrapper
--                                           selects from it with an unchanged column
--                                           list; re-emitted verbatim below for the
--                                           rebuild-from-migrations contract)
--   view_entry_with_results                 20260817170000
-- Views carry their WITH (security_invoker = ...) inline, as the live definitions
-- have it: public/authenticated = false, view_entry_with_results = true
-- (20260613100000 / 20260817190000).
--
-- manual_results (042) keeps its own CHECK: it records historical external
-- results and has no scoring path.
--
-- NOT PUSHED by the authoring agent.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. entries.result_status CHECK. Declared inline in 003, so its name is the
--    auto-generated entries_result_status_check; drop whatever CHECK on
--    entries mentions result_status (and nothing else) rather than trusting it.
-- ---------------------------------------------------------------------------
DO $dq$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.entries'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%result_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.entries DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$dq$;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_result_status_check
  CHECK (result_status IN (
    'pending', 'qualified', 'nq', 'absent', 'excused', 'disqualified', 'withdrawn'
  ));

-- ---------------------------------------------------------------------------
-- 2. refresh_class_scoring_state: accounted = scored OR absent/excused/disqualified
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_accounted_count integer;
  v_scored_count integer;
  v_status_source text;
  v_is_nationals boolean;
  v_first_activity timestamptz;
  v_last_scored timestamptz;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
        AND (is_scored = true OR result_status IN ('absent', 'excused', 'disqualified'))
    )::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_expected_count, v_accounted_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  -- When the class actually ran. LEAST ignores NULLs, so either recorded
  -- moment of a dog counts toward the start.
  SELECT
    MIN(LEAST(ring_entry_time, scoring_completed_at)),
    MAX(scoring_completed_at) FILTER (WHERE is_scored = true)
  INTO v_first_activity, v_last_scored
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  SELECT status_source
  INTO v_status_source
  FROM public.classes
  WHERE id = p_class_id;

  IF v_status_source = 'manual' THEN
    UPDATE public.classes
    SET scored_count = v_scored_count
    WHERE id = p_class_id
      AND scored_count IS DISTINCT FROM v_scored_count;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND deleted_at IS NOT NULL
      AND final_placement IS NOT NULL;

    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = NULL,
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NOT NULL
           OR actual_end_time IS NOT NULL);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSIF v_accounted_count = v_expected_count THEN
    SELECT s.is_nationals
    INTO v_is_nationals
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
    WHERE c.id = p_class_id;

    UPDATE public.classes
    SET
      status = 'completed',
      scored_count = v_scored_count,
      is_scoring_finalized = true,
      reopened_after_closeout_at = NULL,
      actual_start_time = COALESCE(actual_start_time, v_first_activity, now()),
      -- Never before the start: a start from now() can postdate a backdated
      -- score that arrives later by offline sync.
      actual_end_time = GREATEST(
        COALESCE(actual_end_time, v_last_scored, now()),
        COALESCE(actual_start_time, v_first_activity, now())
      )
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'completed'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM true
           OR reopened_after_closeout_at IS NOT NULL
           OR actual_start_time IS NULL
           OR actual_end_time IS NULL);

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = COALESCE(actual_start_time, v_first_activity, now()),
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'in_progress'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NULL
           OR actual_end_time IS NOT NULL);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = NULL,
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NOT NULL
           OR actual_end_time IS NOT NULL);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives class completion from non-deleted entries. Expected entries exclude '
  'scratched, withdrawn, moved, not_accepted, absent, and pulled rows; '
  'accounted entries are scored or have result_status absent/excused/disqualified (MYK9-356, MYK9-1011). '
  'A derived class also gets actual_start_time / actual_end_time from its '
  'entries'' ring-entry and scoring times; a manual class keeps its own.';

-- ---------------------------------------------------------------------------
-- 3. handle_entry_scoring_state_change: a DQ is not an unscored dog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_expected boolean;
  v_class_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.class_id IS NOT NULL THEN
      v_is_expected := (
        NEW.deleted_at IS NULL
        AND COALESCE(NEW.entry_status, '') NOT IN (
          'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
        )
        AND NEW.check_in_status IS DISTINCT FROM 'pulled'
      );

      IF v_is_expected THEN
        SELECT status
        INTO v_class_status
        FROM public.classes
        WHERE id = NEW.class_id;

        IF v_class_status = 'completed' THEN
          UPDATE public.classes
          SET
            status_source = 'derived',
            reopened_after_closeout_at = now()
          WHERE id = NEW.class_id;
        END IF;
      END IF;

      PERFORM public.refresh_class_scoring_state(NEW.class_id);
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.class_id IS DISTINCT FROM NEW.class_id THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
  END IF;

  -- MYK9-1086: a score reset in a completed class reopens it, exactly like a
  -- late expected entry above. Without this a class the secretary marked
  -- Complete by hand (status_source = 'manual') stayed Complete with a dog
  -- unscored, because the derivation skips manual classes. Only the
  -- scored -> unscored edge reopens: scoring more dogs into a manually closed
  -- class still leaves it closed (class_status_auto_derivation_test 3.2).
  IF NEW.class_id IS NOT NULL
     AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id
     AND NEW.deleted_at IS NULL
     -- Same expected-entry filter as the late-entry branch: clearing a stale
     -- score on a scratched or pulled dog is not a dog owed a run.
     AND COALESCE(NEW.entry_status, '') NOT IN (
       'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
     )
     AND NEW.check_in_status IS DISTINCT FROM 'pulled'
     AND NEW.result_status IS DISTINCT FROM 'absent'
     AND NEW.result_status IS DISTINCT FROM 'excused'
     AND NEW.result_status IS DISTINCT FROM 'disqualified'
     AND OLD.is_scored = true
     AND NEW.is_scored IS DISTINCT FROM true THEN
    UPDATE public.classes
    SET
      status_source = 'derived',
      reopened_after_closeout_at = now()
    WHERE id = NEW.class_id
      AND status = 'completed';
  END IF;

  PERFORM public.refresh_class_scoring_state(NEW.class_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_entry_scoring_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_entry_scoring_state_change() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. get_my_entry_queue_places: a DQ'd dog is not waiting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_entry_queue_places(p_entry_ids uuid[])
RETURNS TABLE (entry_id uuid, place integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT p.id AS person_id
      FROM public.people p
     WHERE p.auth_user_id = (SELECT auth.uid())
  ),
  -- The caller's own entries among the request, capped so one call cannot
  -- fan out over a whole show's classes.
  mine AS (
    SELECT e.id, e.class_id, e.run_order
      FROM public.entries e
     WHERE e.id = ANY (p_entry_ids[1:200])
       AND e.deleted_at IS NULL
       AND (
         EXISTS (SELECT 1 FROM me WHERE me.person_id = e.handler_id)
         OR EXISTS (
           SELECT 1
             FROM public.dogs d
             JOIN me ON me.person_id = d.owner_id
            WHERE d.id = e.dog_id
         )
       )
  ),
  waiting AS (
    SELECT q.id,
           row_number() OVER (
             PARTITION BY q.class_id
             ORDER BY q.sort_key, q.armband_key, q.id
           )::integer AS place
      FROM (
        SELECT e.id,
               e.class_id,
               a.armband_key,
               coalesce(nullif(e.run_order, 0)::numeric, a.armband_key) AS sort_key
          FROM public.entries e
          -- parseInt semantics: leading whitespace, optional sign, digits; else 0
          CROSS JOIN LATERAL (
            SELECT coalesce(substring(e.armband FROM '^\s*([+-]?[0-9]+)')::numeric, 0) AS armband_key
          ) a
         WHERE e.class_id IN (SELECT m.class_id FROM mine m WHERE m.class_id IS NOT NULL)
           -- runnable (isRunnableEntry)
           AND e.deleted_at IS NULL
           AND lower(btrim(coalesce(e.entry_status, ''))) NOT IN
               ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
           AND lower(btrim(coalesce(e.check_in_status, ''))) <> 'pulled'
           AND NOT coalesce(e.is_scored, false)
           AND lower(btrim(coalesce(e.result_status, ''))) NOT IN ('absent', 'excused', 'disqualified')
           -- still to run (isInQueue's allowlist, check-in axis)
           AND coalesce(e.check_in_status, 'no-status') IN
               ('no-status', 'checked-in', 'at-gate', 'come-to-gate', 'conflict', 'in-ring')
           -- the in-ring dog is not in the waiting queue (runQueue INTENT)
           AND NOT coalesce(e.is_in_ring, false)
           AND coalesce(e.check_in_status, '') <> 'in-ring'
      ) q
  )
  SELECT m.id AS entry_id,
         CASE WHEN coalesce(m.run_order, 0) <> 0 THEN w.place END AS place
    FROM mine m
    LEFT JOIN waiting w ON w.id = m.id;
$$;

COMMENT ON FUNCTION public.get_my_entry_queue_places(uuid[]) IS
  'MYK9-995: 1-based place in the ringside waiting queue for the caller''s own entries (handler or dog owner). Counts only; NULL when not waiting or run order unset.';

REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. get_own_entitlement_context: a DQ is a scored result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_entitlement_context()
RETURNS TABLE (
  evaluated_at timestamptz,
  paid_tier text,
  paid_expires_at timestamptz,
  grant_type text,
  grant_status text,
  grant_starts_at timestamptz,
  grant_ends_at timestamptz,
  scored_show_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_now timestamptz := now();
  v_grant public.subscription_entitlement_grants%ROWTYPE;
  v_status text;
  v_scored integer := 0;
  v_paid_tier text;
  v_paid_expires timestamptz;
BEGIN
  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

  IF v_person_id IS NULL THEN
    -- No linked person: return a single row of nulls with server time so the
    -- resolver still has evaluatedAt and can render free.
    RETURN QUERY SELECT v_now, NULL::text, NULL::timestamptz, NULL::text,
                        NULL::text, NULL::timestamptz, NULL::timestamptz, 0;
    RETURN;
  END IF;

  SELECT ep.subscription_tier, ep.subscription_expires_at
    INTO v_paid_tier, v_paid_expires
  FROM public.exhibitor_profiles ep
  WHERE ep.person_id = v_person_id;

  -- Prefer the currently-active grant; otherwise the most recently created row.
  SELECT g.* INTO v_grant
  FROM public.subscription_entitlement_grants g
  WHERE g.person_id = v_person_id
  ORDER BY
    (g.revoked_at IS NULL
       AND g.superseded_at IS NULL
       AND g.starts_at <= v_now
       AND g.ends_at > v_now) DESC,
    g.created_at DESC
  LIMIT 1;

  IF v_grant.id IS NOT NULL THEN
    IF v_grant.revoked_at IS NOT NULL THEN
      v_status := 'revoked';
    ELSIF v_grant.superseded_at IS NOT NULL THEN
      v_status := 'superseded';
    ELSIF v_grant.ends_at <= v_now THEN
      v_status := 'expired';
    ELSIF v_grant.starts_at > v_now THEN
      -- Future-dated grant (legal: a later non-overlapping gift). NOT yet
      -- premium; Slice 3B's resolver must treat 'scheduled' as non-premium.
      v_status := 'scheduled';
    ELSE
      v_status := 'active';
    END IF;
  END IF;

  SELECT count(DISTINCT e.show_id) INTO v_scored
  FROM public.entries e
  JOIN public.dogs d ON d.id = e.dog_id
  CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
  WHERE (d.owner_id = v_person_id OR d.co_owner_id = v_person_id)
    AND e.is_scored = true
    AND e.result_status IN ('qualified', 'nq', 'absent', 'excused', 'disqualified', 'withdrawn')
    AND (
      vis.qualification_visible
      -- can_view_scores path of view_authenticated_entry_results: show manager
      -- or the class's assigned judge sees result_text before release.
      OR public.can_manage_show(e.show_id)
      OR EXISTS (
        SELECT 1
        FROM public.judge_assignments ja
        WHERE ja.person_id = v_person_id
          AND ja.class_id = e.class_id
          AND ja.status IN ('confirmed', 'invited')
      )
    );

  RETURN QUERY SELECT
    v_now,
    v_paid_tier,
    v_paid_expires,
    v_grant.grant_type,
    v_status,
    v_grant.starts_at,
    v_grant.ends_at,
    COALESCE(v_scored, 0);
END;
$$;

COMMENT ON FUNCTION public.get_own_entitlement_context() IS
  'Sanitized own-account entitlement projection for the unified resolver. '
  'Exposes source/status/start/end + scored-show count only; never reason or '
  'actor ids. grant_status is one of active|scheduled|expired|revoked|'
  'superseded; only "active" is currently Premium (scheduled = future-dated, '
  'not yet Premium — Slice 3B''s resolver must treat it as non-premium).';

REVOKE ALL ON FUNCTION public.get_own_entitlement_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_entitlement_context() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. view_public_entry_results: result_text 'DQ'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 WITH caller_context AS MATERIALIZED (
   SELECT * FROM private.entry_results_caller_context()
 )
 SELECT
    -- MYK9-969: a private entry keeps its place in the standings but loses
    -- everything that names it or joins it back to a named row. The id is a
    -- fresh random uuid per read: the real entry id is visible to every other
    -- exhibitor at the show through view_authenticated_entry_results, so it
    -- would undo the anonymisation.
    CASE WHEN privacy.masked THEN gen_random_uuid() ELSE e.id END AS id,
    e.class_id AS class_id,
    c.trial_id,
    e.show_id,
    CASE WHEN privacy.masked THEN NULL::uuid ELSE e.dog_id END AS dog_id,
    CASE WHEN privacy.masked THEN NULL::text ELSE e.armband END AS armband,
    CASE WHEN privacy.masked THEN NULL::text ELSE e.handler END AS handler,
    CASE WHEN privacy.masked THEN NULL::integer ELSE e.run_order END AS run_order,
    e.is_in_ring AS is_in_ring,
    e.is_scored AS is_scored,
    e.check_in_status AS check_in_status,
    e.entry_status AS entry_status,
    CASE WHEN privacy.masked THEN NULL::timestamptz ELSE e.scoring_completed_at END AS scoring_completed_at,
    CASE WHEN privacy.masked THEN NULL::timestamptz ELSE e.created_at END AS created_at,
    -- Placement stays: "Private entry" is shown AT its place so the standings
    -- still read correctly (MYK9-969 owner decision). Qualification stays for
    -- the same reason -- it is what the placement and the class's Q tally are
    -- made of, and on an anonymous row it names no one.
    CASE
      WHEN vis.placement_visible THEN e.final_placement
      ELSE NULL::integer
    END AS final_placement,
    CASE
      WHEN vis.qualification_visible THEN e.result_status
      ELSE NULL::text
    END AS result_status,
    CASE
      WHEN vis.time_visible AND NOT privacy.masked THEN e.search_time_seconds
      ELSE NULL::numeric
    END AS search_time_seconds,
    CASE
      WHEN vis.time_visible AND NOT privacy.masked THEN e.total_score
      ELSE NULL::numeric
    END AS total_score,
    CASE
      WHEN vis.faults_visible AND NOT privacy.masked THEN e.total_faults
      ELSE NULL::integer
    END AS total_faults,
    CASE
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'qualified'::text THEN 'Q'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'nq'::text THEN 'NQ'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'absent'::text THEN 'ABS'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'excused'::text THEN 'EX'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'disqualified'::text THEN 'DQ'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'withdrawn'::text THEN 'WD'::text
      ELSE 'pending'::text
    END AS result_text,
    CASE WHEN privacy.masked THEN 'Private entry'::text ELSE d.name END AS dog_name,
    CASE WHEN privacy.masked THEN 'Private entry'::text ELSE d.call_name END AS dog_call_name,
    CASE WHEN privacy.masked THEN NULL::text ELSE d.breed END AS dog_breed,
    CASE WHEN privacy.masked THEN NULL::text ELSE d.image_url END AS dog_image_url,
    c.name AS class_name,
    c.level AS class_level,
    c.element AS class_element,
    c.results_released_at AS class_results_released_at,
    -- MYK9-969, appended last (CREATE OR REPLACE VIEW only adds columns at the
    -- end): TRUE when the row above is the anonymised "Private entry" shape.
    privacy.masked AS results_private
   FROM public.entries e
     JOIN public.classes c ON c.id = e.class_id
     JOIN public.shows sh ON sh.id = e.show_id
     LEFT JOIN public.trials t ON t.id = c.trial_id
     LEFT JOIN public.dogs d ON d.id = e.dog_id
     LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
     CROSS JOIN caller_context ctx
     LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
     CROSS JOIN LATERAL (
       SELECT
         COALESCE(cvr.placement_visible, false) AS placement_visible,
         COALESCE(cvr.qualification_visible, false) AS qualification_visible,
         COALESCE(cvr.time_visible, false) AS time_visible,
         COALESCE(cvr.faults_visible, false) AS faults_visible
     ) vis
     -- MYK9-969: the same consent rule view_authenticated_entry_results applies
     -- (see that view): public only when the show is not private and every
     -- tied person opted in through their own account.
     CROSS JOIN LATERAL (
       SELECT bool_and(COALESCE(tep.results_public, false)) AS all_opted_in
       FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
       LEFT JOIN public.people tp ON tp.id = tied.person_id
       LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
       WHERE tied.person_id IS NOT NULL
     ) consent
     CROSS JOIN LATERAL (
       SELECT (
         (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
         -- Only the people tied to the entry see it unmasked HERE. This view is
         -- the PUBLIC read: TV displays, the public podium and class results
         -- pages are public by intent, and a secretary signed in on a venue
         -- screen must not unmask the show for the room. Staff read every
         -- result through view_authenticated_entry_results and the reports.
         AND NOT COALESCE(
           ctx.person_id IS NOT NULL
           AND ctx.person_id IN (e.handler_id, d.owner_id, d.co_owner_id),
           false
         )
       ) AS masked
     ) privacy
  WHERE e.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.results_released_at IS NOT NULL
    AND (t.id IS NULL OR t.deleted_at IS NULL)
    AND sh.deleted_at IS NULL
    AND sh.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]);

GRANT SELECT ON public.view_public_entry_results TO anon;
GRANT SELECT ON public.view_public_entry_results TO authenticated;

COMMENT ON VIEW public.view_public_entry_results IS
  'Anon-readable RELEASED results only. The WHERE clause requires '
  'classes.results_released_at IS NOT NULL, so a class whose results are not '
  'released yields NO ROWS at all - no entry identity, and no class or show '
  'identifiers either. Within a released class the vis.*_visible guards still '
  'decide which scored columns (placement, qualification, time, faults) are '
  'published. MYK9-969 results privacy: an entry is public only when the show is '
  'not private and every tied person (dog owner, co-owner, handler) opted in '
  '(exhibitor_profiles.results_public, read through the person''s own account). '
  'For any caller but a tied person -- show staff included, since this is the '
  'public read (staff read every result via view_authenticated_entry_results) -- a private entry keeps '
  'its placement and qualification but is anonymised: a random per-read id, '
  'dog_name/dog_call_name ''Private entry'', and NULL dog_id, armband, handler, '
  'run_order, timestamps, breed, image, time, score and faults; results_private '
  'is TRUE. Owner-run (security_invoker = false): this body is the only guard '
  'anon meets, so do not remove the results_released_at predicate (MYK9-466, MYK9-552).';

-- ---------------------------------------------------------------------------
-- 7. view_authenticated_entry_results: result_text 'DQ'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  SELECT * FROM private.entry_results_caller_context()
)
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  CASE WHEN access.can_view_admin THEN e.payment_status END AS payment_status,
  e.handler,
  (CASE WHEN access.can_view_admin THEN e.entry_fee END)::numeric(10,2) AS entry_fee,
  e.submitted_at,
  CASE WHEN access.can_view_admin THEN e.special_requests END AS special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_view_scores OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_view_scores THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_view_scores THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_view_scores OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_view_scores THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_view_scores THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_view_scores THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_view_scores THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_view_scores THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_view_scores THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_view_scores THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_view_scores THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_view_scores THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_view_scores THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_view_scores THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_view_scores THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_view_scores THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_view_scores THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_view_scores THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_view_scores THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_view_scores THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_view_scores THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_view_scores THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_view_scores THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_view_scores THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  GREATEST(
    e.updated_at,
    c.updated_at,
    sh.updated_at,
    show_vis.updated_at,
    trial_vis.updated_at,
    class_vis.updated_at,
    -- MYK9-969: every input to the privacy mask moves the row (see the
    -- header's input table): tied people's profiles and people rows, the
    -- dog's ownership, and the one-time epoch of this migration.
    consent.profiles_updated_at,
    d.updated_at,
    (SELECT max(epoch.updated_at) FROM private.results_privacy_epoch epoch)
  ) AS updated_at,
  e.deleted_at,
  CASE WHEN access.can_view_admin THEN e.deleted_by END AS deleted_by,
  e.check_in_status,
  CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason,
  (CASE WHEN access.can_view_admin THEN e.refund_amount END)::numeric(10,2) AS refund_amount,
  CASE WHEN access.can_view_admin THEN e.refund_notes END AS refund_notes,
  CASE WHEN access.can_view_admin THEN e.refunded_at END AS refunded_at,
  CASE WHEN access.can_view_admin THEN e.stripe_payment_intent_id END AS stripe_payment_intent_id,
  CASE WHEN access.can_view_admin THEN e.comped END AS comped,
  CASE WHEN access.can_view_admin THEN e.comped_reason END AS comped_reason,
  (CASE WHEN access.can_view_admin THEN e.discount_amount END)::numeric(10,2) AS discount_amount,
  CASE WHEN access.can_view_admin THEN e.promo_code_id END AS promo_code_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at,
  sh.name AS show_name,
  sh.start_date AS show_start_date,
  sh.organization AS show_organization,
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes,
  -- MYK9-632: the ENUMERATED withdrawal reason, beside the free-text
  -- `withdrawal_reason` above and masked by the same `can_view_admin` (a show
  -- manager, or the entry's own exhibitor). Appended at the END of the select
  -- list because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code,
  -- MYK9-639: the supersession link. Structural, not financial, so it is NOT
  -- masked by can_view_admin -- it is the same kind of fact as e.class_id, and
  -- anyone this view already admits to the row may know which entry this one
  -- replaced. Appended at the END of the select list because CREATE OR REPLACE
  -- VIEW may only add columns there.
  e.moved_from_entry_id,
  -- MYK9-659: the ORDER's human reference. `enrollments.confirmation_number`
  -- is NOT NULL and defaulted from generate_confirmation_number(), and
  -- submit_show_entries always writes entries.registration_id, so every
  -- order the app creates has one. It reached the client only through the
  -- PostgREST `registration:registration_id(...)` embed, which the offline
  -- replica path cannot make -- so the same order printed `Confirmation #:
  -- MK9-000146` online and a raw enrollment UUID offline.
  --
  -- NOT the sibling of `payment_reference` above. That is an `entries` column,
  -- also reachable under `entries` RLS; this is a CROSS-TABLE column from
  -- `public.enrollments`, reached by an owner-run LEFT JOIN that evaluates no
  -- `enrollments` policy, so `access.can_view_admin` is its ONLY guard -- and
  -- a different predicate from `enrollments_select`, which matches the
  -- enrollment's own handler_id. Deliberate: the order reference belongs to
  -- whoever the ENTRY belongs to, so the entry's handler or the dog's owner
  -- sees the reference of the order their entry is on, even when another
  -- person placed it. Both client read paths apply that one rule.
  --
  -- Appended at the END of the select list because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_admin THEN en.confirmation_number END AS registration_confirmation_number,
  -- MYK9-969: TRUE when this row's results are private and the caller is
  -- neither show staff nor a person tied to the entry, so every result column
  -- above arrived NULL for that reason (not because results are unreleased).
  -- Appended at the END: CREATE OR REPLACE VIEW may only add columns there.
  privacy.masked AS results_private
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS cascade_vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
    ) AS can_manage,
    e.class_id = ANY(ctx.assigned_class_ids) AS is_assigned_judge,
    (
      e.show_id = ANY(ctx.steward_show_ids)
      OR sh.club_id = ANY(ctx.steward_club_ids)
    ) AS is_show_steward,
    (
      ctx.person_id = e.handler_id
      OR EXISTS (
        SELECT 1
        FROM public.dogs owned_dog
        WHERE owned_dog.id = e.dog_id
          AND owned_dog.owner_id = ctx.person_id
      )
    ) AS is_own_entry,
    EXISTS (
      SELECT 1
      FROM public.entries own_e
      LEFT JOIN public.dogs own_dog ON own_dog.id = own_e.dog_id
      WHERE own_e.show_id = e.show_id
        AND own_e.deleted_at IS NULL
        AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        AND (
          own_e.handler_id = ctx.person_id
          OR own_dog.owner_id = ctx.person_id
          OR own_dog.co_owner_id = ctx.person_id
        )
    ) AS is_show_exhibitor,
    (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = e.show_id::text
      AND ctx.claim_generation_current
    ) AS claim_show_match,
    ctx.claim_role
) AS flags
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    flags.is_show_exhibitor,
    (flags.claim_show_match AND flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim,
    (
      flags.can_manage
      OR flags.is_assigned_judge
      OR (flags.claim_show_match AND flags.claim_role IN ('judge', 'admin'))
    ) AS can_view_scores,
    (flags.can_manage OR flags.is_own_entry) AS can_view_admin
) AS access
-- MYK9-969: results privacy. An entry's results are PUBLIC only when the show
-- is not private AND every person tied to the entry (the dog's owner and
-- co-owner, the entry's handler) has opted in on their own account. Most
-- private wins; an entry with no tied person, or a tied person with no
-- account, stays private (nobody opted in).
--
-- The opt-in is read through the person's OWN account: people.auth_user_id ->
-- exhibitor_profiles.auth_user_id (unique on both sides). It is never read via
-- exhibitor_profiles.person_id, which the row's own user may rewrite under the
-- self-only UPDATE policy -- keying on it would let anyone opt a stranger in.
CROSS JOIN LATERAL (
  SELECT
    bool_and(COALESCE(tep.results_public, false)) AS all_opted_in,
    -- people.updated_at too: relinking an account changes WHICH profile
    -- counts, and a deleted profile touches its person (trigger above).
    max(GREATEST(tep.updated_at, tp.updated_at)) AS profiles_updated_at
  FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
  LEFT JOIN public.people tp ON tp.id = tied.person_id
  LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
  WHERE tied.person_id IS NOT NULL
) AS consent
CROSS JOIN LATERAL (
  SELECT
    (
      (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
      -- COALESCE: the claim arms are NULL (not false) for a caller with no
      -- ringside claim, and a NULL here would leave results_private NULL.
      AND NOT COALESCE(
        -- Show staff see every result: manager, the class's judge, a steward,
        -- and a current ringside judge/steward/admin passcode session.
        access.can_view_scores
        OR access.is_show_steward
        OR access.is_ringside_claim
        -- The people tied to the entry see their own results.
        OR access.is_own_entry
        OR (ctx.person_id IS NOT NULL AND ctx.person_id = d.co_owner_id),
        false
      )
    ) AS masked
) AS privacy
-- The cascade-visible flags, with privacy applied on top. Every result column
-- above reads `vis`, so masking here leaves their expressions byte-identical.
-- can_view_scores already short-circuits those columns for staff.
CROSS JOIN LATERAL (
  SELECT
    cascade_vis.placement_visible     AND NOT privacy.masked AS placement_visible,
    cascade_vis.qualification_visible AND NOT privacy.masked AS qualification_visible,
    cascade_vis.time_visible          AND NOT privacy.masked AS time_visible,
    cascade_vis.faults_visible        AND NOT privacy.masked AS faults_visible
) AS vis
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE ALL ON public.view_authenticated_entry_results FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false.';


-- ---------------------------------------------------------------------------
-- 7b. view_authenticated_entry_results_replication: re-emitted verbatim from
-- 20261004152300 (unchanged), because a rebuild-from-migrations check resolves
-- the inner view and its wrapper from the same latest file.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.id,
  entries.dog_id,
  entries.class_id,
  entries.show_id,
  entries.trial_id,
  entries.handler_id,
  entries.entry_status,
  entries.payment_status,
  entries.handler,
  entries.entry_fee,
  entries.submitted_at,
  entries.special_requests,
  entries.armband,
  entries.run_order,
  entries.jump_height,
  entries.preferred_judge,
  entries.move_up_requested,
  entries.is_scored,
  entries.is_in_ring,
  entries.result_status,
  entries.ring_entry_time,
  entries.ring_exit_time,
  entries.scoring_started_at,
  entries.scoring_completed_at,
  entries.search_time_seconds,
  entries.area1_time_seconds,
  entries.area2_time_seconds,
  entries.area3_time_seconds,
  entries.area4_time_seconds,
  entries.total_correct_finds,
  entries.total_incorrect_finds,
  entries.total_faults,
  entries.no_finish_count,
  entries.area1_correct,
  entries.area1_incorrect,
  entries.area1_faults,
  entries.area2_correct,
  entries.area2_incorrect,
  entries.area2_faults,
  entries.area3_correct,
  entries.area3_incorrect,
  entries.area3_faults,
  entries.total_score,
  entries.points_earned,
  entries.points_possible,
  entries.bonus_points,
  entries.penalty_points,
  entries.time_over_limit,
  entries.time_limit_exceeded_seconds,
  entries.final_placement,
  entries.judge_notes,
  entries.judge_signature,
  entries.judge_signature_timestamp,
  entries.disqualification_reason,
  entries.has_video_review,
  entries.video_review_notes,
  entries.license_key,
  entries.local_id,
  entries.sync_version,
  entries.last_synced_at,
  entries.created_at,
  entries.updated_at,
  entries.deleted_at,
  entries.deleted_by,
  entries.check_in_status,
  entries.payment_method,
  entries.entry_source,
  entries.is_day_of_show,
  entries.registration_id,
  entries.withdrawal_reason,
  entries.refund_amount,
  entries.refund_notes,
  entries.refunded_at,
  entries.stripe_payment_intent_id,
  entries.comped,
  entries.comped_reason,
  entries.discount_amount,
  entries.promo_code_id,
  entries.confirmation_email_sent_at,
  entries.confirmation_email_message_id,
  entries.confirmation_email_status,
  entries.version,
  entries.result_text,
  entries.dog_name,
  entries.dog_call_name,
  entries.dog_breed,
  entries.dog_image_url,
  entries.class_name,
  entries.class_level,
  entries.class_element,
  entries.class_results_released_at,
  entries.show_name,
  entries.show_start_date,
  entries.show_organization,
  entries.is_own_entry,
  entries.payment_reference,
  entries.payment_received_on,
  entries.payment_notes,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date,
  -- Appended last: CREATE OR REPLACE VIEW may only add columns at the end, and
  -- the four `shows` columns above already hold ordinals 99-102.
  entries.withdrawal_reason_code,
  -- MYK9-639, appended last for the same CREATE OR REPLACE reason.
  entries.moved_from_entry_id,
  -- MYK9-659, appended last for the same CREATE OR REPLACE reason. Already
  -- masked by the inner view; the wrapper only carries it.
  entries.registration_confirmation_number,
  -- MYK9-969, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.results_private
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;

GRANT SELECT ON public.view_authenticated_entry_results_replication TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results_replication TO service_role;
-- REVOKE ALL, not REVOKE SELECT. 20260901120000 created this wrapper with
-- CREATE OR REPLACE under this project's ALTER DEFAULT PRIVILEGES, which hands
-- anon full arwdDxtm on a newly created relation, and only SELECT was ever
-- taken back; 20260912183000 revoked the dormant writes from `authenticated`
-- but not from `anon`. The view is not updatable (multi-table), so the
-- residue is inert -- but owner-run plus a standing write grant is exactly
-- the pairing that migration existed to remove, and this file already
-- re-asserts the ACL.
REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results_replication FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results_replication IS
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions. The select list is explicit (MYK9-632): `entries.*` re-expanded on every rebuild and would have reordered the columns the moment the inner view gained one. moved_from_entry_id (MYK9-639) is appended after it. registration_confirmation_number (MYK9-659) is appended after that, so the offline receipt prints the same order reference as the online one -- guarded by the inner view''s can_view_admin alone (see that view''s comment), which is the entry''s access, not the enrollment''s. results_private (MYK9-969) is appended last and carried from the inner view, whose privacy mask already NULLed the result columns, so a replica on another exhibitor''s device never holds a private result.';

-- ---------------------------------------------------------------------------
-- 8. view_entry_with_results: result_text 'DQ' (security_invoker restored inline)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_entry_with_results
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  e.payment_status,
  e.handler,
  e.entry_fee,
  e.submitted_at,
  e.special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  e.search_time_seconds,
  e.area1_time_seconds,
  e.area2_time_seconds,
  e.area3_time_seconds,
  e.area4_time_seconds,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.total_faults,
  e.no_finish_count,
  e.area1_correct,
  e.area1_incorrect,
  e.area1_faults,
  e.area2_correct,
  e.area2_incorrect,
  e.area2_faults,
  e.area3_correct,
  e.area3_incorrect,
  e.area3_faults,
  e.total_score,
  e.points_earned,
  e.points_possible,
  e.bonus_points,
  e.penalty_points,
  e.time_over_limit,
  e.time_limit_exceeded_seconds,
  e.final_placement,
  e.judge_notes,
  e.judge_signature,
  e.judge_signature_timestamp,
  e.disqualification_reason,
  e.has_video_review,
  e.video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  e.updated_at,
  e.deleted_at,
  e.deleted_by,
  e.promo_code_id,
  e.discount_amount,
  e.comped,
  e.comped_reason,
  e.registration_id,
  e.check_in_status,
  CASE
    WHEN e.is_scored = TRUE AND e.result_status = 'qualified' THEN 'Q'
    WHEN e.is_scored = TRUE AND e.result_status = 'nq' THEN 'NQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'absent' THEN 'ABS'
    WHEN e.is_scored = TRUE AND e.result_status = 'excused' THEN 'EX'
    WHEN e.is_scored = TRUE AND e.result_status = 'disqualified' THEN 'DQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text,
  d.name as dog_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  c.name as class_name,
  c.level as class_level,
  c.element as class_element,
  c.results_released_at as class_results_released_at
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
WHERE e.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
