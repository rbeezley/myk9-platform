-- MYK9-731 (migration 20261006014300), part 2: trigger containment in
-- public.seed_demo_restore_show_day_fixture(). Part 1 -- readiness,
-- idempotence, the October 5 repair, the money refusals and the ACL -- is
-- supabase/tests/myk9_731_restore_show_day_fixture_test.sql; the split keeps
-- each file under the repo's 500-line ceiling.
--
-- Resetting a fixture entry deletes and re-inserts it, and entries' scoring
-- trigger then re-derives that entry's class: the class row and final_placement
-- on every entry in it. The restore therefore refuses:
--   8.1 while a fixture entry sits in another show's class (the delete would
--       re-derive that class);
--   8.2 while a walk's live, scored entry sits in a fixture class;
--   8.3 while a walk's entry in a fixture class holds a placement, deleted or
--       not;
-- and 8.4 a walk's deleted, scored, unplaced entry (the state live staging is
-- in) neither blocks the restore nor changes.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

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

CREATE FUNCTION pg_temp.restore_error() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.restore();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.ready() RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer
  FROM public.trials t
  JOIN public.shows s ON s.id = t.show_id
  JOIN public.classes c ON c.trial_id = t.id
  JOIN public.entries e ON e.class_id = c.id
  JOIN public.people p ON p.id = e.handler_id
  WHERE s.id = 'dededede-0000-0000-0000-000000000014'
    AND s.deleted_at IS NULL AND t.deleted_at IS NULL
    AND c.deleted_at IS NULL AND e.deleted_at IS NULL
    AND t.date = (now() AT TIME ZONE t.timezone)::date
    AND lower(p.email) = 'exhibitor@myk9t.com';
$$;

-- --- fixtures: the demo club, accounts and dogs, the fixture show row, a walk
-- dog, and a LIVE show with a class outside the fixture.
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('dededede-0000-0000-0000-000000000001', 'MYK9-731 Heartland Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000731001', 'Casey', 'Morgan', 'exhibitor@myk9t.com'),
  ('00000000-0000-0000-0000-000000731002', 'Jordan', 'Ellis', 'secretary@myk9t.com'),
  ('00000000-0000-0000-0000-000000731003', 'MYK9-731', 'Judge', 'judge@myk9t.com');

-- The secretary needs a sign-in account: it authors the announcements.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
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
   current_date, current_date + 6, 'dededede-0000-0000-0000-000000000001', 'published',
   (current_date - 30)::timestamptz, (current_date - 3)::timestamptz),
  ('00000000-0000-0000-0000-000000731700', 'MYK9-731 Live Other Show', 'AKC',
   current_date, current_date, 'dededede-0000-0000-0000-000000000001', 'published',
   (current_date - 40)::timestamptz, (current_date - 14)::timestamptz);
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone, allow_self_checkin)
VALUES ('00000000-0000-0000-0000-000000731710', '00000000-0000-0000-0000-000000731700',
        'MYK9-731 Live Other Trial', current_date, 'AKC', 'scent_work', 'America/Chicago', true);
INSERT INTO public.classes (id, trial_id, name, element, level, status, entry_fee, start_time)
VALUES ('00000000-0000-0000-0000-000000731720', '00000000-0000-0000-0000-000000731710',
        'MYK9-731 Live Other Class', 'Container', 'Novice', 'upcoming', 30, '09:00');

-- Build the fixture once, as the seed does.
DO $$
BEGIN
  PERFORM pg_temp.restore();
  IF pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FIXTURE the first restore did not build a ready fixture';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Each refusal writes nothing (it runs in the
-- restore's own subtransaction). The last case is the control: once the rows
-- are back inside the limits the restore runs and leaves the walk's row alone.
-- ---------------------------------------------------------------------------
-- 8a. A fixture entry moved into another show's live class.
UPDATE public.entries
   SET class_id = '00000000-0000-0000-0000-000000731720',
       trial_id = '00000000-0000-0000-0000-000000731710',
       show_id  = '00000000-0000-0000-0000-000000731700'
 WHERE id = 'dededede-0000-0000-0014-000000000105';

