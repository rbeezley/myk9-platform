-- MYK9-731 (migration 20261006014300): public.seed_demo_restore_show_day_fixture()
-- re-dates and repairs ONLY the staging show-day fixture
-- (show dededede-0000-0000-0000-000000000014).
--
--   1. On a show row alone (the seed's path) it builds the whole fixture, and
--      the readiness conditions hold: a trial dated today in its own timezone,
--      live class with a published time, the exhibitor's live entry in the
--      running order, self-check-in on at both levels.
--   2. A second run the same day writes nothing: every count is 0 and no row's
--      replication version moves.
--   3. The October 5 state -- dates a week stale, the show soft-deleted from
--      the app with its trials, classes and entries, a fixture entry scratched
--      and another checked in -- is repaired, while a walk's own entry on a
--      fixture class stays exactly as it was.
--   4. A second show (stale, soft-deleted, same club) is not touched.
--   5. exhibitor@ reads the fixture's announcements under RLS.
--   6. It refuses, writing nothing, when money sits on the show (a recorded
--      paid entry, a Stripe intent), and when the show is missing.
--   7. ACL: SECURITY DEFINER, empty search_path, executable by service_role
--      only; anon and authenticated are refused.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- Runs the restore as the operator role and returns its counts.
CREATE FUNCTION pg_temp.restore() RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  r := public.seed_demo_restore_show_day_fixture();
  RESET ROLE;
  RETURN r;
END;
$$;

-- The restore's error as 'SQLSTATE message', or NULL when it succeeded.
CREATE FUNCTION pg_temp.restore_error() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.restore();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$;

-- Readiness, restated here rather than read from the function, so a bug in
-- the function's own postcondition cannot agree with itself.
CREATE FUNCTION pg_temp.ready() RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer
  FROM public.trials t
  JOIN public.shows s ON s.id = t.show_id
  JOIN public.show_visibility_settings vs ON vs.show_id = s.id
  JOIN public.classes c ON c.trial_id = t.id
  JOIN public.entries e ON e.class_id = c.id
  JOIN public.people p ON p.id = e.handler_id
  WHERE s.id = 'dededede-0000-0000-0000-000000000014'
    AND s.status = 'published'
    AND s.deleted_at IS NULL AND t.deleted_at IS NULL
    AND c.deleted_at IS NULL AND e.deleted_at IS NULL
    AND t.date = (now() AT TIME ZONE t.timezone)::date
    AND t.allow_self_checkin AND vs.self_checkin_enabled
    AND c.start_time IS NOT NULL AND e.run_order IS NOT NULL
    AND lower(p.email) = 'exhibitor@myk9t.com';
$$;

-- Sum of replication versions over every fixture row: any UPDATE moves it.
CREATE FUNCTION pg_temp.fixture_versions() RETURNS bigint
LANGUAGE sql AS $$
  SELECT (SELECT coalesce(sum(version), 0) FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000014')
       + (SELECT coalesce(sum(version), 0) FROM public.trials WHERE show_id = 'dededede-0000-0000-0000-000000000014')
       + (SELECT coalesce(sum(c.version), 0) FROM public.classes c
            JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = 'dededede-0000-0000-0000-000000000014')
       + (SELECT coalesce(sum(version), 0) FROM public.entries WHERE show_id = 'dededede-0000-0000-0000-000000000014')
       + (SELECT coalesce(sum(version), 0) FROM public.armbands WHERE show_id = 'dededede-0000-0000-0000-000000000014')
       + (SELECT coalesce(sum(version), 0) FROM public.judge_assignments WHERE show_id = 'dededede-0000-0000-0000-000000000014');
$$;

-- Everything outside the fixture that the restore must never write.
CREATE FUNCTION pg_temp.outside() RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.shows s
      WHERE s.id <> 'dededede-0000-0000-0000-000000000014'),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.trials t
      WHERE t.show_id <> 'dededede-0000-0000-0000-000000000014'),
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)::text FROM public.classes c
      WHERE c.trial_id = '00000000-0000-0000-0000-000000731510'),
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM public.entries e
      WHERE e.id::text LIKE '00000000-0000-0000-0000-000000731%'),
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM public.dogs d),
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)::text FROM public.people p)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: the demo club and accounts, the seed's two dogs, a walk's dog, the
-- fixture show row alone (as the seed creates it), and a second show.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('dededede-0000-0000-0000-000000000001', 'MYK9-731 Heartland Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000731001', 'Casey', 'Morgan', 'exhibitor@myk9t.com'),
  ('00000000-0000-0000-0000-000000731002', 'Jordan', 'Ellis', 'secretary@myk9t.com'),
  ('00000000-0000-0000-0000-000000731003', 'MYK9-731', 'Judge', 'judge@myk9t.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000731101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'exhibitor@myk9t.com', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000731102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'secretary@myk9t.com', '', now(), now(), now(),
   '{}', '{}', false, false, false);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'Willow', 'Willow', 'Border Collie', 'active',
   '00000000-0000-0000-0000-000000731001'),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Labrador Retriever', 'active',
   '00000000-0000-0000-0000-000000731002'),
  ('00000000-0000-0000-0000-000000731401', 'MYK9-731 Walk Dog', 'Walker', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000731001');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'AKC', 'SS73100041', true),
  ('dededede-0000-0000-0000-000000000046', 'AKC', 'SS73100046', true),
  ('00000000-0000-0000-0000-000000731401', 'AKC', 'SS73100401', true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date)
VALUES
  ('dededede-0000-0000-0000-000000000014', 'Heartland Scent Work Week', 'AKC',
   current_date - 11, current_date - 5, 'dededede-0000-0000-0000-000000000001', 'published',
   (current_date - 40)::timestamptz, (current_date - 14)::timestamptz),
  ('00000000-0000-0000-0000-000000731500', 'MYK9-731 Other Show', 'AKC',
   current_date - 11, current_date - 11, 'dededede-0000-0000-0000-000000000001', 'published',
   (current_date - 40)::timestamptz, (current_date - 14)::timestamptz);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone, allow_self_checkin)
