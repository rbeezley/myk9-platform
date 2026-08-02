-- Behavioral cross-tenant test for
-- 20260731120000_create_show_with_children_tenant_guard.sql (SA-2026-07-30-01).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/create_show_with_children_tenant_isolation_test.sql
-- All fixtures roll back.
--
-- Covers the three ON CONFLICT no-op paths that previously let a secretary of
-- club A graft rows onto club B's show, plus the same-tenant re-run that must
-- keep working (the ON CONFLICT clauses exist for wizard retries).

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. Club A employs the attacking secretary; club B is the victim and
-- already owns a show, a trial and a class.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-0000000c0a01', 'Tenant Guard Club A'),
  ('00000000-0000-0000-0000-0000000c0b01', 'Tenant Guard Club B');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-0000000c0a11',
    'Tenant', 'Guard Secretary A',
    '00000000-0000-0000-0000-0000000c0a21'
  ),
  (
    '00000000-0000-0000-0000-0000000c0a12',
    'Tenant', 'Guard Judge',
    NULL
  );

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-0000000c0a01',
  '00000000-0000-0000-0000-0000000c0a11',
  'active'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-0000000c0a11',
  id,
  '00000000-0000-0000-0000-0000000c0a01',
  true,
  '00000000-0000-0000-0000-0000000c0a21'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (
  '00000000-0000-0000-0000-0000000c0b02',
  'Victim Show', 'AKC', now(), now(), 'published',
  '00000000-0000-0000-0000-0000000c0b01'
);

INSERT INTO public.trials (id, show_id, name, date, status)
VALUES (
  '00000000-0000-0000-0000-0000000c0b03',
  '00000000-0000-0000-0000-0000000c0b02',
  'Victim Trial', current_date, 'upcoming'
);

INSERT INTO public.classes (id, trial_id, name, status)
VALUES (
  '00000000-0000-0000-0000-0000000c0b04',
  '00000000-0000-0000-0000-0000000c0b03',
  'Victim Class', 'upcoming'
);

-- ---------------------------------------------------------------------------
-- Act as club A's secretary.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0a21', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000c0a21',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

DO $$
DECLARE
  club_a   CONSTANT uuid := '00000000-0000-0000-0000-0000000c0a01';
  victim_show  CONSTANT uuid := '00000000-0000-0000-0000-0000000c0b02';
  victim_trial CONSTANT uuid := '00000000-0000-0000-0000-0000000c0b03';
  victim_class CONSTANT uuid := '00000000-0000-0000-0000-0000000c0b04';
  own_show  CONSTANT uuid := '00000000-0000-0000-0000-0000000c0a02';
  own_trial CONSTANT uuid := '00000000-0000-0000-0000-0000000c0a03';
  own_class CONSTANT uuid := '00000000-0000-0000-0000-0000000c0a04';
  judge_id  CONSTANT uuid := '00000000-0000-0000-0000-0000000c0a12';
  err text;