DO $$
DECLARE err text := pg_temp.restore_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%dededede-0000-0000-0014-000000000105 sit in a class outside the fixture%' THEN
    RAISE EXCEPTION 'FAIL 8.1 a fixture entry in another show''s class did not refuse: %', coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS 8.1 a fixture entry in another show''s class refuses the restore';
END;
$$;

UPDATE public.entries
   SET class_id = 'dec1a55e-0000-0000-0014-000000000005',
       trial_id = 'dededede-0000-0000-0014-000000000005',
       show_id  = 'dededede-0000-0000-0000-000000000014'
 WHERE id = 'dededede-0000-0000-0014-000000000105';

-- 8b. A walk's LIVE scored entry in a fixture class.
INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id,
                            entry_status, payment_status, is_scored, result_status)
VALUES ('00000000-0000-0000-0000-000000731604', '00000000-0000-0000-0000-000000731401',
        'dec1a55e-0000-0000-0014-000000000001', 'dededede-0000-0000-0014-000000000001',
        'dededede-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000731001',
        'confirmed', 'pending', true, 'qualified');

DO $$
DECLARE err text := pg_temp.restore_error();
BEGIN
  IF err IS NULL OR err NOT LIKE '%00000000-0000-0000-0000-000000731604 that a walk created in a fixture class carry a result or placement%' THEN
    RAISE EXCEPTION 'FAIL 8.2 a walk''s live scored entry in a fixture class did not refuse: %', coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS 8.2 a walk''s live scored entry in a fixture class refuses the restore';
END;
$$;

-- 8c. Deleted but still placed: the rollup would clear its placement. Two
-- statements, because the delete itself re-derives the class and clears the
-- placement; a later write of final_placement alone (an offline full-row
-- upload, say) does not fire the scoring trigger and so can leave one behind.
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000731604';
UPDATE public.entries SET final_placement = 1 WHERE id = '00000000-0000-0000-0000-000000731604';

DO $$
DECLARE err text;
BEGIN
  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000731604')
     IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FIXTURE the walk entry does not hold a placement, so 8.3 proves nothing';
  END IF;
  err := pg_temp.restore_error();
  IF err IS NULL OR err NOT LIKE '%731604 that a walk created in a fixture class%' THEN
    RAISE EXCEPTION 'FAIL 8.3 a walk''s deleted but placed entry in a fixture class did not refuse: %', coalesce(err, '<no error>');
  END IF;
  RAISE NOTICE 'PASS 8.3 a walk''s placed entry refuses the restore even when deleted';
END;
$$;

-- Control: deleted, scored, unplaced (the state live staging is in) does not
-- block, and the restore leaves that row exactly as it was.
UPDATE public.entries SET final_placement = NULL WHERE id = '00000000-0000-0000-0000-000000731604';
UPDATE public.entries SET deleted_at = now() WHERE id = 'dededede-0000-0000-0014-000000000101';
CREATE TEMP TABLE scored_walk_before ON COMMIT DROP AS
SELECT to_jsonb(e) AS row FROM public.entries e WHERE e.id = '00000000-0000-0000-0000-000000731604';

DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.restore();
  IF (r->>'entries')::int <> 1 OR pg_temp.ready() <> 1 THEN
    RAISE EXCEPTION 'FAIL 8.4 the restore did not reset the deleted fixture entry beside a deleted scored walk entry: %', r;
  END IF;
  IF (SELECT to_jsonb(e) FROM public.entries e WHERE e.id = '00000000-0000-0000-0000-000000731604')
     IS DISTINCT FROM (SELECT row FROM scored_walk_before) THEN
    RAISE EXCEPTION 'FAIL 8.5 the class re-derivation changed a walk''s deleted scored entry';
  END IF;
  RAISE NOTICE 'PASS 8.4 a walk''s deleted, unplaced scored entry neither blocks the restore nor changes';
END;
$$;

ROLLBACK;