VALUES ('00000000-0000-0000-0000-000000731510', '00000000-0000-0000-0000-000000731500',
        'MYK9-731 Other Trial', current_date - 11, 'AKC', 'scent_work', 'America/Chicago', true);
INSERT INTO public.classes (id, trial_id, name, element, level, status, entry_fee, start_time)
VALUES ('00000000-0000-0000-0000-000000731520', '00000000-0000-0000-0000-000000731510',
        'MYK9-731 Other Class', 'Container', 'Novice', 'upcoming', 30, '09:00');
INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, entry_status, payment_status, run_order)
VALUES ('00000000-0000-0000-0000-000000731601', '00000000-0000-0000-0000-000000731401',
        '00000000-0000-0000-0000-000000731520', '00000000-0000-0000-0000-000000731510',
        '00000000-0000-0000-0000-000000731500', '00000000-0000-0000-0000-000000731001',
        'confirmed', 'pending', 1);
-- Stale and soft-deleted, exactly the state the fixture was in: if the restore
-- reached past its own ids, this is what it would "repair".
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000731601';
UPDATE public.classes SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000731520';
UPDATE public.trials SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000731510';
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000731500';

CREATE TEMP TABLE outside_before ON COMMIT DROP AS SELECT pg_temp.outside() AS h;

-- ---------------------------------------------------------------------------
-- 1. The seed's path: a show row alone becomes a ready fixture.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  IF pg_temp.ready() <> 0 THEN
    RAISE EXCEPTION 'FIXTURE the show is ready before any restore, so case 1 proves nothing';
  END IF;
  r := pg_temp.restore();
  IF pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FAIL 1.1 expected exactly 1 ready exhibitor entry after the first restore, found % (%)', pg_temp.ready(), r;
  END IF;
  IF (r->>'entries_inserted')::int <> 14 OR (r->>'trials')::int <> 7 OR (r->>'classes')::int <> 7
     OR (r->>'show_announcements')::int <> 2 OR (r->>'judge_assignments')::int <> 7
     OR (r->>'armbands')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 1.2 the first restore did not build the whole fixture: %', r;
  END IF;
  IF (SELECT array_agg(t.date - (now() AT TIME ZONE 'America/Chicago')::date ORDER BY t.date)
      FROM public.trials t WHERE t.show_id = 'dededede-0000-0000-0000-000000000014')
     IS DISTINCT FROM ARRAY[0, 1, 2, 3, 4, 5, 6] THEN
    RAISE EXCEPTION 'FAIL 1.3 the trials are not dated today .. today + 6 in America/Chicago';
  END IF;
  IF (SELECT count(*) FROM public.show_announcements
      WHERE show_id = 'dededede-0000-0000-0000-000000000014' AND is_active AND priority = 'normal') <> 2 THEN
    RAISE EXCEPTION 'FAIL 1.4 expected the two normal-priority announcements';
  END IF;
  RAISE NOTICE 'PASS 1 a show row alone becomes a ready show-day fixture';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Idempotence: the same day, a second run writes nothing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  v_before bigint := pg_temp.fixture_versions();
  k text;
