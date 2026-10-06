-- MYK9-731 (migration 20261006014300), part 1:
-- public.seed_demo_restore_show_day_fixture() is INSERT-ONLY. It returns
-- today's ready show-day fixture, or inserts a brand-new one with fresh ids in
-- the marker range dededede-0000-0000-0731-*, and never updates or deletes an
-- existing row.
--
--   1. Refusals, each writing nothing: no demo club (P0002), a demo account
--      that does not resolve to exactly one person, secretary@ without a
--      sign-in account, a seeded dog missing.
--   2. A fresh fixture meets every readiness condition, restated here rather
--      than read from the function: a live trial dated today in its own
--      timezone, self-check-in at both levels, a published class time, the
--      exhibitor's live entry in the running order, an active announcement.
--   3. A second call the same day inserts nothing and returns the same show.
--   4. Once that fixture stops being ready (soft-deleted from the app, as on
--      2026-10-01), the next call inserts a new one with new ids.
--   4b. Today's exhibitor@ entry withdrawn, scratched, pulled, check-in
--      completed, scored, or carrying an absent / excused / WD result -- every
--      state isClassCheckInEligible() refuses -- makes the fixture unready, so
--      the next call inserts a new one and leaves the old fixture's rows
--      byte-for-byte unchanged.
--   5. exhibitor@ reads the fixture's announcements under RLS.
--   6. ACL: both functions are service_role only; the restore is SECURITY
--      DEFINER with an empty search_path.
-- Part 2, myk9_731_restore_show_day_fixture_containment_test.sql, proves an
-- old fixture's rows, a walk's rows and a non-fixture show are byte-for-byte
-- unchanged by a restore.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- Runs the restore as the operator role and returns its result.
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

-- Readiness of one show, restated independently of the function.
CREATE FUNCTION pg_temp.ready(p_show uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer
  FROM public.trials t
  JOIN public.shows s ON s.id = t.show_id
  JOIN public.show_visibility_settings vs ON vs.show_id = s.id
  JOIN public.classes c ON c.trial_id = t.id
  JOIN public.entries e ON e.class_id = c.id
  JOIN public.people p ON p.id = e.handler_id
  WHERE s.id = p_show
    AND s.status = 'published'
    AND s.deleted_at IS NULL AND t.deleted_at IS NULL
    AND c.deleted_at IS NULL AND e.deleted_at IS NULL
    AND t.date = (now() AT TIME ZONE t.timezone)::date
    AND t.allow_self_checkin AND vs.self_checkin_enabled
    AND c.start_time IS NOT NULL AND e.run_order IS NOT NULL
    AND e.entry_status IN ('confirmed', 'accepted', 'scheduled')
    AND coalesce(e.check_in_status, '') NOT IN ('pulled', 'completed')
    AND NOT coalesce(e.is_scored, false)
    AND coalesce(e.result_status, 'pending') NOT IN ('absent', 'excused', 'withdrawn')
    AND lower(p.email) = 'exhibitor@myk9t.com'
    AND EXISTS (SELECT 1 FROM public.show_announcements sa
                WHERE sa.show_id = s.id AND sa.is_active);
$$;

-- Every row of one fixture show, for a byte-for-byte comparison.
CREATE FUNCTION pg_temp.show_rows(p_show uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT to_jsonb(s)::text FROM public.shows s WHERE s.id = p_show),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.trials t WHERE t.show_id = p_show),
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)::text FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = p_show),
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM public.entries e WHERE e.show_id = p_show),
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM public.armbands a WHERE a.show_id = p_show),
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)::text FROM public.entry_status_history h
      JOIN public.entries e ON e.id = h.entry_id WHERE e.show_id = p_show)));
$$;

-- Fixture shows in the marker range.
CREATE FUNCTION pg_temp.fixture_shows() RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM public.shows
  WHERE id >= 'dededede-0000-0000-0731-000000000000'::uuid
    AND id <  'dededede-0000-0000-0732-000000000000'::uuid;
$$;

-- Asserts the restore refuses with a message containing p_like, and that the
-- refusal inserted no fixture show.
CREATE FUNCTION pg_temp.refuses(label text, p_like text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE err text := pg_temp.restore_error();
BEGIN
  IF err IS NULL OR err NOT LIKE p_like THEN
    RAISE EXCEPTION 'FAIL %: expected a refusal like %, got %', label, p_like, coalesce(err, '<no error>');
  END IF;
  IF pg_temp.fixture_shows() <> 0 THEN
    RAISE EXCEPTION 'FAIL %: the refused restore left a fixture show behind', label;
  END IF;
  RAISE NOTICE 'PASS %', label;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Refusals, in the order a fresh database meets them.
-- ---------------------------------------------------------------------------
SELECT pg_temp.refuses('1.1 no demo club refuses with P0002',
                       'P0002 %Heartland demo club%does not exist%');

INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('dededede-0000-0000-0000-000000000001', 'MYK9-731 Heartland Club', now());

SELECT pg_temp.refuses('1.2 a missing exhibitor@ refuses',
                       '%expected exactly 1 person for exhibitor@myk9t.com, found 0%');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000731001', 'Casey', 'Morgan', 'exhibitor@myk9t.com'),
  ('00000000-0000-0000-0000-000000731002', 'Jordan', 'Ellis', 'secretary@myk9t.com'),
  ('00000000-0000-0000-0000-000000731003', 'MYK9-731', 'Judge', 'judge@myk9t.com');

SELECT pg_temp.refuses('1.3 secretary@ without a sign-in account refuses',
                       '%secretary@myk9t.com has no sign-in account%');

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

SELECT pg_temp.refuses('1.4 missing seeded dogs refuse',
                       '%seeded dogs Willow (...041) and Cooper (...046)%found 0%');

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'Willow', 'Willow', 'Border Collie', 'active',
   '00000000-0000-0000-0000-000000731001'),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Labrador Retriever', 'active',
   '00000000-0000-0000-0000-000000731002');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'AKC', 'SS73100041', true),
  ('dededede-0000-0000-0000-000000000046', 'AKC', 'SS73100046', true);