BEGIN
  -- EXPLOIT 1 — reuse the victim's SHOW id while naming club A as the owner.
  -- The shows INSERT no-ops, so pre-guard every trial below landed on the
  -- victim's show.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', victim_show, 'club_id', club_a, 'name', 'Hijack',
        'organization', 'AKC', 'start_date', current_date::text,
        'end_date', current_date::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', own_trial, 'name', 'Injected Trial', 'date', current_date::text
      )),
      '[]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'FAIL cross-club show id reuse succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err NOT LIKE '%belongs to another club%' THEN
      RAISE EXCEPTION 'FAIL show guard raised unexpected error: %', err;
    END IF;
  END;

  -- EXPLOIT 2 — own show, but reuse the victim's TRIAL id. The trials INSERT
  -- no-ops and pre-guard the id still qualified as a legal class parent.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', own_show, 'club_id', club_a, 'name', 'Club A Show',
        'organization', 'AKC', 'start_date', current_date::text,
        'end_date', current_date::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', victim_trial, 'name', 'Injected Trial', 'date', current_date::text
      )),
      jsonb_build_array(jsonb_build_object(
        'id', own_class, 'trial_id', victim_trial, 'name', 'Injected Class'
      )),
      NULL
    );
    RAISE EXCEPTION 'FAIL cross-show trial id reuse succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err NOT LIKE '%belongs to another show%' THEN
      RAISE EXCEPTION 'FAIL trial guard raised unexpected error: %', err;
    END IF;
  END;

  -- EXPLOIT 3 — own show and own trial, but reuse the victim's CLASS id. The
  -- classes INSERT no-ops; pre-guard the function then wrote a
  -- judge_assignments row only on fresh inserts, but the silent no-op still
  -- reported success for a class the caller does not own.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', own_show, 'club_id', club_a, 'name', 'Club A Show',
        'organization', 'AKC', 'start_date', current_date::text,
        'end_date', current_date::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', own_trial, 'name', 'Club A Trial', 'date', current_date::text
      )),
      jsonb_build_array(jsonb_build_object(
        'id', victim_class, 'trial_id', own_trial, 'name', 'Injected Class'
      )),
      NULL
    );
    RAISE EXCEPTION 'FAIL cross-trial class id reuse succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err NOT LIKE '%belongs to another trial%' THEN
      RAISE EXCEPTION 'FAIL class guard raised unexpected error: %', err;
    END IF;
  END;

  -- LEGITIMATE CREATE — club A's own ids, run twice. The second run must be a
  -- no-op, not a duplicate and not a 42501: idempotent retry is exactly what
  -- the ON CONFLICT clauses are for.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', own_show, 'club_id', club_a, 'name', 'Club A Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', own_trial, 'name', 'Club A Trial', 'date', current_date::text
    )),
    jsonb_build_array(jsonb_build_object(
      'id', own_class, 'trial_id', own_trial, 'name', 'Club A Class',
      'num_hides', '3', 'judge_id', judge_id::text
    )),
    NULL
  );

  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', own_show, 'club_id', club_a, 'name', 'Club A Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', own_trial, 'name', 'Club A Trial', 'date', current_date::text
    )),
    jsonb_build_array(jsonb_build_object(
      'id', own_class, 'trial_id', own_trial, 'name', 'Club A Class',
      'num_hides', '3', 'judge_id', judge_id::text
    )),
    NULL
  );

  RAISE NOTICE 'PASS all three cross-tenant id paths denied; same-tenant re-run accepted';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- The victim's rows are untouched, and club A's own show is complete and
-- un-duplicated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  victim_trials  int;
  victim_classes int;
  own_trials     int;
  own_classes    int;
  own_hides      int;
  own_assignments int;
BEGIN
  SELECT count(*) INTO victim_trials
  FROM public.trials WHERE show_id = '00000000-0000-0000-0000-0000000c0b02';
  SELECT count(*) INTO victim_classes
  FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-0000000c0b03';

  IF victim_trials <> 1 OR victim_classes <> 1 THEN
    RAISE EXCEPTION 'FAIL victim show gained children: trials=%, classes=%',
      victim_trials, victim_classes;
  END IF;

  SELECT count(*) INTO own_trials
  FROM public.trials WHERE show_id = '00000000-0000-0000-0000-0000000c0a02';
  SELECT count(*) INTO own_classes
  FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-0000000c0a03';
  SELECT num_hides INTO own_hides
  FROM public.classes WHERE id = '00000000-0000-0000-0000-0000000c0a04';
  SELECT count(*) INTO own_assignments
  FROM public.judge_assignments WHERE class_id = '00000000-0000-0000-0000-0000000c0a04';

  IF own_trials <> 1 OR own_classes <> 1 OR own_assignments <> 1 THEN
    RAISE EXCEPTION
      'FAIL same-tenant re-run was not idempotent: trials=%, classes=%, assignments=%',
      own_trials, own_classes, own_assignments;
  END IF;

  IF own_hides IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FAIL num_hides did not survive show creation: %', own_hides;
  END IF;

  RAISE NOTICE 'PASS victim rows unchanged; club A show created once with num_hides = 3';
END;
$$;

ROLLBACK;
