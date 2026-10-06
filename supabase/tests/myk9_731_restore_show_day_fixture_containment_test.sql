-- MYK9-731 (migration 20261006014300), part 2: the INSERT-ONLY restore writes
-- nothing outside the fixture it creates. Part 1 (readiness, idempotence,
-- refusals, RLS, ACL) is supabase/tests/myk9_731_restore_show_day_fixture_test.sql.
--
-- The earlier reset-in-place design was dropped because triggers reacting to
-- its UPDATEs reached rows it did not own: withdrawn_at re-stamped forever, the
-- armband propagated to a walk's entries, the scoring rollup re-ranked a walk's
-- placement, a judge assignment's class touch, move-up links and replication
-- versions. This file builds exactly those situations on an OLD fixture and on
-- a non-fixture show, runs a restore that must create a new fixture, and
-- requires every pre-existing row to be byte-for-byte unchanged, version,
-- armband and withdrawn_at included. Only rows of the new show may appear.
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

-- Every row that exists before the restore, in every table the restore or its
-- triggers could write, keyed by table and id.
CREATE FUNCTION pg_temp.snapshot() RETURNS TABLE (tbl text, id uuid, row jsonb)
LANGUAGE sql AS $$
  SELECT 'shows', s.id, to_jsonb(s) FROM public.shows s
  UNION ALL SELECT 'trials', t.id, to_jsonb(t) FROM public.trials t
  UNION ALL SELECT 'classes', c.id, to_jsonb(c) FROM public.classes c
  UNION ALL SELECT 'entries', e.id, to_jsonb(e) FROM public.entries e
  UNION ALL SELECT 'armbands', a.id, to_jsonb(a) FROM public.armbands a
  UNION ALL SELECT 'judge_assignments', j.id, to_jsonb(j) FROM public.judge_assignments j
  UNION ALL SELECT 'show_announcements', sa.id, to_jsonb(sa) FROM public.show_announcements sa
  UNION ALL SELECT 'show_visibility_settings', v.show_id, to_jsonb(v) FROM public.show_visibility_settings v
  UNION ALL SELECT 'entry_status_history', h.id, to_jsonb(h) FROM public.entry_status_history h
  UNION ALL SELECT 'dogs', d.id, to_jsonb(d) FROM public.dogs d
  UNION ALL SELECT 'people', p.id, to_jsonb(p) FROM public.people p;
$$;

-- --- fixtures: the demo club, accounts and dogs, a walk's dog, and a live
-- non-fixture show with a class.
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
VALUES ('00000000-0000-0000-0000-000000731700', 'MYK9-731 Other Show', 'AKC',
        current_date, current_date, 'dededede-0000-0000-0000-000000000001', 'published',
        (current_date - 40)::timestamptz, (current_date - 14)::timestamptz);
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone, allow_self_checkin)
VALUES ('00000000-0000-0000-0000-000000731710', '00000000-0000-0000-0000-000000731700',
        'MYK9-731 Other Trial', current_date, 'AKC', 'scent_work', 'America/Chicago', true);
INSERT INTO public.classes (id, trial_id, name, element, level, status, entry_fee, start_time)
VALUES ('00000000-0000-0000-0000-000000731720', '00000000-0000-0000-0000-000000731710',
        'MYK9-731 Other Class', 'Container', 'Novice', 'upcoming', 30, '09:00');

-- The OLD fixture: built by a restore, then lived in by walks.
CREATE TEMP TABLE old_fixture ON COMMIT DROP AS
SELECT (pg_temp.restore()->>'show_id')::uuid AS show_id;

DO $$
DECLARE
  v_old uuid := (SELECT show_id FROM old_fixture);
  v_class uuid;
  v_class2 uuid;
  v_willow uuid;