BEGIN
  r := pg_temp.restore();
  FOR k IN SELECT jsonb_object_keys(r) LOOP
    IF k <> 'today' AND (r->>k)::int <> 0 THEN
      RAISE EXCEPTION 'FAIL 2.1 the second run wrote % row(s) to %: %', r->>k, k, r;
    END IF;
  END LOOP;
  IF pg_temp.fixture_versions() <> v_before THEN
    RAISE EXCEPTION 'FAIL 2.2 the second run moved a replication version (% -> %)', v_before, pg_temp.fixture_versions();
  END IF;
  IF pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FAIL 2.3 the fixture is not ready after the second run';
  END IF;
  RAISE NOTICE 'PASS 2 a second run the same day is a no-op';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The October 5 state. A walk enters its own dog on a fixture class, the
-- exhibitor's Day-7 entry is scratched and Day-2 checked in, the dates go a
-- week stale, and the secretary deletes the show from the app (which stamps
-- the show, trials, classes and entries alike).
-- ---------------------------------------------------------------------------
INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, entry_status, payment_status)
VALUES ('00000000-0000-0000-0000-000000731602', '00000000-0000-0000-0000-000000731401',
        'dec1a55e-0000-0000-0014-000000000002', 'dededede-0000-0000-0014-000000000002',
        'dededede-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000731001',
        'confirmed', 'pending');
UPDATE public.entries SET entry_status = 'scratched' WHERE id = 'dededede-0000-0000-0014-000000000106';
UPDATE public.entries SET check_in_status = 'checked-in' WHERE id = 'dededede-0000-0000-0014-000000000101';
UPDATE public.trials SET date = date - 11 WHERE show_id = 'dededede-0000-0000-0000-000000000014';
UPDATE public.entries SET deleted_at = now() WHERE show_id = 'dededede-0000-0000-0000-000000000014';
UPDATE public.classes SET deleted_at = now()
WHERE trial_id IN (SELECT id FROM public.trials WHERE show_id = 'dededede-0000-0000-0000-000000000014');
UPDATE public.trials SET deleted_at = now() WHERE show_id = 'dededede-0000-0000-0000-000000000014';
UPDATE public.shows SET deleted_at = now() WHERE id = 'dededede-0000-0000-0000-000000000014';

CREATE TEMP TABLE walk_entry_before ON COMMIT DROP AS
SELECT to_jsonb(e) AS row FROM public.entries e WHERE e.id = '00000000-0000-0000-0000-000000731602';

