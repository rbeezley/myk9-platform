-- MYK9-1476 (migration 20261029192700): a change to the CALLER's own role set
-- moves every row the results view returns to that caller.
--
-- Properties asserted:
--   1. private.user_access_epoch and the trigger function are closed to
--      anon/authenticated/PUBLIC; the epoch reader is executable by authenticated
--      (as the view needs) but not anon or PUBLIC;
--   2. grant (insert), deactivation (update) and hard delete of a user_roles row
--      each move every row view_authenticated_entry_results returns to the
--      affected caller to at or after the change, and flip
--      entry_results_changed_since to TRUE for them;
--   3. an expires_at that has already passed moves the caller's rows to at or
--      after expires_at with NO write (trigger bypassed), and a watermark after
--      expires_at reads FALSE again;
--   4. other callers' rows do not move and their changed_since stays FALSE;
--   5. the visible row set and every masked column are unchanged by the view
--      edit: a temp copy of the view with the epoch term nulled returns an
--      identical hash (updated_at excluded) for secretary, steward, exhibitor.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.
-- Fixtures: ids 1476xx, auth uids 1476 7xx.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000147601', 'site_admin', 'MYK9-1476 fixture', true),
  ('00000000-0000-0000-0000-000000147602', 'secretary', 'MYK9-1476 fixture', true),
  ('00000000-0000-0000-0000-000000147605', 'steward', 'MYK9-1476 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000147101', 'MYK9-1476 Club'),
       ('00000000-0000-0000-0000-000000147102', 'MYK9-1476 Other Club');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000147611', NULL, 'Owner', 'E1', 'myk91476-e1@example.test'),
  ('00000000-0000-0000-0000-000000147612', NULL, 'Other', 'E2', 'myk91476-e2@example.test'),
  ('00000000-0000-0000-0000-000000147614', NULL, 'Secretary', 'S', 'myk91476-s@example.test'),
  ('00000000-0000-0000-0000-000000147616', NULL, 'Steward', 'ST', 'myk91476-st@example.test'),
  ('00000000-0000-0000-0000-000000147618', NULL, 'OtherSec', 'OS', 'myk91476-os@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000147711', 'myk91476-e1@example.test'),
  ('00000000-0000-0000-0000-000000147712', 'myk91476-e2@example.test'),
  ('00000000-0000-0000-0000-000000147714', 'myk91476-s@example.test'),
  ('00000000-0000-0000-0000-000000147716', 'myk91476-st@example.test'),
  ('00000000-0000-0000-0000-000000147718', 'myk91476-os@example.test')
) AS u(id, email);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000147120', 'MYK9-1476 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000147101', 'published');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000147130', '00000000-0000-0000-0000-000000147120',
        'MYK9-1476 Trial', current_date);

INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing, time_timing, faults_timing
) VALUES ('00000000-0000-0000-0000-000000147120', 'review',
          'manual_release', 'manual_release', 'manual_release', 'manual_release');

INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000000147140', '00000000-0000-0000-0000-000000147130',
        'Container Novice', 'upcoming');

INSERT INTO public.trial_visibility_overrides (trial_id, preset)
VALUES ('00000000-0000-0000-0000-000000147130', 'review');
INSERT INTO public.class_visibility_overrides (class_id, preset)
VALUES ('00000000-0000-0000-0000-000000147140', 'review');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000147151', 'Alpha Registered', 'Alpha', 'Beagle',
   '00000000-0000-0000-0000-000000147611'),
  ('00000000-0000-0000-0000-000000147152', 'Bravo Registered', 'Bravo', 'Beagle',
   '00000000-0000-0000-0000-000000147612');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR1476' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-00000014715_';

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, payment_status,
  entry_fee, armband, run_order, is_scored, result_status, search_time_seconds,
  total_faults, total_score, final_placement
) VALUES
  ('00000000-0000-0000-0000-000000147161', '00000000-0000-0000-0000-000000147151',
   '00000000-0000-0000-0000-000000147140', '00000000-0000-0000-0000-000000147120',
   '00000000-0000-0000-0000-000000147130', '00000000-0000-0000-0000-000000147611',
   'confirmed', 'paid', 25, '101', 1, true, 'qualified', 30.5, 0, 100, 1),
  ('00000000-0000-0000-0000-000000147162', '00000000-0000-0000-0000-000000147152',
   '00000000-0000-0000-0000-000000147140', '00000000-0000-0000-0000-000000147120',
   '00000000-0000-0000-0000-000000147130', '00000000-0000-0000-0000-000000147612',
   'confirmed', 'paid', 25, '102', 2, true, 'qualified', 41.25, 0, 100, 2);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, g.show_id::uuid, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000147614', '00000000-0000-0000-0000-000000147714', 'secretary',
   '00000000-0000-0000-0000-000000147101', NULL),
  ('00000000-0000-0000-0000-000000147618', '00000000-0000-0000-0000-000000147718', 'secretary',
   '00000000-0000-0000-0000-000000147102', NULL),
  ('00000000-0000-0000-0000-000000147616', '00000000-0000-0000-0000-000000147716', 'steward',
   NULL, '00000000-0000-0000-0000-000000147120')
) AS g(person_id, auth_id, role_name, club_id, show_id)
JOIN public.roles r ON r.name = g.role_name;