CREATE TEMP TABLE run ON COMMIT DROP AS SELECT 1 AS n, NULL::uuid AS show_id;

-- ---------------------------------------------------------------------------
-- 2. A fresh fixture meets every readiness condition.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb := pg_temp.restore();
  v_show uuid := (r->>'show_id')::uuid;
BEGIN
  IF NOT (r->>'created')::boolean THEN
    RAISE EXCEPTION 'FAIL 2.1 the first call did not create a fixture: %', r;
  END IF;
  IF v_show::text NOT LIKE 'dededede-0000-0000-0731-%' THEN
    RAISE EXCEPTION 'FAIL 2.2 the fixture show id % is outside the marker range', v_show;
  END IF;
  IF pg_temp.ready(v_show) <> 1 THEN
    RAISE EXCEPTION 'FAIL 2.3 expected exactly 1 ready exhibitor entry on the new fixture, found %', pg_temp.ready(v_show);
  END IF;
  IF (SELECT array_agg(t.date - (now() AT TIME ZONE 'America/Chicago')::date ORDER BY t.date)
      FROM public.trials t WHERE t.show_id = v_show) IS DISTINCT FROM ARRAY[0, 1, 2, 3, 4, 5, 6] THEN
    RAISE EXCEPTION 'FAIL 2.4 the trials are not dated today .. today + 6 in America/Chicago';
  END IF;
  IF (SELECT count(*) FROM public.classes c JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = v_show) <> 7
     OR (SELECT count(*) FROM public.entries WHERE show_id = v_show) <> 14
     OR (SELECT count(*) FROM public.armbands WHERE show_id = v_show) <> 2
     OR (SELECT count(*) FROM public.judge_assignments WHERE show_id = v_show AND class_id IS NOT NULL) <> 7
     OR (SELECT count(*) FROM public.show_announcements
         WHERE show_id = v_show AND is_active AND priority = 'normal') <> 2 THEN
    RAISE EXCEPTION 'FAIL 2.5 the fixture is incomplete (classes, entries, armbands, judges or announcements)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entries WHERE show_id = v_show
             AND id::text NOT LIKE 'dededede-0000-0000-0731-%') THEN
    RAISE EXCEPTION 'FAIL 2.6 a fixture entry was minted outside the marker range';
  END IF;
  IF (SELECT public.seed_demo_show_day_fixture_today()) IS DISTINCT FROM v_show THEN
    RAISE EXCEPTION 'FAIL 2.7 the walks'' lookup does not find the new fixture';
  END IF;
  UPDATE run SET show_id = v_show;
  RAISE NOTICE 'PASS 2 a fresh fixture meets every readiness condition';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. A second call the same day inserts nothing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows_before bigint := (SELECT count(*) FROM public.entries) + (SELECT count(*) FROM public.trials)
                        + (SELECT count(*) FROM public.classes) + (SELECT count(*) FROM public.armbands)
                        + (SELECT count(*) FROM public.judge_assignments)
                        + (SELECT count(*) FROM public.show_announcements);
  r jsonb := pg_temp.restore();
BEGIN
  IF (r->>'created')::boolean OR (r->>'show_id')::uuid IS DISTINCT FROM (SELECT show_id FROM run) THEN
    RAISE EXCEPTION 'FAIL 3.1 the second call did not return the existing fixture: %', r;
  END IF;
  IF pg_temp.fixture_shows() <> 1
     OR (SELECT count(*) FROM public.entries) + (SELECT count(*) FROM public.trials)
        + (SELECT count(*) FROM public.classes) + (SELECT count(*) FROM public.armbands)
        + (SELECT count(*) FROM public.judge_assignments)
        + (SELECT count(*) FROM public.show_announcements) <> v_rows_before THEN
    RAISE EXCEPTION 'FAIL 3.2 the second call inserted rows';
  END IF;
  RAISE NOTICE 'PASS 3 a second call the same day inserts nothing';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The secretary deletes the fixture from the app (direct soft-delete as the
-- owner, which the block allows): the next call inserts a new fixture.
-- ---------------------------------------------------------------------------
UPDATE public.shows SET deleted_at = now() WHERE id = (SELECT show_id FROM run);