BEGIN
  IF v_old IS NULL OR v_old::text NOT LIKE 'dededede-0000-0000-0731-%' THEN
    RAISE EXCEPTION 'FIXTURE the first restore did not create a fixture';
  END IF;
  SELECT c.id INTO v_class FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
  WHERE t.show_id = v_old ORDER BY t.date LIMIT 1;
  SELECT c.id INTO v_class2 FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
  WHERE t.show_id = v_old ORDER BY t.date OFFSET 1 LIMIT 1;
  SELECT e.id INTO v_willow FROM public.entries e
  WHERE e.class_id = v_class AND e.dog_id = 'dededede-0000-0000-0000-000000000041';

  -- A walk withdraws Willow (stamps withdrawn_at, writes status history) and
  -- checks Cooper in.
  UPDATE public.entries SET entry_status = 'withdrawn' WHERE id = v_willow;
  UPDATE public.entries SET check_in_status = 'checked-in'
  WHERE class_id = v_class AND dog_id = 'dededede-0000-0000-0000-000000000046';
  -- A walk's move-up destination in the next class, pointing at the withdrawn
  -- fixture entry, with its own armband.
  INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id,
                              entry_status, payment_status, armband, moved_from_entry_id)
  SELECT '00000000-0000-0000-0000-000000731602', '00000000-0000-0000-0000-000000731401',
         v_class2, c.trial_id, v_old, '00000000-0000-0000-0000-000000731001',
         'confirmed', 'pending', '777', v_willow
  FROM public.classes c WHERE c.id = v_class2;
  -- A walk's scored, placed entry in a fixture class.
  INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id,
                              entry_status, payment_status, is_scored, result_status)
  SELECT '00000000-0000-0000-0000-000000731603', '00000000-0000-0000-0000-000000731401',
         v_class, c.trial_id, v_old, '00000000-0000-0000-0000-000000731001',
         'confirmed', 'pending', true, 'qualified'
  FROM public.classes c WHERE c.id = v_class;
  UPDATE public.entries SET final_placement = 1 WHERE id = '00000000-0000-0000-0000-000000731603';
  -- A judge assignment of the fixture's judge drifted into the other show's class.
  UPDATE public.judge_assignments SET class_id = '00000000-0000-0000-0000-000000731720'
  WHERE id = (SELECT id FROM public.judge_assignments WHERE show_id = v_old ORDER BY id LIMIT 1);
  -- A walk's entry on Willow at the non-fixture show, with a different armband.
  INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id,
                              entry_status, payment_status, armband)
  VALUES ('00000000-0000-0000-0000-000000731604', 'dededede-0000-0000-0000-000000000041',
          '00000000-0000-0000-0000-000000731720', '00000000-0000-0000-0000-000000731710',
          '00000000-0000-0000-0000-000000731700', '00000000-0000-0000-0000-000000731001',
          'confirmed', 'pending', '999');
  -- And the old fixture goes stale: its trials a week in the past.
  UPDATE public.trials SET date = date - 7 WHERE show_id = v_old;

  IF (SELECT withdrawn_at FROM public.entries WHERE id = v_willow) IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.entry_status_history WHERE entry_id = v_willow)
     OR (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000731603') IS DISTINCT FROM 1
     OR public.seed_demo_show_day_fixture_today() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE the old fixture is not in the walked, stale state the cases need';
  END IF;
END;
$$;

CREATE TEMP TABLE snap_before ON COMMIT DROP AS SELECT * FROM pg_temp.snapshot();

-- ---------------------------------------------------------------------------
-- 7. The restore creates a new fixture and changes no existing row.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb := pg_temp.restore();
  v_new uuid := (r->>'show_id')::uuid;
  v_changed text;
  v_missing text;
  v_foreign text;
BEGIN
  IF NOT (r->>'created')::boolean OR v_new = (SELECT show_id FROM old_fixture) THEN
    RAISE EXCEPTION 'FAIL 7.1 a stale old fixture did not lead to a new one: %', r;
  END IF;

  SELECT string_agg(b.tbl || ' ' || b.id, ', ') INTO v_changed
  FROM snap_before b JOIN pg_temp.snapshot() a ON a.tbl = b.tbl AND a.id = b.id
  WHERE a.row IS DISTINCT FROM b.row;
  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7.2 the restore changed existing rows: %', v_changed;
  END IF;

  SELECT string_agg(b.tbl || ' ' || b.id, ', ') INTO v_missing
  FROM snap_before b
  WHERE NOT EXISTS (SELECT 1 FROM pg_temp.snapshot() a WHERE a.tbl = b.tbl AND a.id = b.id);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7.3 the restore deleted rows: %', v_missing;
  END IF;

  -- Every new row belongs to the new show: no row outside it was created
  -- either (dogs and people get none; status history, if any, is the new
  -- fixture's own entries').
  SELECT string_agg(a.tbl || ' ' || a.id, ', ') INTO v_foreign
  FROM pg_temp.snapshot() a
  WHERE NOT EXISTS (SELECT 1 FROM snap_before b WHERE b.tbl = a.tbl AND b.id = a.id)
    AND NOT (
      (a.tbl = 'shows' AND a.id = v_new)
      OR (a.tbl IN ('entries', 'armbands', 'judge_assignments', 'show_announcements')
          AND (a.row->>'show_id')::uuid = v_new)
      OR (a.tbl = 'show_visibility_settings' AND a.id = v_new)
      OR (a.tbl = 'trials' AND (a.row->>'show_id')::uuid = v_new)
      OR (a.tbl = 'classes' AND (a.row->>'trial_id')::uuid IN
            (SELECT t.id FROM public.trials t WHERE t.show_id = v_new))
      OR (a.tbl = 'entry_status_history' AND (a.row->>'entry_id')::uuid IN
            (SELECT e.id FROM public.entries e WHERE e.show_id = v_new)));
  IF v_foreign IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7.4 the restore created rows outside the new fixture: %', v_foreign;
  END IF;

  RAISE NOTICE 'PASS 7 a new fixture is inserted and every existing row (old fixture, walk entries, versions, armbands, withdrawn_at, placements, move-up links, judge assignments, the other show) is byte-for-byte unchanged';
END;
$$;

ROLLBACK;
