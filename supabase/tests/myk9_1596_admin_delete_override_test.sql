-- MYK9-1596 (migration 20261107024137): a SITE ADMIN overrides a blocked delete of
-- a show, trial or class, with a typed reason, on the record, and Undo still works.
--
-- Asserted here:
--   * p_override => true without a reason (NULL or blank) is refused (22023) and
--     changes nothing, no audit row included; without the override the delete is
--     still refused (MK010);
--   * a non-admin passing the override is refused (42501), reason or not;
--   * the admin override with a reason deletes, and writes ONE activity_log row
--     (who, when, why; COUNTS only, never money or payment ids: paid entries, Stripe
--     entries still holding money, refund_issued false) in the same transaction;
--   * the override issues no refund and leaves the money columns alone;
--   * restore_show / restore_trial / restore_class bring the paid entries back;
--   * delete_preview reports paid_amount, stripe_retained and
--     stripe_retained_amount;
--   * the old (uuid, boolean) signatures are gone, the new ones are executable
--     by authenticated and service_role only, and the helpers by nobody.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.
-- Behavioral SQL runs only in CI (no container runtime on the development Mac).

BEGIN;

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001596011', NULL, 'MYK9-1596', 'Secretary', 'myk9-1596-sec@example.test'),
  ('00000000-0000-0000-0000-000001596013', NULL, 'MYK9-1596', 'Admin', 'myk9-1596-adm@example.test'),
  ('00000000-0000-0000-0000-000001596014', NULL, 'MYK9-1596', 'Exhibitor', 'myk9-1596-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001596101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1596-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001596103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1596-adm@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001596104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1596-exh@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000001596021', 'MYK9-1596 Club', now());

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
SELECT '00000000-0000-0000-0000-000001596011', r.id, '00000000-0000-0000-0000-000001596021', NULL, true, now(),
       '00000000-0000-0000-0000-000001596011', '00000000-0000-0000-0000-000001596101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (user_id, auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000001596013', '00000000-0000-0000-0000-000001596103', r.id, true
FROM public.roles r WHERE r.name = 'site_admin';

-- S1/T1/K1: the show-scope arena. E1 paid through Stripe ($30), E2 paid in cash ($20),
--   E5 Stripe $30 refunded $5 (status 'refunded', $25 still held), E6 Stripe $20 refunded
--   in full (nothing held). E5 and E6 are not blocking.
-- S2/T2/K2: the trial-scope arena. E3 paid through Stripe ($40).
-- S3/T3/K3: the class-scope arena. E4 scored, never paid.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000001596031', 'MYK9-1596 Show One', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000001596021'),
  ('00000000-0000-0000-0000-000001596032', 'MYK9-1596 Show Two', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000001596021'),
  ('00000000-0000-0000-0000-000001596033', 'MYK9-1596 Show Three', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000001596021');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596031', 'MYK9-1596 Trial 1', current_date),
  ('00000000-0000-0000-0000-000001596042', '00000000-0000-0000-0000-000001596032', 'MYK9-1596 Trial 2', current_date),
  ('00000000-0000-0000-0000-000001596043', '00000000-0000-0000-0000-000001596033', 'MYK9-1596 Trial 3', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596041', 'MYK9-1596 K1'),
  ('00000000-0000-0000-0000-000001596052', '00000000-0000-0000-0000-000001596042', 'MYK9-1596 K2'),
  ('00000000-0000-0000-0000-000001596053', '00000000-0000-0000-0000-000001596043', 'MYK9-1596 K3');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT ('00000000-0000-0000-0000-00000159606' || n)::uuid, 'MYK9-1596 Dog ' || n, 'Border Collie',
       '00000000-0000-0000-0000-000001596014'
FROM generate_series(1, 6) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT ('00000000-0000-0000-0000-00000159606' || n)::uuid, 'AKC', 'SW1596' || lpad(n::text, 2, '0'), 'MYK9-1596 Dog ' || n
FROM generate_series(1, 6) AS n;

INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, is_scored, result_status,
  entry_fee, stripe_payment_intent_id
)
VALUES
  ('00000000-0000-0000-0000-000001596081', '00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596031', '00000000-0000-0000-0000-000001596061', 'paid', false, 'pending', 30, 'pi_myk9_1596_a'),
  ('00000000-0000-0000-0000-000001596082', '00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596031', '00000000-0000-0000-0000-000001596062', 'paid', false, 'pending', 20, NULL),
  ('00000000-0000-0000-0000-000001596083', '00000000-0000-0000-0000-000001596052', '00000000-0000-0000-0000-000001596042', '00000000-0000-0000-0000-000001596032', '00000000-0000-0000-0000-000001596063', 'paid', false, 'pending', 40, 'pi_myk9_1596_b'),
  ('00000000-0000-0000-0000-000001596085', '00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596031', '00000000-0000-0000-0000-000001596065', 'refunded', false, 'pending', 30, 'pi_myk9_1596_c'),
  ('00000000-0000-0000-0000-000001596086', '00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596031', '00000000-0000-0000-0000-000001596066', 'refunded', false, 'pending', 20, 'pi_myk9_1596_d'),
  ('00000000-0000-0000-0000-000001596084', '00000000-0000-0000-0000-000001596053', '00000000-0000-0000-0000-000001596043', '00000000-0000-0000-0000-000001596033', '00000000-0000-0000-0000-000001596064', 'pending', true, 'qualified', 25, NULL);

UPDATE public.entries SET refund_amount = 5, refunded_at = now()
WHERE id = '00000000-0000-0000-0000-000001596085';
UPDATE public.entries SET refund_amount = 20, refunded_at = now()
WHERE id = '00000000-0000-0000-0000-000001596086';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000001596103' AND r.name = 'site_admin'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000001596101' AND r.name = 'secretary'
  ) THEN
    RAISE EXCEPTION 'FIXTURE the secretary or site_admin role row was not created';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The secretary cannot override, reason or not (42501), and is still refused
