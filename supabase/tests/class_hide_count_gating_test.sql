-- Behavioral test for 20260731160000_gate_class_hide_counts_from_competitors.sql
-- (SA-2026-07-29-01 / MYK9-127).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/class_hide_count_gating_test.sql
-- All fixtures roll back.
--
-- The point of the fix is narrow: a competitor must not learn a JUDGE-SET hide
-- count before running. So the test asserts both halves — the secret is denied,
-- AND the non-secret columns an exhibitor legitimately needs are still readable.
-- A fix that simply broke class reads would pass a denial-only test.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000000e0c01', 'Hide Gating Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES ('00000000-0000-0000-0000-0000000e0510', 'Hide Gating Test Show', 'AKC',
        current_date + 20, current_date + 21, '00000000-0000-0000-0000-0000000e0c01',
        'published', true, true);

INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES ('00000000-0000-0000-0000-0000000e0520',
        '00000000-0000-0000-0000-0000000e0510', 'Hide Gating Trial',
        current_date + 20, 'AKC');

-- A judge-set class: the rule gives a band, the judge picked 3. This is the
-- value that must not leak.
INSERT INTO public.classes (id, trial_id, name, level, element, status, num_hides, hides_known)
VALUES ('00000000-0000-0000-0000-0000000e0530',
        '00000000-0000-0000-0000-0000000e0520',
        'Buried Master', 'Master', 'Buried', 'upcoming', 3, false);

-- A second class the judge is NOT assigned to, to prove per-class scoping.
INSERT INTO public.classes (id, trial_id, name, level, element, status, num_hides, hides_known)
VALUES ('00000000-0000-0000-0000-0000000e0531',
        '00000000-0000-0000-0000-0000000e0520',
        'Exterior Master', 'Master', 'Exterior', 'upcoming', 4, false);

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-0000000e0111', 'Hide', 'Exhibitor', 'hide-exhibitor@example.test', NULL),
  ('00000000-0000-0000-0000-0000000e0112', 'Hide', 'Manager',   'hide-manager@example.test',   NULL),
  ('00000000-0000-0000-0000-0000000e0113', 'Hide', 'Judge',     'hide-judge@example.test',     NULL);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','hide-exhibitor@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-0000000e0002','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','hide-manager@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-0000000e0003','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','hide-judge@example.test','', now(), now(), now(), '{}','{}', false, false, false);

-- Manager is a club_admin for the club running the show.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-0000000e0112', id, '00000000-0000-0000-0000-0000000e0c01', true,
       '00000000-0000-0000-0000-0000000e0002'
FROM public.roles WHERE name = 'club_admin';

-- Judge is assigned to the Buried class only.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
VALUES ('00000000-0000-0000-0000-0000000e0113',
        '00000000-0000-0000-0000-0000000e0510',
        '00000000-0000-0000-0000-0000000e0520',
        '00000000-0000-0000-0000-0000000e0530',
        'confirmed', now());

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  exhibitor  CONSTANT uuid := '00000000-0000-0000-0000-0000000e0001';
  manager    CONSTANT uuid := '00000000-0000-0000-0000-0000000e0002';
  judge      CONSTANT uuid := '00000000-0000-0000-0000-0000000e0003';
  show_id    CONSTANT uuid := '00000000-0000-0000-0000-0000000e0510';
  buried     CONSTANT uuid := '00000000-0000-0000-0000-0000000e0530';
  n          bigint;
  v_count    integer;
  v_name     text;
  v_known    boolean;
BEGIN
  ----------------------------------------------------------------------------
  -- Exhibitor: no roles, no assignments.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);

  BEGIN
    SELECT num_hides INTO v_count FROM public.classes WHERE id = buried;
    RAISE EXCEPTION 'FAIL exhibitor read num_hides directly (got %)', v_count;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- A predicate on the column must be denied too, or the value is guessable
  -- one comparison at a time.
  BEGIN
    SELECT count(*) INTO n FROM public.classes WHERE num_hides = 3;
    RAISE EXCEPTION 'FAIL exhibitor filtered on num_hides (got %)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- ...but the rest of the class must still be readable, including hides_known,
  -- which is public rulebook data and drives the at-show "Hides: Known/Unknown".
  SELECT name, hides_known INTO v_name, v_known FROM public.classes WHERE id = buried;
  IF v_name IS DISTINCT FROM 'Buried Master' OR v_known IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL exhibitor lost non-secret class columns (name=%, hides_known=%)',
      v_name, v_known;
  END IF;

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(show_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor received % hide-count rows from the official path', n;
  END IF;

  ----------------------------------------------------------------------------
  -- Manager: club_admin for the show's club — sees every class in the show.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', manager, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(show_id);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL manager saw % classes, expected 2', n;
  END IF;

  SELECT h.num_hides INTO v_count
    FROM public.get_show_class_hide_counts(show_id) h
   WHERE h.class_id = buried;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL manager read hide count %, expected 3', v_count;
  END IF;

  ----------------------------------------------------------------------------
  -- Assigned judge: sees only the class they are assigned to.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', judge::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', judge, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(show_id);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL assigned judge saw % classes, expected exactly their own 1', n;
  END IF;

  SELECT h.num_hides INTO v_count
    FROM public.get_show_class_hide_counts(show_id) h
   WHERE h.class_id = buried;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL assigned judge read hide count %, expected 3', v_count;
  END IF;

  RAISE NOTICE 'PASS exhibitor denied num_hides (read and predicate) but keeps the rest of the class; manager sees all, assigned judge sees only their class';
END;
$$;

ROLLBACK;