DO $$
DECLARE r jsonb;
BEGIN
  IF pg_temp.ready() <> 0 THEN
    RAISE EXCEPTION 'FIXTURE the deleted, stale fixture still reads ready, so case 3 proves nothing';
  END IF;
  r := pg_temp.restore();
  IF pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FAIL 3.1 the October 5 state is not ready after the restore (%)', r;
  END IF;
  IF (r->>'entries_reset')::int <> 14 OR (r->>'entries_inserted')::int <> 14 THEN
    RAISE EXCEPTION 'FAIL 3.2 expected all 14 deleted fixture entries reset: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entries
             WHERE id::text LIKE 'dededede-0000-0000-0014-000000000%'
               AND (deleted_at IS NOT NULL OR entry_status <> 'confirmed' OR check_in_status <> 'no-status')) THEN
    RAISE EXCEPTION 'FAIL 3.3 a fixture entry kept its walk state (deleted, scratched or checked in)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
             WHERE t.show_id = 'dededede-0000-0000-0000-000000000014'
               AND (c.deleted_at IS NOT NULL OR t.deleted_at IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000014' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 3.4 a fixture show, trial or class is still soft-deleted';
  END IF;
  IF (SELECT to_jsonb(e) FROM public.entries e WHERE e.id = '00000000-0000-0000-0000-000000731602')
     IS DISTINCT FROM (SELECT row FROM walk_entry_before) THEN
    RAISE EXCEPTION 'FAIL 3.5 the restore touched a walk''s own entry on a fixture class';
  END IF;
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000731602') IS NULL THEN
    RAISE EXCEPTION 'FAIL 3.6 the walk''s deleted entry was undeleted';
  END IF;
  RAISE NOTICE 'PASS 3 the October 5 state is repaired and a walk''s own entry is left alone';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Nothing outside the fixture moved: the second show, its trial, class and
-- entry, every dog and every person.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF pg_temp.outside() IS DISTINCT FROM (SELECT h FROM outside_before) THEN
    RAISE EXCEPTION 'FAIL 4.1 the restore wrote a row outside the fixture (another show, a dog or a person)';
  END IF;
  IF (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000731500') IS NULL THEN
    RAISE EXCEPTION 'FAIL 4.2 the second show was undeleted';
  END IF;
  RAISE NOTICE 'PASS 4 a second show, the dogs and the people are untouched';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. exhibitor@ sees the announcements under RLS.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000731101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000731101',
                       'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );
  SELECT count(*) INTO n FROM public.show_announcements
  WHERE show_id = 'dededede-0000-0000-0000-000000000014'
    AND is_active AND (expires_at IS NULL OR expires_at > now());
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL 5.1 exhibitor@ sees % fixture announcement(s), expected 2', n;
  END IF;
  RAISE NOTICE 'PASS 5 exhibitor@ reads the fixture announcements';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Fail closed. Each refusal is checked to have written nothing: a trial is
-- made stale first, and must still be stale after the refusal.
-- ---------------------------------------------------------------------------
UPDATE public.trials SET date = date - 1 WHERE id = 'dededede-0000-0000-0014-000000000000';

-- 6a. A recorded paid entry (a cheque reference) on a fixture class.
INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id,
                            entry_status, payment_status, entry_fee, payment_reference)
VALUES ('00000000-0000-0000-0000-000000731603', '00000000-0000-0000-0000-000000731401',
        'dec1a55e-0000-0000-0014-000000000000', 'dededede-0000-0000-0014-000000000000',
        'dededede-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000731001',
        'confirmed', 'paid', 30, 'CHK-731');

DO $$
DECLARE err text := pg_temp.restore_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%money sits on show%entry 00000000-0000-0000-0000-000000731603%' THEN
    RAISE EXCEPTION 'FAIL 6.1 a recorded paid entry on the fixture did not refuse: %', coalesce(err, '<no error>');
  END IF;
  IF pg_temp.ready() <> 0 THEN
    RAISE EXCEPTION 'FAIL 6.2 the refused restore still re-dated the fixture';
  END IF;
  RAISE NOTICE 'PASS 6.1 a recorded paid entry on the fixture refuses the restore and writes nothing';
END;
$$;

-- 6b. A Stripe payment intent refuses whatever the entry's status says. Only
-- the payment service (service_role) may write an intent.
SET LOCAL ROLE service_role;
UPDATE public.entries SET payment_status = 'pending', payment_reference = NULL,
                          stripe_payment_intent_id = 'pi_myk9_731'
WHERE id = '00000000-0000-0000-0000-000000731603';
RESET ROLE;

DO $$
DECLARE err text := pg_temp.restore_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%money sits on show%' THEN
    RAISE EXCEPTION 'FAIL 6.3 a Stripe intent on a fixture entry did not refuse: %', coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS 6.3 a Stripe intent on the fixture refuses the restore';
END;
$$;

-- Control: with the money gone, the same state restores. Without this, a
-- restore that always refused would pass 6.1 and 6.3.
DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000731603';
DO $$
BEGIN
  PERFORM pg_temp.restore();
  IF pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FAIL 6.4 the restore did not recover once the money row was gone';
  END IF;
  RAISE NOTICE 'PASS 6.4 the same state restores once the money is gone';
END;
$$;

-- 6c. A missing show refuses (and the delete is undone by the block).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000014';
    err := pg_temp.restore_error();
    RAISE EXCEPTION 'undo:%', coalesce(err, '<no error>');
  EXCEPTION WHEN raise_exception THEN
    err := SQLERRM;
  END;
  IF err NOT LIKE 'undo:P0002 %does not exist%' THEN
    RAISE EXCEPTION 'FAIL 6.5 a missing fixture show did not refuse with P0002: %', err;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000014') THEN
    RAISE EXCEPTION 'FIXTURE the show delete was not undone';
  END IF;
  RAISE NOTICE 'PASS 6.5 a missing fixture show refuses the restore';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. ACL.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_oid oid := 'public.seed_demo_restore_show_day_fixture()'::regprocedure;
  v_state text;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'FAIL 7.1 the restore is not SECURITY DEFINER';
  END IF;
  IF (SELECT proconfig FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM ARRAY['search_path=""'] THEN
    RAISE EXCEPTION 'FAIL 7.2 the restore does not pin an empty search_path: %', (SELECT proconfig FROM pg_proc WHERE oid = v_oid);
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 7.3 EXECUTE must be service_role only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
             WHERE p.oid = v_oid AND a.grantee = 0) THEN
    RAISE EXCEPTION 'FAIL 7.4 PUBLIC still holds a privilege on the restore';
  END IF;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.seed_demo_restore_show_day_fixture();
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := '42501';
  END;
  RESET ROLE;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7.5 authenticated was not refused with 42501';
  END IF;
  v_state := NULL;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.seed_demo_restore_show_day_fixture();
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := '42501';
  END;
  RESET ROLE;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7.6 anon was not refused with 42501';
  END IF;
  RAISE NOTICE 'PASS 7 SECURITY DEFINER, empty search_path, service_role only';
END;
$$;

ROLLBACK;