--    without the override (MK010).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001596101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001596101","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000001596031', true, 'I would like to');
    RAISE EXCEPTION 'FAIL a secretary used the show override';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a secretary override of a show is refused (42501)';
  END;
  BEGIN
    PERFORM public.soft_delete_trial('00000000-0000-0000-0000-000001596042', true, 'I would like to');
    RAISE EXCEPTION 'FAIL a secretary used the trial override';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a secretary override of a trial is refused (42501)';
  END;
  BEGIN
    PERFORM public.soft_delete_class('00000000-0000-0000-0000-000001596053', true, 'I would like to');
    RAISE EXCEPTION 'FAIL a secretary used the class override';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a secretary override of a class is refused (42501)';
  END;
  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000001596031');
    RAISE EXCEPTION 'FAIL a secretary deleted a show holding paid entries';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS a secretary is still refused without the override (MK010)';
  END;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2. The site admin: the preview, then no override without a reason.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001596103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001596103","role":"authenticated"}', true);

DO $$
DECLARE
  v_preview jsonb;
BEGIN
  v_preview := public.delete_preview('show', '00000000-0000-0000-0000-000001596031');
  IF NOT (v_preview @> '{"paid":2,"blocking":2,"paid_amount":50,"stripe_retained":2,"stripe_retained_amount":55}'::jsonb) THEN
    RAISE EXCEPTION 'FAIL show preview money wrong: %', v_preview;
  END IF;
  v_preview := public.delete_preview('trial', '00000000-0000-0000-0000-000001596042');
  IF NOT (v_preview @> '{"paid":1,"paid_amount":40,"stripe_retained":1,"stripe_retained_amount":40}'::jsonb) THEN
    RAISE EXCEPTION 'FAIL trial preview money wrong: %', v_preview;
  END IF;
  v_preview := public.delete_preview('class', '00000000-0000-0000-0000-000001596053');
  IF NOT (v_preview @> '{"paid":0,"scored":1,"blocking":1,"paid_amount":0,"stripe_retained":0,"stripe_retained_amount":0}'::jsonb) THEN
    RAISE EXCEPTION 'FAIL class preview money wrong: %', v_preview;
  END IF;
  RAISE NOTICE 'PASS delete_preview: a partial refund keeps its remaining balance ($25), a full refund holds nothing';

  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000001596031');
    RAISE EXCEPTION 'FAIL a site admin bypassed the guard without asking to override';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS a site admin is still refused unless they pass the override';
  END;

  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000001596031', true);
    RAISE EXCEPTION 'FAIL the show override ran with no reason';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS the show override without a reason is refused (22023)';
  END;
  BEGIN
    PERFORM public.soft_delete_trial('00000000-0000-0000-0000-000001596042', true, '   ');
    RAISE EXCEPTION 'FAIL the trial override ran with a blank reason';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS the trial override with a blank reason is refused (22023)';
  END;
  BEGIN
    PERFORM public.soft_delete_class('00000000-0000-0000-0000-000001596053', true, '');
    RAISE EXCEPTION 'FAIL the class override ran with an empty reason';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS the class override with an empty reason is refused (22023)';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001596031' AND deleted_at IS NOT NULL)
     OR EXISTS (
       SELECT 1 FROM public.entries
       WHERE id IN ('00000000-0000-0000-0000-000001596081', '00000000-0000-0000-0000-000001596082')
         AND deleted_at IS NOT NULL)
     OR EXISTS (
       SELECT 1 FROM public.activity_log WHERE record_id IN (
         '00000000-0000-0000-0000-000001596031', '00000000-0000-0000-0000-000001596042',
         '00000000-0000-0000-0000-000001596053')) THEN
    RAISE EXCEPTION 'FAIL a refused override changed a row or left an audit row';
  END IF;
  RAISE NOTICE 'PASS a refused override changes nothing and writes no audit row';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The admin override with a reason: delete, one audit row, no refund.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001596103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001596103","role":"authenticated"}', true);

