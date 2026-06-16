-- =============================================================================
-- Migration 20260616120000: Server-side gate for public/anon scored results
--
-- PROBLEM (pre-existing): the per-field result-visibility cascade (placement /
-- qualification / time / faults, each timed immediate | class_complete |
-- manual_release, resolved show -> trial -> class) was enforced ONLY client-side.
-- Anon held a broad SELECT on `entries` (policy entries_anon_select_for_tv,
-- migration 108) covering every column of every non-draft show's entries, with
-- no predicate on release state. So an anonymous user could directly query
-- withheld placements/results (final_placement, result_status, search_time_seconds,
-- total_faults, total_score) for an un-released class -- and, via `select(*)` on
-- the public detail pages, also payment/PII columns.
--
-- FIX: move enforcement into the database.
--   1. resolve_class_result_visibility() ports the show->trial->class cascade to
--      SQL and returns per-field visibility booleans for a class.
--   2. view_public_entry_results is an owner-run view that exposes ONLY safe
--      identity/scheduling columns plus scored columns CASE-nulled per the
--      resolved cascade. Anon reads results through this view.
--   3. Anon's broad table SELECT on `entries` is revoked and replaced with a
--      SELECT grant on a safe column allowlist (no scored, no PII columns).
--      Postgres cannot subtract a single column from a table-wide grant, so the
--      revoke + allowlist is the only way to stop direct anon column reads.
--
-- Row visibility for anon is still governed by the existing
-- entries_anon_select_for_tv policy (kept). Grants and RLS are orthogonal; both
-- remain required. Authenticated access is unchanged.
-- =============================================================================

