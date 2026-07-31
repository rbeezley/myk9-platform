-- =============================================================================
-- Migration 20260731120000: deny cross-tenant id re-use in create_show_with_children
--
-- SA-2026-07-30-01 (P0, cross-tenant write).
--
-- PROBLEM: the RPC is SECURITY DEFINER, so RLS never runs. Its only
-- authorization check is against `p_show.club_id` — but the show, trial and
-- class INSERTs all end in `ON CONFLICT (id) DO NOTHING`, and the function
-- carries on regardless of whether the row was actually inserted. A conflict is
-- silently indistinguishable from a fresh insert, so an authorized secretary of
-- club A could name club B's identifiers and attach their own children to them:
--
--   * p_show.id = <club B's existing show>, p_show.club_id = <club A>
--     → authz passes on club A; the shows INSERT no-ops; every trial in
--       p_trials is then inserted with show_id = club B's show. Club B's show
--       gains trials it never created.
--   * p_trials[].id = <club B's existing trial>
--     → the trials INSERT no-ops, but the id is still appended to
--       v_inserted_trial_ids, so the membership check on line 147 passes and
--       every class in p_classes lands under club B's trial — along with a
--       judge_assignments row carrying club B's show_id and trial_id.
--
-- Neither path needs any privilege beyond "secretary of some club", and neither
-- is visible to the victim club except as unexplained trials/classes appearing
-- on their show.
--
-- FIX: capture `RETURNING id` on each upsert. NULL means the row already
-- existed, which is the only moment we can inspect its owner. Re-running the
-- same payload for the same tenant still succeeds (idempotency is the whole
-- point of the ON CONFLICT clauses); an id that resolves to a different owner
-- now raises 42501 and rolls the whole call back.
--
--   shows   — pre-existing row must have club_id = the authorized club
--   trials  — pre-existing row must have show_id = this show
--   classes — pre-existing row must have trial_id = the trial named for it
--
-- Rebuilt from 20260730230000 (the true latest body: registry_id trials column,
-- person_id class-level judge assignments, venue latitude/longitude, num_hides)
-- with only the ownership guards added. No column list changes.
--
-- PROOF: supabase/tests/create_show_with_children_tenant_isolation_test.sql
-- exercises both exploit paths across two clubs plus a same-tenant re-run, and
-- rolls back.
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
  v_inserted_show_id   uuid;
  v_trial_id           uuid;
  v_inserted_trial_id  uuid;
  v_class_id           uuid;
  v_owner_club_id      uuid;
  v_owner_show_id      uuid;
  v_owner_trial_id     uuid;
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
  RETURNING id INTO v_inserted_show_id;

  -- A NULL return means the id already existed. The authorization above proved
  -- the caller may create shows for v_club_id — it proved nothing about a show
  -- that some other club already owns, so re-check the stored owner.
  IF v_inserted_show_id IS NULL THEN
    SELECT club_id INTO v_owner_club_id
    FROM public.shows
    WHERE id = v_show_id;

    IF v_owner_club_id IS DISTINCT FROM v_club_id THEN
      RAISE EXCEPTION 'show % belongs to another club', v_show_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    v_trial_id := (v_trial->>'id')::uuid;

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
    RETURNING id INTO v_inserted_trial_id;

    -- Same guard, one level down: a conflicting trial id that hangs off a
    -- different show would otherwise become a legal parent for p_classes.
    IF v_inserted_trial_id IS NULL THEN
      SELECT show_id INTO v_owner_show_id
      FROM public.trials
      WHERE id = v_trial_id;

      IF v_owner_show_id IS DISTINCT FROM v_show_id THEN
        RAISE EXCEPTION 'trial % belongs to another show', v_trial_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_inserted_trial_ids := array_append(v_inserted_trial_ids, v_trial_id);
  END LOOP;

  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    v_class_trial_id := (v_class->>'trial_id')::uuid;
    v_class_id := (v_class->>'id')::uuid;

    IF NOT v_class_trial_id = ANY(v_inserted_trial_ids) THEN
      RAISE EXCEPTION 'class trial_id % is not part of this show creation request', v_class_trial_id
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

    -- A conflicting class id under a different trial is another club's row.
    -- Under the SAME trial it is an ordinary idempotent re-run, which falls
    -- through to the judge-assignment guard below and stays a no-op.
    IF v_inserted_class_id IS NULL THEN
      SELECT trial_id INTO v_owner_trial_id
      FROM public.classes
      WHERE id = v_class_id;

      IF v_owner_trial_id IS DISTINCT FROM v_class_trial_id THEN
        RAISE EXCEPTION 'class % belongs to another trial', v_class_id
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
  'Atomically creates a show, trials (incl. registry_id derived from the show organization), classes (incl. the rule-derived num_hides hide count), and CLASS-LEVEL judge assignments (one judge_assignments row per class that carries p_classes[].judge_id). Accepts p_show.style for premium experience style. Every ON CONFLICT no-op re-checks the pre-existing row''s owner and raises 42501 on cross-tenant id re-use (SA-2026-07-30-01).';