SELECT public.soft_delete_show('00000000-0000-0000-0000-000001596031', true, '  Duplicate of another show  ');
SELECT count(*) FROM public.soft_delete_trial('00000000-0000-0000-0000-000001596042', true, 'Wrong club entered it');
SELECT public.soft_delete_class('00000000-0000-0000-0000-000001596053', true, 'Class was never run');

RESET ROLE;

DO $$
DECLARE
  v_row public.activity_log%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001596031' AND deleted_at IS NOT NULL)
     OR (SELECT count(*) FROM public.entries
         WHERE id IN ('00000000-0000-0000-0000-000001596081', '00000000-0000-0000-0000-000001596082')
           AND deleted_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL the show override did not tombstone the show and its paid entries';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trials WHERE id = '00000000-0000-0000-0000-000001596042' AND deleted_at IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001596053' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the trial or class override did not delete';
  END IF;
  RAISE NOTICE 'PASS the site-admin override deletes a show, a trial and a class holding paid or scored entries';

  SELECT * INTO v_row FROM public.activity_log WHERE record_id = '00000000-0000-0000-0000-000001596031';
  IF v_row.record_type IS DISTINCT FROM 'show'
     OR v_row.action_type IS DISTINCT FROM 'deleted'
     OR v_row.actor_id IS DISTINCT FROM '00000000-0000-0000-0000-000001596103'::uuid
     OR v_row.created_at IS NULL
     OR v_row.metadata ->> 'reason' IS DISTINCT FROM 'Duplicate of another show'
     OR v_row.metadata -> 'override' IS DISTINCT FROM 'true'::jsonb
     OR v_row.metadata -> 'refund_issued' IS DISTINCT FROM 'false'::jsonb
     OR (v_row.metadata ->> 'paid_entries')::int IS DISTINCT FROM 2
     OR (v_row.metadata ->> 'stripe_retained_entries')::int IS DISTINCT FROM 2
     OR (v_row.metadata ->> 'deleted_at')::timestamptz IS DISTINCT FROM (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000001596031') THEN
    RAISE EXCEPTION 'FAIL the show audit row is wrong: %', to_jsonb(v_row);
  END IF;
  -- activity_log is readable by every real account: counts only, no money, no ids.
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_row.metadata) AS k)
       IS DISTINCT FROM ARRAY['deleted_at', 'override', 'paid_entries', 'reason', 'refund_issued', 'stripe_retained_entries']
     OR v_row.description ~ '\$' OR v_row.description ~ 'pi_myk9_1596'
     OR v_row.metadata::text ~ 'pi_myk9_1596' THEN
    RAISE EXCEPTION 'FAIL the show audit row leaks money or payment ids: %', to_jsonb(v_row);
  END IF;
  IF (SELECT count(*) FROM public.activity_log WHERE record_id = '00000000-0000-0000-0000-000001596031') <> 1 THEN
    RAISE EXCEPTION 'FAIL the show override wrote more or fewer than one audit row';
  END IF;
  RAISE NOTICE 'PASS the show override writes one audit row: who, when, why, and the money';

  IF NOT EXISTS (
       SELECT 1 FROM public.activity_log
       WHERE record_id = '00000000-0000-0000-0000-000001596042' AND record_type = 'trial'
         AND metadata ->> 'reason' = 'Wrong club entered it'
         AND (metadata ->> 'stripe_retained_entries')::int = 1
         AND actor_id = '00000000-0000-0000-0000-000001596103'::uuid)
     OR NOT EXISTS (
       SELECT 1 FROM public.activity_log
       WHERE record_id = '00000000-0000-0000-0000-000001596053' AND record_type = 'class'
         AND metadata ->> 'reason' = 'Class was never run'
         AND (metadata ->> 'paid_entries')::int = 0
         AND actor_id = '00000000-0000-0000-0000-000001596103'::uuid) THEN
    RAISE EXCEPTION 'FAIL the trial or class audit row is missing or wrong';
  END IF;
  RAISE NOTICE 'PASS the trial and class overrides each write their audit row';

  IF EXISTS (
       SELECT 1 FROM public.entries
       WHERE id IN ('00000000-0000-0000-0000-000001596081', '00000000-0000-0000-0000-000001596083')
         AND (payment_status <> 'paid' OR refund_amount IS NOT NULL OR refunded_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL the override touched the money columns (it must issue no refund)';
  END IF;
  IF (SELECT refund_amount FROM public.entries WHERE id = '00000000-0000-0000-0000-000001596085') IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FAIL the override changed a recorded refund';
  END IF;
  RAISE NOTICE 'PASS the override issues no refund and leaves the money columns alone';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restore still works after an override delete.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001596103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001596103","role":"authenticated"}', true);

SELECT count(*) FROM public.restore_show('00000000-0000-0000-0000-000001596031');
SELECT count(*) FROM public.restore_trial('00000000-0000-0000-0000-000001596042');
SELECT count(*) FROM public.restore_class('00000000-0000-0000-0000-000001596053');

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001596031' AND deleted_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.trials WHERE id IN ('00000000-0000-0000-0000-000001596041', '00000000-0000-0000-0000-000001596042') AND deleted_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.classes WHERE id IN ('00000000-0000-0000-0000-000001596051', '00000000-0000-0000-0000-000001596053') AND deleted_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.entries WHERE id IN (
          '00000000-0000-0000-0000-000001596081', '00000000-0000-0000-0000-000001596082',
          '00000000-0000-0000-0000-000001596083', '00000000-0000-0000-0000-000001596084')
          AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL restore did not bring back the objects and the paid entries an override deleted';
  END IF;
  RAISE NOTICE 'PASS restore_show, restore_trial and restore_class work after an override delete';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Shape and ACLs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  IF to_regprocedure('public.soft_delete_show(uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.soft_delete_class(uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.soft_delete_trial(uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an old (uuid, boolean) soft_delete overload still exists';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.soft_delete_show(uuid, boolean, text)', 'public.soft_delete_class(uuid, boolean, text)',
    'public.soft_delete_trial(uuid, boolean, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR EXISTS (
         SELECT 1 FROM pg_proc p
         WHERE p.oid = v_fn::regprocedure
           AND (p.proacl IS NULL
                OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
       ) THEN
      RAISE EXCEPTION 'FAIL anon or PUBLIC can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated or service_role cannot execute %', v_fn;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn::regprocedure)
       OR (SELECT p.proconfig FROM pg_proc p WHERE p.oid = v_fn::regprocedure) IS DISTINCT FROM ARRAY['search_path=""'] THEN
      RAISE EXCEPTION 'FAIL % lost SECURITY DEFINER or its empty search_path', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'private.require_override_reason(boolean, text)',
    'private.record_delete_override(text, uuid, text, timestamptz, integer, integer)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL a client role can execute internal helper %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS new signatures: authenticated + service_role only, definer, empty search_path; helpers private';
END;
$$;

ROLLBACK;