DO $$
DECLARE
  r jsonb;
  v_old uuid := (SELECT show_id FROM run);
BEGIN
  IF public.seed_demo_show_day_fixture_today() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE the deleted fixture still reads ready, so case 4 proves nothing';
  END IF;
  r := pg_temp.restore();
  IF NOT (r->>'created')::boolean OR (r->>'show_id')::uuid = v_old
     OR pg_temp.ready((r->>'show_id')::uuid) <> 1 OR pg_temp.fixture_shows() <> 2 THEN
    RAISE EXCEPTION 'FAIL 4.1 a deleted fixture was not replaced by a new ready one: %', r;
  END IF;
  IF (SELECT deleted_at FROM public.shows WHERE id = v_old) IS NULL THEN
    RAISE EXCEPTION 'FAIL 4.2 the restore undeleted the old fixture';
  END IF;
  UPDATE run SET show_id = (r->>'show_id')::uuid;
  RAISE NOTICE 'PASS 4 a deleted fixture is replaced by a new one and left deleted';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Today's exhibitor@ entry drifts into each state isClassCheckInEligible()
-- refuses: withdrawn, scratched, pulled, check-in completed, scored, and an
-- absent / excused / WD result. Each leaves the fixture unready, and the
-- restore inserts a new ready one without touching the old fixture's rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_set text;
  v_old uuid;
  v_before text;
  v_n integer;
  r jsonb;
BEGIN
  FOREACH v_set IN ARRAY ARRAY[
    'entry_status = ''withdrawn''',
    'entry_status = ''scratched''',
    'check_in_status = ''pulled''',
    'check_in_status = ''completed''',
    'is_scored = true',
    'result_status = ''absent''',
    'result_status = ''excused''',
    'result_status = ''withdrawn'''
  ] LOOP
    v_old := (SELECT show_id FROM run);
    EXECUTE format(
      $q$UPDATE public.entries e SET %s
         FROM public.trials t, public.people p
         WHERE e.show_id = $1 AND t.id = e.trial_id AND p.id = e.handler_id
           AND t.date = (now() AT TIME ZONE t.timezone)::date
           AND lower(p.email) = 'exhibitor@myk9t.com'$q$, v_set)
    USING v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FIXTURE expected 1 exhibitor@ entry on today''s trial to set %, found %', v_set, v_n;
    END IF;
    IF public.seed_demo_show_day_fixture_today() IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL 4b.1 an exhibitor@ entry with % still reads as a ready fixture', v_set;
    END IF;
    v_before := pg_temp.show_rows(v_old);
    r := pg_temp.restore();
    IF NOT (r->>'created')::boolean OR (r->>'show_id')::uuid = v_old
       OR pg_temp.ready((r->>'show_id')::uuid) <> 1 THEN
      RAISE EXCEPTION 'FAIL 4b.2 an exhibitor@ entry with % did not lead to a new ready fixture: %', v_set, r;
    END IF;
    IF pg_temp.show_rows(v_old) IS DISTINCT FROM v_before THEN
      RAISE EXCEPTION 'FAIL 4b.3 the restore changed the old fixture''s rows after %', v_set;
    END IF;
    RAISE NOTICE 'PASS 4b %: the fixture is unready, a new one is inserted, the old rows are unchanged', v_set;
    UPDATE run SET show_id = (r->>'show_id')::uuid;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. exhibitor@ sees the announcements under RLS.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n integer;
  v_show uuid := (SELECT show_id FROM run);
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
  WHERE show_id = v_show AND is_active AND (expires_at IS NULL OR expires_at > now());
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
-- 6. ACL.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_restore oid := 'public.seed_demo_restore_show_day_fixture()'::regprocedure;
  v_today oid := 'public.seed_demo_show_day_fixture_today()'::regprocedure;
  v_fn oid;
  v_role text;
  v_state text;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_restore) THEN
    RAISE EXCEPTION 'FAIL 6.1 the restore is not SECURITY DEFINER';
  END IF;
  IF (SELECT proconfig FROM pg_proc WHERE oid = v_restore) IS DISTINCT FROM ARRAY['search_path=""']
     OR (SELECT proconfig FROM pg_proc WHERE oid = v_today) IS DISTINCT FROM ARRAY['search_path=""'] THEN
    RAISE EXCEPTION 'FAIL 6.2 a fixture function does not pin an empty search_path';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_today) THEN
    RAISE EXCEPTION 'FAIL 6.3 the lookup must stay SECURITY INVOKER';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[v_restore, v_today] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                  WHERE p.oid = v_fn AND a.grantee = 0) THEN
      RAISE EXCEPTION 'FAIL 6.4 EXECUTE on % must be service_role only', v_fn::regprocedure;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    v_state := NULL;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_role);
      PERFORM public.seed_demo_restore_show_day_fixture();
    EXCEPTION WHEN insufficient_privilege THEN
      v_state := '42501';
    END;
    RESET ROLE;
    IF v_state IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FAIL 6.5 % was not refused with 42501', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 6 service_role only; SECURITY DEFINER restore, INVOKER lookup, empty search_path';
END;
$$;

ROLLBACK;
