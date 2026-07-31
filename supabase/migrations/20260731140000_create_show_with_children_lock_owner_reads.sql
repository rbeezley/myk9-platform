-- =============================================================================
-- Migration 20260731140000: lock the owner re-reads in create_show_with_children
--
-- Follow-up to 20260731120000 (SA-2026-07-30-01). That migration closed the
-- cross-tenant hole correctly: each upsert captures `RETURNING id`, a NULL means
-- the row pre-existed, and the stored owner is re-checked before the call is
-- allowed to continue. This migration changes exactly one thing about it.
--
-- PROBLEM: the three owner re-reads are unlocked plain SELECTs. Under READ
-- COMMITTED the owner is read from a snapshot, so a concurrent transaction can
-- commit a change to that owner between the check and the child INSERTs that
-- rely on it:
--
--   T1: create_show_with_children reads shows.club_id -> club A. Check passes.
--   T2: UPDATE public.shows SET club_id = <club B> WHERE id = <show>. COMMIT.
--   T1: inserts trials/classes with show_id = <show>, now owned by club B.
--
-- The window is narrow and requires an attacker to land a legitimate club
-- transfer inside it, so this is defence in depth rather than a live exploit
-- path — the P0 itself is closed by 20260731120000. It is worth closing anyway:
-- the guarantee the guards are meant to provide is "these children land in a
-- graph this caller owns", and an unlocked read only proves that was true a
-- moment ago.
--
-- FIX: `FOR UPDATE` on all three owner re-reads, so the row cannot change owner
-- until this transaction ends. The lock is taken only on the ON CONFLICT path,
-- which the normal wizard flow never reaches — `buildCreateShowPayload.ts` mints
-- a fresh `crypto.randomUUID()` per show and per trial on every call, so a
-- first-time creation inserts cleanly and takes no locks here.
--
-- Rebuilt from 20260731120000, which is the true latest body. `grep -l
-- "CREATE OR REPLACE FUNCTION public.create_show_with_children"
-- supabase/migrations/` now lists 12 files; rebuilding from the
-- canonical-looking one has silently reverted registry_id and the
-- judge-assignment shape before (#1484). The ONLY differences from
-- 20260731120000 are the three added `FOR UPDATE` clauses and this header.
--
-- PROOF: supabase/tests/create_show_with_children_tenant_isolation_test.sql,
-- unchanged, still passes. This migration is not meant to change any observable
-- single-transaction behaviour, so an unchanged test passing IS the assertion.
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
  -- FOR UPDATE: hold the row so the owner cannot change before the children land.
  IF v_inserted_show_id IS NULL THEN
    SELECT club_id INTO v_owner_club_id
    FROM public.shows
    WHERE id = v_show_id
    FOR UPDATE;

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
      WHERE id = v_trial_id
      FOR UPDATE;

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
      WHERE id = v_class_id
      FOR UPDATE;

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
  'Atomically creates a show, trials (incl. registry_id derived from the show organization), classes (incl. the rule-derived num_hides hide count), and CLASS-LEVEL judge assignments (one judge_assignments row per class that carries p_classes[].judge_id). Accepts p_show.style for premium experience style. Every ON CONFLICT no-op re-checks the pre-existing row''s owner under FOR UPDATE and raises 42501 on cross-tenant id re-use (SA-2026-07-30-01).';