-- -------------------------------------------------------------------------
-- Helper: expand a preset name to a field's timing (mirrors PRESET_CONFIGS in
-- packages/secretary/src/visibility/visibility-presets.ts)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._result_visibility_preset(p_preset text, p_field text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_preset
    WHEN 'open' THEN
      CASE WHEN p_field = 'placement' THEN 'class_complete' ELSE 'immediate' END
    WHEN 'standard' THEN
      CASE WHEN p_field = 'qualification' THEN 'immediate' ELSE 'class_complete' END
    WHEN 'review' THEN 'manual_release'
    ELSE NULL
  END;
$$;

-- -------------------------------------------------------------------------
-- Helper: is a field with the given timing visible in the given class state?
-- (mirrors shouldShowField in visibility-cascade.ts)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._result_timing_visible(p_timing text, p_state text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_timing
    WHEN 'immediate' THEN true
    WHEN 'class_complete' THEN p_state IN ('completed', 'released')
    WHEN 'manual_release' THEN p_state = 'released'
    ELSE false
  END;
$$;

-- -------------------------------------------------------------------------
-- Resolver: per-field visibility for a class, honoring the full cascade.
-- SECURITY DEFINER so it can read the authenticated-only visibility tables on
-- an anonymous caller's behalf. STABLE; locked search_path.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_class_result_visibility(p_class_id uuid)
RETURNS TABLE (
  placement_visible boolean,
  qualification_visible boolean,
  time_visible boolean,
  faults_visible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_id uuid;
  v_show_id uuid;
  v_status text;
  v_finalized boolean;
  v_released timestamptz;
  v_state text;
  tp text; tq text; tt text; tf text;   -- resolved timings (placement/qual/time/faults)
  ov record;
BEGIN
  -- 1. Class context
  SELECT c.trial_id, t.show_id, c.status, c.is_scoring_finalized, c.results_released_at
    INTO v_trial_id, v_show_id, v_status, v_finalized, v_released
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    -- Unknown class: hide everything (fail closed)
    RETURN QUERY SELECT false, false, false, false;
    RETURN;
  END IF;

  -- 2. Base = show defaults (hardcoded 'open' preset if no row exists)
  SELECT
    COALESCE(s.placement_timing, 'class_complete'),
    COALESCE(s.qualification_timing, 'immediate'),
    COALESCE(s.time_timing, 'immediate'),
    COALESCE(s.faults_timing, 'immediate')
  INTO tp, tq, tt, tf
  FROM public.show_result_visibility_defaults s
  WHERE s.show_id = v_show_id;

  IF NOT FOUND THEN
    tp := 'class_complete'; tq := 'immediate'; tt := 'immediate'; tf := 'immediate';
  END IF;

  -- 3. Trial override (preset expands as new base, then per-field non-null wins)
  SELECT * INTO ov FROM public.trial_result_visibility_overrides WHERE trial_id = v_trial_id;
  IF FOUND THEN
    IF ov.preset_name IS NOT NULL THEN
      tp := public._result_visibility_preset(ov.preset_name, 'placement');
      tq := public._result_visibility_preset(ov.preset_name, 'qualification');
      tt := public._result_visibility_preset(ov.preset_name, 'time');
      tf := public._result_visibility_preset(ov.preset_name, 'faults');
    END IF;
    tp := COALESCE(ov.placement_timing, tp);
    tq := COALESCE(ov.qualification_timing, tq);
    tt := COALESCE(ov.time_timing, tt);
    tf := COALESCE(ov.faults_timing, tf);
  END IF;

  -- 4. Class override (same precedence)
  SELECT * INTO ov FROM public.class_result_visibility_overrides WHERE class_id = p_class_id;
  IF FOUND THEN
    IF ov.preset_name IS NOT NULL THEN
      tp := public._result_visibility_preset(ov.preset_name, 'placement');
      tq := public._result_visibility_preset(ov.preset_name, 'qualification');
      tt := public._result_visibility_preset(ov.preset_name, 'time');
      tf := public._result_visibility_preset(ov.preset_name, 'faults');
    END IF;
    tp := COALESCE(ov.placement_timing, tp);
    tq := COALESCE(ov.qualification_timing, tq);
    tt := COALESCE(ov.time_timing, tt);
    tf := COALESCE(ov.faults_timing, tf);
  END IF;

  -- 5. Class state (mirrors deriveClassState in useVisibleResultFields.ts; a
  --    scoring-finalized class is treated as completed even if status lags)
  IF v_released IS NOT NULL THEN
    v_state := 'released';
  ELSIF lower(COALESCE(v_status, '')) = 'completed' OR v_finalized IS TRUE THEN
    v_state := 'completed';
  ELSE
    v_state := 'in_progress';
  END IF;

  -- 6. Per-field visibility
  RETURN QUERY SELECT
    public._result_timing_visible(tp, v_state),
    public._result_timing_visible(tq, v_state),
    public._result_timing_visible(tt, v_state),
    public._result_timing_visible(tf, v_state);
END;
$$;

-- -------------------------------------------------------------------------
-- Public view: safe columns + cascade-nulled scored columns. Owner-run
-- (security_invoker = false) so it can null scored columns the anon role is no
-- longer granted; embeds the non-draft-show row filter since RLS is bypassed.
-- total_score follows the `time` field (numeric performance metric) — flagged
-- for review.
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS public.view_public_entry_results;

CREATE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
SELECT
  e.id,
  e.class_id,
  c.trial_id,
  e.show_id,
  e.dog_id,
  e.armband,
  e.handler,
  e.run_order,
  e.is_in_ring,
  e.is_scored,
  e.check_in_status,
  e.entry_status,
  e.scoring_completed_at,
  e.created_at,
  -- Scored columns, nulled when the resolved per-field cascade hides them
  CASE WHEN vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN vis.qualification_visible THEN e.result_status END AS result_status,
  CASE WHEN vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'qualified' THEN 'Q'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'nq'        THEN 'NQ'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'absent'    THEN 'ABS'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'excused'   THEN 'EX'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at
FROM public.entries e
JOIN public.classes c ON c.id = e.class_id
JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) vis
WHERE e.deleted_at IS NULL
  AND sh.deleted_at IS NULL
  AND sh.status IN ('published', 'upcoming', 'in_progress', 'completed');

-- -------------------------------------------------------------------------
-- Grants
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.resolve_class_result_visibility(uuid) TO anon, authenticated;
GRANT SELECT ON public.view_public_entry_results TO anon, authenticated;

-- Replace anon's broad table SELECT with a safe column allowlist. Scored and
-- PII columns are deliberately omitted; new columns are not auto-granted, so
-- the default is safe.
--
-- Defensive: anon's current SELECT may have been granted directly to the `anon`
-- role (Supabase bootstrap convention) OR via the PUBLIC pseudo-role. Revoke
-- both so the allowlist cannot be silently bypassed, then re-grant the
-- non-anon roles explicitly so a PUBLIC revoke cannot strip their access.
-- Verify on the live project before push:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='entries' ORDER BY grantee;
REVOKE SELECT ON public.entries FROM anon;
REVOKE SELECT ON public.entries FROM PUBLIC;

GRANT SELECT ON public.entries TO authenticated;
GRANT SELECT ON public.entries TO service_role;

GRANT SELECT (
  id,
  class_id,
  trial_id,
  show_id,
  dog_id,
  armband,
  handler,
  run_order,
  is_in_ring,
  is_scored,
  check_in_status,
  entry_status,
  jump_height,
  created_at
) ON public.entries TO anon;

NOTIFY pgrst, 'reload schema';
