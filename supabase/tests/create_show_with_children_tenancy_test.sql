-- Behavioral tenancy test for
-- 20260731120000_create_show_with_children_tenant_guard.sql (MYK9-130).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/create_show_with_children_tenancy_test.sql
-- All fixtures roll back.
--
-- Club A is the attacker's club. Club B is the victim. Every denial case asserts
-- BOTH that the call raises 42501 AND that no row leaked into Club B's graph.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-0000000b0a01', 'Tenancy Test Club A'),
  ('00000000-0000-0000-0000-0000000b0b01', 'Tenancy Test Club B');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-0000000b0011',
  'Tenancy',
  'Attacker',
  '00000000-0000-0000-0000-0000000b0001'
);

-- The attacker is a legitimate club_admin -- for Club A only.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-0000000b0011',
  id,
  '00000000-0000-0000-0000-0000000b0a01',
  true,
  '00000000-0000-0000-0000-0000000b0001'
FROM public.roles
WHERE name = 'club_admin';

-- Club B's pre-existing show and trial: the victim graph.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-0000000b0b10',
  'Victim Show',
  'AKC',
  current_date + 30,
  current_date + 31,
  '00000000-0000-0000-0000-0000000b0b01',
  'published'
);

INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES (
  '00000000-0000-0000-0000-0000000b0b20',
  '00000000-0000-0000-0000-0000000b0b10',
  'Victim Trial',
  current_date + 30,
  'AKC'
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  attacker      CONSTANT uuid := '00000000-0000-0000-0000-0000000b0001';
  club_a        CONSTANT uuid := '00000000-0000-0000-0000-0000000b0a01';
  victim_show   CONSTANT uuid := '00000000-0000-0000-0000-0000000b0b10';
  victim_trial  CONSTANT uuid := '00000000-0000-0000-0000-0000000b0b20';
  own_show      CONSTANT uuid := '00000000-0000-0000-0000-0000000b0a10';
  own_trial     CONSTANT uuid := '00000000-0000-0000-0000-0000000b0a20';
  own_class     CONSTANT uuid := '00000000-0000-0000-0000-0000000b0a30';
  new_trial     CONSTANT uuid := '00000000-0000-0000-0000-0000000b0a21';
  returned      uuid;
  leaked        bigint;
  err           text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', attacker::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', attacker, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  -- 1. Baseline: creating a brand-new show for the attacker's OWN club still works.
  returned := public.create_show_with_children(
    jsonb_build_object(
      'id', own_show, 'club_id', club_a, 'name', 'Legit Show',
      'organization', 'AKC',
      'start_date', (current_date + 30)::text, 'end_date', (current_date + 31)::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', own_trial, 'name', 'Legit Trial', 'date', (current_date + 30)::text
    )),
    jsonb_build_array(jsonb_build_object(
      'id', own_class, 'trial_id', own_trial, 'name', 'Legit Class'
    )),
    NULL
  );
  IF returned IS DISTINCT FROM own_show THEN
    RAISE EXCEPTION 'FAIL normal creation returned %', returned;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = own_class) THEN
    RAISE EXCEPTION 'FAIL normal creation did not persist the class';
  END IF;

  -- 2. Same-club exact retry stays idempotent (graph-ownership rule).
  returned := public.create_show_with_children(
    jsonb_build_object(
      'id', own_show, 'club_id', club_a, 'name', 'Legit Show',
      'organization', 'AKC',
      'start_date', (current_date + 30)::text, 'end_date', (current_date + 31)::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', own_trial, 'name', 'Legit Trial', 'date', (current_date + 30)::text
    )),
    jsonb_build_array(jsonb_build_object(
      'id', own_class, 'trial_id', own_trial, 'name', 'Legit Class'
    )),
    NULL
  );
  IF returned IS DISTINCT FROM own_show THEN
    RAISE EXCEPTION 'FAIL same-club retry returned %', returned;
  END IF;
  SELECT count(*) INTO leaked FROM public.classes WHERE id = own_class;
  IF leaked <> 1 THEN
    RAISE EXCEPTION 'FAIL same-club retry duplicated the class (% rows)', leaked;
  END IF;

  -- 3. THE ATTACK: claim Club B's show id while authorizing Club A, and hang a
  --    brand-new trial off it. Pre-fix this inserted a fresh trial into the
  --    victim's show without any conflict at all.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', victim_show, 'club_id', club_a, 'name', 'Hijack',
        'organization', 'AKC',
        'start_date', (current_date + 30)::text, 'end_date', (current_date + 31)::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', new_trial, 'name', 'Injected Trial', 'date', (current_date + 30)::text
      )),
      '[]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'FAIL cross-club show hijack was allowed';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err NOT LIKE 'show % does not belong to club %' THEN
      RAISE EXCEPTION 'FAIL cross-club show hijack raised unexpected error: %', err;
    END IF;
  END;

  SELECT count(*) INTO leaked FROM public.trials WHERE show_id = victim_show;
  IF leaked <> 1 THEN
    RAISE EXCEPTION 'FAIL victim show gained trials (% present, expected 1)', leaked;
  END IF;
  IF EXISTS (SELECT 1 FROM public.trials WHERE id = new_trial) THEN
    RAISE EXCEPTION 'FAIL injected trial persisted despite the denial';
  END IF;

  -- 4. Cross-club TRIAL conflict: attacker's own show, but names the victim's
  --    trial id so classes would be parented under it.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', own_show, 'club_id', club_a, 'name', 'Legit Show',
        'organization', 'AKC',
        'start_date', (current_date + 30)::text, 'end_date', (current_date + 31)::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', victim_trial, 'name', 'Stolen Trial', 'date', (current_date + 30)::text
      )),
      '[]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'FAIL cross-club trial conflict was allowed';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err NOT LIKE 'trial % does not belong to show %' THEN
      RAISE EXCEPTION 'FAIL cross-club trial conflict raised unexpected error: %', err;
    END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.trials WHERE id = victim_trial AND show_id = victim_show
  ) THEN
    RAISE EXCEPTION 'FAIL victim trial was re-parented';
  END IF;

  -- 5. Mixed valid/invalid children roll the WHOLE call back: a good new trial
  --    alongside the victim's trial must leave neither behind.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', own_show, 'club_id', club_a, 'name', 'Legit Show',
        'organization', 'AKC',
        'start_date', (current_date + 30)::text, 'end_date', (current_date + 31)::text,
        'accept_check_payments', true, 'accept_cash_payments', true
      ),
      jsonb_build_array(
        jsonb_build_object('id', new_trial, 'name', 'Good Trial', 'date', (current_date + 30)::text),
        jsonb_build_object('id', victim_trial, 'name', 'Bad Trial', 'date', (current_date + 30)::text)
      ),
      '[]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'FAIL mixed valid/invalid batch was allowed';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM public.trials WHERE id = new_trial) THEN
    RAISE EXCEPTION 'FAIL partial batch persisted the good trial; no rollback';
  END IF;

  RAISE NOTICE 'PASS normal creation, same-club idempotent retry, cross-club show denial, cross-club trial denial, and mixed-batch rollback';
END;
$$;

ROLLBACK;
