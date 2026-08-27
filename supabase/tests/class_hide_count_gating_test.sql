-- Behavioral test for 20260731160000_add_show_class_hide_counts_rpc.sql and
-- 20260731170000_gate_class_hide_counts_from_competitors.sql
-- (SA-2026-07-29-01 / MYK9-127). Both halves must be applied — A adds the
-- officials-only accessor, B revokes the column.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/class_hide_count_gating_test.sql
-- All fixtures roll back.
--
-- The point of the fix is narrow: a competitor must not learn a JUDGE-SET hide
-- count before running, but may receive a fixed count already published by the
-- matching registry rule. So the test asserts the raw-column/RPC denial, the
-- corrected AKC rule matrix, non-AKC preservation, and official access. A fix
-- that simply broke class reads would pass a denial-only test.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000000e0c01', 'Hide Gating Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES
  ('00000000-0000-0000-0000-0000000e0510', 'AKC Hide Gating Test Show', 'AKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-0000000e0c01',
   'published', true, true),
  ('00000000-0000-0000-0000-0000000e0511', 'UKC Hide Gating Test Show', 'UKC',
   current_date + 20, current_date + 21, '00000000-0000-0000-0000-0000000e0c01',
   'published', true, true);

INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES
  ('00000000-0000-0000-0000-0000000e0520',
   '00000000-0000-0000-0000-0000000e0510', 'AKC Hide Gating Trial',
   current_date + 20, 'AKC'),
  ('00000000-0000-0000-0000-0000000e0521',
   '00000000-0000-0000-0000-0000000e0511', 'UKC Hide Gating Trial',
   current_date + 21, 'UKC');

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

-- Known AKC totals: both are public in sport_class_rules and safe to derive for
-- an already-visible class row, while the raw mixed-sensitivity column remains
-- unreadable.
INSERT INTO public.classes (id, trial_id, name, level, element, status, num_hides, hides_known)
VALUES
  ('00000000-0000-0000-0000-0000000e0532',
   '00000000-0000-0000-0000-0000000e0520',
   'Interior Excellent', 'Excellent', 'Interior', 'upcoming', 3, true),
  ('00000000-0000-0000-0000-0000000e0533',
   '00000000-0000-0000-0000-0000000e0520',
   'Handler Discrimination Master', 'Master', 'Handler Discrimination', 'upcoming', 3, true);

-- Detective is standalone and protected just like the variable Odor Search
-- Master classes.
INSERT INTO public.classes (id, trial_id, name, level, element, status, num_hides, hides_known)
VALUES ('00000000-0000-0000-0000-0000000e0534',
        '00000000-0000-0000-0000-0000000e0520',
        'Detective', NULL, 'Detective', 'upcoming', 7, false);

-- Non-AKC control: UKC Superior remains governed by UKC's own unknown band.
INSERT INTO public.classes (id, trial_id, name, level, element, section, status,
                            num_hides, hides_known)
VALUES ('00000000-0000-0000-0000-0000000e0535',
        '00000000-0000-0000-0000-0000000e0521',
        'Container Superior A', 'Superior', 'Container', 'A', 'upcoming', 2, false);

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
  ukc_show_id CONSTANT uuid := '00000000-0000-0000-0000-0000000e0511';
  buried     CONSTANT uuid := '00000000-0000-0000-0000-0000000e0530';
  n          bigint;
  v_count    integer;
  v_min      integer;
  v_max      integer;
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

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(ukc_show_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor received % UKC hide-count rows from the official path', n;
  END IF;

  -- AKC Interior Excellent: three total hides are known; only their two-area
  -- distribution is undisclosed.
  SELECT r.hide_count_fixed, r.hide_count_min, r.hide_count_max, r.hides_known
    INTO v_count, v_min, v_max, v_known
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Interior'
     AND r.level = 'Excellent'
     AND r.section IS NULL;
  IF v_count IS DISTINCT FROM 3 OR v_min IS NOT NULL OR v_max IS NOT NULL
     OR v_known IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL AKC Interior Excellent rule fixed=%, min=%, max=%, known=%',
      v_count, v_min, v_max, v_known;
  END IF;

  -- AKC Handler Discrimination Master is fixed at three, despite sharing the
  -- Master level label with protected Odor Search classes.
  SELECT r.hide_count_fixed, r.hides_known
    INTO v_count, v_known
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Handler Discrimination'
     AND r.level = 'Master'
     AND r.section IS NULL;
  IF v_count IS DISTINCT FROM 3 OR v_known IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL AKC HD Master rule fixed=%, known=%', v_count, v_known;
  END IF;

  -- AKC Buried Master and Detective remain unknown bands; no public fixed value
  -- exists for the replication resolver to attach.
  SELECT r.hide_count_fixed, r.hide_count_min, r.hide_count_max, r.hides_known
    INTO v_count, v_min, v_max, v_known
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Buried'
     AND r.level = 'Master'
     AND r.section IS NULL;
  IF v_count IS NOT NULL OR v_min IS DISTINCT FROM 1 OR v_max IS DISTINCT FROM 4
     OR v_known IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL AKC Buried Master rule fixed=%, min=%, max=%, known=%',
      v_count, v_min, v_max, v_known;
  END IF;

  SELECT r.hide_count_fixed, r.hide_count_min, r.hide_count_max, r.hides_known
    INTO v_count, v_min, v_max, v_known
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'AKC'
     AND st.sport_code = 'akc-scent-work'
     AND r.element = 'Detective'
     AND r.level IS NULL
     AND r.section IS NULL;
  IF v_count IS NOT NULL OR v_min IS DISTINCT FROM 5 OR v_max IS DISTINCT FROM 10
     OR v_known IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL AKC Detective rule fixed=%, min=%, max=%, known=%',
      v_count, v_min, v_max, v_known;
  END IF;

  -- Registry-specific control: UKC Superior remains an unknown 2-3 band.
  SELECT r.hide_count_fixed, r.hide_count_min, r.hide_count_max, r.hides_known
    INTO v_count, v_min, v_max, v_known
    FROM public.sport_class_rules r
    JOIN public.sport_templates st ON st.id = r.sport_template_id
   WHERE st.organization = 'UKC'
     AND st.sport_code = 'ukc-nosework'
     AND r.element = 'Container'
     AND r.level = 'Superior'
     AND r.section = 'A';
  IF v_count IS NOT NULL OR v_min IS DISTINCT FROM 2 OR v_max IS DISTINCT FROM 3
     OR v_known IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL UKC Superior rule fixed=%, min=%, max=%, known=%',
      v_count, v_min, v_max, v_known;
  END IF;

  ----------------------------------------------------------------------------
  -- Manager: club_admin for the show's club — sees every class in the show.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', manager, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(show_id);
  IF n <> 5 THEN
    RAISE EXCEPTION 'FAIL manager saw % AKC classes, expected 5', n;
  END IF;

  SELECT count(*) INTO n FROM public.get_show_class_hide_counts(ukc_show_id);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL manager saw % UKC classes, expected 1', n;
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

  RAISE NOTICE 'PASS exhibitor receives only public registry rules, protected actual counts stay denied, manager sees all, assigned judge sees only their class';
END;
$$;

ROLLBACK;