CREATE FUNCTION pg_temp.act_as(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text, true);
END;
$$;

-- label -> auth uid. 'subject' is the caller whose role set the cases change
-- (the secretary of the show's club); the rest must never move.
CREATE TEMP TABLE callers (label text PRIMARY KEY, auth_id uuid) ON COMMIT DROP;
INSERT INTO callers VALUES
  ('secretary', '00000000-0000-0000-0000-000000147714'),
  ('steward',   '00000000-0000-0000-0000-000000147716'),
  ('exhibitor', '00000000-0000-0000-0000-000000147711');

-- {rows, min_updated_at, changed_since(since)} for one caller, reading the
-- replication wrapper exactly as the client does.
CREATE FUNCTION pg_temp.probe(p_label text, p_since timestamptz,
                              OUT n int, OUT min_ts timestamptz, OUT fn boolean)
LANGUAGE plpgsql AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM callers WHERE label = p_label;
  PERFORM pg_temp.act_as(c.auth_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), min(v.updated_at) INTO n, min_ts
  FROM public.view_authenticated_entry_results_replication v
  WHERE v.show_id = '00000000-0000-0000-0000-000000147120';
  SELECT q.changed INTO fn
  FROM public.entry_results_changed_since('00000000-0000-0000-0000-000000147120', p_since) q;
  EXECUTE 'RESET ROLE';
END;
$$;

CREATE FUNCTION pg_temp.backdate() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE public.entries SET updated_at = '2000-01-01'
  WHERE show_id = '00000000-0000-0000-0000-000000147120';
  UPDATE public.classes SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000147140';
  UPDATE public.trials SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000147130';
  UPDATE public.shows SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000147120';
  UPDATE public.show_visibility_settings SET updated_at = '2000-01-01'
  WHERE show_id = '00000000-0000-0000-0000-000000147120';
  UPDATE public.trial_visibility_overrides SET updated_at = '2000-01-01'
  WHERE trial_id = '00000000-0000-0000-0000-000000147130';
  UPDATE public.class_visibility_overrides SET updated_at = '2000-01-01'
  WHERE class_id = '00000000-0000-0000-0000-000000147140';
  UPDATE public.dogs SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-00000014715_';
  UPDATE public.people SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-0000001476__';
  UPDATE public.exhibitor_profiles SET updated_at = '2000-01-01'
  WHERE auth_user_id::text LIKE '00000000-0000-0000-0000-0000001477__';
  EXECUTE 'UPDATE private.results_privacy_epoch SET updated_at = ''2000-01-01''';
  EXECUTE 'UPDATE private.user_access_epoch SET changed_at = ''2000-01-01''';
  SET LOCAL session_replication_role = origin;
END;
$$;

-- p_moved: the subject's rows are at/after p_floor and changed_since is TRUE.
-- Always: steward and exhibitor rows stay at 2000 and changed_since FALSE.
CREATE FUNCTION pg_temp.assert_case(p_case text, p_moved boolean, p_floor timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t constant timestamptz := '2001-01-01';
  r record;
BEGIN
  SELECT * INTO r FROM pg_temp.probe('secretary', t);
  IF r.n < 2 THEN
    RAISE EXCEPTION 'FAIL [%] control: secretary reads % rows, want 2', p_case, r.n;
  END IF;
  IF p_moved THEN
    IF r.min_ts < p_floor OR r.fn IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL [%] secretary rows did not move: min=% floor=% changed=%',
        p_case, r.min_ts, p_floor, r.fn;
    END IF;
  ELSIF r.min_ts >= t OR r.fn IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL [%] baseline: secretary min=% changed=% (want 2000, false)',
      p_case, r.min_ts, r.fn;
  END IF;
  FOR r IN SELECT c.label, (pg_temp.probe(c.label, t)).* FROM callers c WHERE c.label <> 'secretary' LOOP
    IF r.n < 1 THEN
      RAISE EXCEPTION 'FAIL [%] control: % reads no rows', p_case, r.label;
    END IF;
    IF r.min_ts >= t OR r.fn IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'FAIL [%] % must not move: min=% changed=%', p_case, r.label, r.min_ts, r.fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS [%]', p_case;
END;
$$;

-- 1. ACLs.
DO $$
BEGIN
  IF has_table_privilege('anon', 'private.user_access_epoch', 'SELECT')
     OR has_table_privilege('authenticated', 'private.user_access_epoch', 'SELECT')
     OR has_table_privilege('anon', 'private.user_access_epoch', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL 1 user_access_epoch is reachable by anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'private.entry_results_caller_access_epoch()', 'EXECUTE')
     OR has_function_privilege('anon', 'private.touch_user_access_epoch()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.touch_user_access_epoch()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 1 an epoch function is executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'private.entry_results_caller_access_epoch()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 1 authenticated cannot execute the epoch reader the view calls';
  END IF;
  RAISE NOTICE 'PASS 1 epoch table and functions are closed to anon and authenticated';
END;
$$;

-- 5. Row set and masking identical to the view without the epoch term. The temp
-- copy is the CURRENT definition with the one MYK9-1476 term nulled.
DO $$
DECLARE
  def text := pg_get_viewdef('public.view_authenticated_entry_results'::regclass);
  old_def text;
  c record;
  h_new text;
  h_old text;
  n_new int;
BEGIN
  old_def := replace(def, 'private.entry_results_caller_access_epoch()', 'NULL::timestamptz');
  IF old_def = def THEN
    RAISE EXCEPTION 'FAIL 5 control: the view does not read the caller access epoch';
  END IF;
  EXECUTE 'CREATE TEMP VIEW old_results AS ' || rtrim(old_def, '; ' || chr(10));
  FOR c IN SELECT * FROM callers LOOP
    PERFORM pg_temp.act_as(c.auth_id);
    SELECT count(*), md5(string_agg((to_jsonb(v) - 'updated_at')::text, '|' ORDER BY v.id))
      INTO n_new, h_new FROM public.view_authenticated_entry_results v;
    SELECT md5(string_agg((to_jsonb(v) - 'updated_at')::text, '|' ORDER BY v.id))
      INTO h_old FROM old_results v;
    IF n_new < 1 OR h_new IS DISTINCT FROM h_old THEN
      RAISE EXCEPTION 'FAIL 5 % rows=% new=% old=%', c.label, n_new, h_new, h_old;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 5 visible rows and masked columns identical for secretary, steward, exhibitor';
END;
$$;

-- 2/3/4. One case per way the caller's role set changes.
SELECT pg_temp.backdate();
SELECT pg_temp.assert_case('baseline: nothing moved', false, NULL);

-- grant: a second role for the secretary (the subject), by insert.
SELECT pg_temp.backdate();
INSERT INTO public.user_roles (id, user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000147901', '00000000-0000-0000-0000-000000147614', r.id, NULL,
       '00000000-0000-0000-0000-000000147120', true, '00000000-0000-0000-0000-000000147714'
FROM public.roles r WHERE r.name = 'steward';
SELECT pg_temp.assert_case('grant', true, now());

-- deactivation: update only.
SELECT pg_temp.backdate();
UPDATE public.user_roles SET is_active = false WHERE id = '00000000-0000-0000-0000-000000147901';
SELECT pg_temp.assert_case('deactivation', true, now());

-- hard delete: the row is gone, so no max(updated_at) could see it.
SELECT pg_temp.backdate();
DELETE FROM public.user_roles WHERE id = '00000000-0000-0000-0000-000000147901';
SELECT pg_temp.assert_case('hard delete', true, now());

-- expiry: a row that expired 3 days ago, inserted with triggers bypassed, so the
-- ONLY signal is expires_at itself.
DO $$
DECLARE
  exp constant timestamptz := now() - interval '3 days';
  r record;
BEGIN
  PERFORM pg_temp.backdate();
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.user_roles (id, user_id, role_id, club_id, show_id, is_active, auth_user_id, expires_at)
  SELECT '00000000-0000-0000-0000-000000147902', '00000000-0000-0000-0000-000000147614', r2.id, NULL,
         '00000000-0000-0000-0000-000000147120', true, '00000000-0000-0000-0000-000000147714', exp
  FROM public.roles r2 WHERE r2.name = 'steward';
  SET LOCAL session_replication_role = origin;
  PERFORM pg_temp.assert_case('expiry (no write)', true, exp);
  -- a watermark taken after the expiry reads FALSE again
  SELECT * INTO r FROM pg_temp.probe('secretary', exp + interval '1 second');
  IF r.fn IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 3 watermark after expires_at must read FALSE, got %', r.fn;
  END IF;
  RAISE NOTICE 'PASS 3 expiry moves rows to expires_at and not past it';
END;
$$;

ROLLBACK;
