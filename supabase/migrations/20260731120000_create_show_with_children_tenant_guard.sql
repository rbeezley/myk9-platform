-- =============================================================================
-- Migration 20260731120000: reject cross-tenant nodes in create_show_with_children
--
-- PROBLEM (SA-2026-07-30-01 / MYK9-130, canonical P0).
-- The RPC authorizes only `p_show.club_id`, then inserts the caller-supplied show
-- UUID with `ON CONFLICT (id) DO NOTHING`. It never checks that a conflicting row
-- belongs to the authorized club. Because it is SECURITY DEFINER, every child
-- insert that follows runs with definer rights against whatever `v_show_id` names.
--
-- Attack path. A club-admin or trial-secretary for Club A enumerates a public
-- Club B show UUID (public show/trial UUIDs are intentionally enumerable), then
-- calls the RPC with `p_show.club_id` = Club A and `p_show.id` = Club B's show:
--
--   1. The authorization check passes -- it only ever looked at Club A.
--   2. The show INSERT no-ops. v_show_id is now Club B's show.
--   3. Fresh trials INSERT successfully with `show_id = v_show_id`. This is not a
--      conflict case at all: brand-new trial rows land inside the victim's show.
--   4. Conflicting (victim) trial UUIDs are appended to v_inserted_trial_ids
--      unconditionally, so they too read as members of the request.
--   5. Classes and class-level judge_assignments follow into that hierarchy.
--
-- Impact: cross-tenant schedule, class, judge-panel, paperwork and result
-- integrity. The flaw predates 20260730230000; it is newly detected, not newly
-- introduced.
--
-- FIX. Capture whether each INSERT actually happened (RETURNING id -> NULL on a
-- no-op conflict) and verify ownership before trusting the node:
--
--   * Show:  on conflict, lock the existing row and require club_id = v_club_id.
--   * Trial: on conflict, lock the existing row and require show_id = v_show_id.
--            Only verified trial ids enter v_inserted_trial_ids.
--   * Class: on conflict, require the existing class's trial_id to equal the
--            trial_id the payload claims, so a class cannot be re-parented.
--
-- RETRY SEMANTICS (the explicit decision this fix required).
-- Idempotent replay is validated on GRAPH OWNERSHIP, not on full payload
-- equality. A conflicting node is accepted when it already sits in the same
-- authorized graph; its column values are left untouched, exactly as the previous
-- `DO NOTHING` behaviour did. We deliberately do NOT diff the immutable payload:
-- the wizard legitimately retries after edits, and a payload comparison would
-- turn a normal retry into a hard failure while adding no tenancy protection.
-- Ownership is what carries the security property; column drift does not.
--
-- Everything else is unchanged from 20260730230000 -- the true latest body
-- (registry_id on trials, num_hides on classes, person_id class-level judge
-- assignments, venue latitude/longitude). Verified with
--   grep -l "CREATE OR REPLACE FUNCTION public.create_show_with_children" \
--     supabase/migrations/
-- which lists 11 files; rebuilding from the canonical-looking one has silently
-- reverted registry_id and the judge-assignment shape before (#1484).
--
-- GRANTS: unchanged and restated explicitly per the migration grant contract.
-- No table, column or sequence privilege is altered by this migration.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_show_with_children(
  p_show      jsonb,
  p_trials    jsonb,
  p_classes   jsonb,
  p_judge_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth        uuid;
  v_club_id            uuid;
  v_show_id            uuid;
  v_trial              jsonb;
  v_class              jsonb;
  v_inserted_trial_ids uuid[] := ARRAY[]::uuid[];
  v_class_trial_id     uuid;
  v_class_judge_id     uuid;
  v_inserted_class_id  uuid;
  v_new_show_id        uuid;
  v_trial_id           uuid;
  v_new_trial_id       uuid;
  v_class_id           uuid;
  v_existing_club_id   uuid;
  v_existing_show_id   uuid;
  v_existing_trial_id  uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_club_id := (p_show->>'club_id')::uuid;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null club_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to create shows for club %', v_club_id
      USING ERRCODE = '42501';
  END IF;

  v_show_id := (p_show->>'id')::uuid;
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  IF p_judge_ids IS NOT NULL AND array_length(p_judge_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_judge_ids) AS j(judge_uuid)
      WHERE NOT EXISTS (SELECT 1 FROM public.people WHERE id = j.judge_uuid)
    ) THEN
      RAISE EXCEPTION 'one or more p_judge_ids do not exist in public.people'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.shows (
    id, name, organization, start_date, end_date, location, status,
    club_id, entry_open_date, entry_close_date, pre_entry_fee,
    day_of_show_fee, accept_check_payments, accept_cash_payments,
    style, latitude, longitude, updated_at
  ) VALUES (
    v_show_id,
    p_show->>'name',
    p_show->>'organization',
    (p_show->>'start_date')::date,
    (p_show->>'end_date')::date,
    NULLIF(p_show->>'location', ''),
    COALESCE(NULLIF(p_show->>'status', ''), 'draft'),
    v_club_id,
    NULLIF(p_show->>'entry_open_date', '')::date,
    NULLIF(p_show->>'entry_close_date', '')::date,
    NULLIF(p_show->>'pre_entry_fee', '')::numeric,
    NULLIF(p_show->>'day_of_show_fee', '')::numeric,
    (p_show->>'accept_check_payments')::boolean,
    (p_show->>'accept_cash_payments')::boolean,
    COALESCE(NULLIF(p_show->>'style', ''), 'monogram'),
    NULLIF(p_show->>'latitude', '')::double precision,
    NULLIF(p_show->>'longitude', '')::double precision,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_new_show_id;

  -- A no-op conflict means the show already existed. It may belong to anyone, so
  -- it must be proven to belong to the authorized club before any child insert
  -- runs against it. FOR UPDATE holds the row so a concurrent transfer of the
  -- show to another club cannot land between this check and the child inserts.
  IF v_new_show_id IS NULL THEN
    SELECT club_id INTO v_existing_club_id
    FROM public.shows
    WHERE id = v_show_id
    FOR UPDATE;

    IF v_existing_club_id IS NULL OR v_existing_club_id IS DISTINCT FROM v_club_id THEN
      RAISE EXCEPTION 'show % does not belong to club %', v_show_id, v_club_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    v_trial_id := (v_trial->>'id')::uuid;
    IF v_trial_id IS NULL THEN
      RAISE EXCEPTION 'each trial must include a non-null id'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.trials (
      id, show_id, name, date, trial_number, status, trial_type,
      planned_start_time, event_number, display_order, category, registry_id, updated_at
    ) VALUES (
      v_trial_id,
      v_show_id,
      v_trial->>'name',
      (v_trial->>'date')::date,
      NULLIF(v_trial->>'trial_number', ''),
      COALESCE(NULLIF(v_trial->>'status', ''), 'upcoming'),
      NULLIF(v_trial->>'trial_type', ''),
      NULLIF(v_trial->>'planned_start_time', ''),
      NULLIF(v_trial->>'event_number', ''),
      NULLIF(v_trial->>'display_order', '')::int,
      NULLIF(v_trial->>'category', ''),
      COALESCE(NULLIF(v_trial->>'registry_id', ''), 'AKC'),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_new_trial_id;

    -- Same rule one level down: a conflicting trial is only a legitimate replay
    -- when it already belongs to THIS show. Previously every supplied trial id
    -- was appended unconditionally, which is what let a victim's trial be
    -- treated as a member of the request graph.
    IF v_new_trial_id IS NULL THEN
      SELECT show_id INTO v_existing_show_id
      FROM public.trials
      WHERE id = v_trial_id
      FOR UPDATE;

      IF v_existing_show_id IS NULL OR v_existing_show_id IS DISTINCT FROM v_show_id THEN
        RAISE EXCEPTION 'trial % does not belong to show %', v_trial_id, v_show_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_inserted_trial_ids := array_append(v_inserted_trial_ids, v_trial_id);
  END LOOP;

  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    v_class_trial_id := (v_class->>'trial_id')::uuid;

    IF NOT v_class_trial_id = ANY(v_inserted_trial_ids) THEN
      RAISE EXCEPTION 'class trial_id % is not part of this show creation request', v_class_trial_id
        USING ERRCODE = '22023';
    END IF;

    v_class_id := (v_class->>'id')::uuid;
    IF v_class_id IS NULL THEN
      RAISE EXCEPTION 'each class must include a non-null id'
        USING ERRCODE = '22023';
    END IF;

    -- num_hides is listed explicitly so a NULL payload records "judge sets it"
    -- rather than silently taking the column's DEFAULT 1.
    INSERT INTO public.classes (
      id, trial_id, name, level, element, section, entry_fee,
      max_entries, status, start_time, timer_mode, hides_known,
      distraction_count, num_areas, num_hides, time_limit_seconds, updated_at
    ) VALUES (
      v_class_id,
      v_class_trial_id,
      v_class->>'name',
      NULLIF(v_class->>'level', ''),
      NULLIF(v_class->>'element', ''),
      NULLIF(v_class->>'section', ''),
      NULLIF(v_class->>'entry_fee', '')::numeric,
      NULLIF(v_class->>'max_entries', '')::int,
      COALESCE(NULLIF(v_class->>'status', ''), 'upcoming'),
      NULLIF(v_class->>'start_time', '')::time,
      NULLIF(v_class->>'timer_mode', ''),
      NULLIF(v_class->>'hides_known', '')::boolean,
      NULLIF(v_class->>'distraction_count', '')::int,
      NULLIF(v_class->>'num_areas', '')::int,
      NULLIF(v_class->>'num_hides', '')::int,
      NULLIF(v_class->>'time_limit_seconds', '')::int,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_class_id;

    -- A conflicting class id must already hang off the trial the payload claims.
    -- Without this a caller could name an existing class under a foreign trial
    -- and have the request silently accept it as part of this graph.
    IF v_inserted_class_id IS NULL THEN
      SELECT trial_id INTO v_existing_trial_id
      FROM public.classes
      WHERE id = v_class_id;

      IF v_existing_trial_id IS NULL OR v_existing_trial_id IS DISTINCT FROM v_class_trial_id THEN
        RAISE EXCEPTION 'class % does not belong to trial %', v_class_id, v_class_trial_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Class-level judge assignment. Only when (a) the class was freshly inserted
    -- (v_inserted_class_id is NULL on an ON CONFLICT no-op, keeping re-runs of
    -- this atomic function idempotent) and (b) the wizard assigned a judge to
    -- this class. person_id is the real column; status 'confirmed' is what the
    -- dashboard treats as active (ACTIVE_ASSIGNMENT_STATUSES).
    v_class_judge_id := NULLIF(v_class->>'judge_id', '')::uuid;
    IF v_inserted_class_id IS NOT NULL AND v_class_judge_id IS NOT NULL THEN
      INSERT INTO public.judge_assignments (
        person_id, show_id, trial_id, class_id, status, confirmed_at,
        created_at, updated_at
      ) VALUES (
        v_class_judge_id, v_show_id, v_class_trial_id, v_inserted_class_id,
        'confirmed', NOW(), NOW(), NOW()
      );
    END IF;
  END LOOP;

  RETURN v_show_id;
END;
$$;

-- Show creation is a secretary/club-admin action; anon must never execute it.
-- Stated explicitly (not just via PUBLIC) per the migration grant-decision contract.
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) IS
  'Atomically creates a show, trials (incl. registry_id derived from the show organization), classes (incl. the rule-derived num_hides hide count), and CLASS-LEVEL judge assignments (one judge_assignments row per class that carries p_classes[].judge_id). Accepts p_show.style for premium experience style. Every conflicting show/trial/class id must already belong to the authorized club graph or the whole call fails 42501 (MYK9-130).';
