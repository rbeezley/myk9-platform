-- MYK9-1369 (migration 20261028213700): public.entry_results_changed_since.
--
-- Properties asserted:
--   1. anon (and PUBLIC) cannot EXECUTE it; authenticated can;
--   2. for every caller the view admits rows to (secretary, assigned judge,
--      steward, ringside judge passcode, an exhibitor tied to an entry, a show
--      exhibitor not tied to that entry): with nothing changed after T it is
--      FALSE; after touching EACH input of the view's updated_at GREATEST it is
--      TRUE, and it is never FALSE while the replication view has a delta for
--      that caller (no false negative);
--   3. a caller with no access to the show (an outsider, another club's
--      secretary, anon-style ringside claim for another show) gets TRUE both
--      before and after a change: the boolean carries no information;
--   4. NULL arguments and an unknown show return TRUE;
--   5. results stay hidden: the function returns only a boolean, and an
--      unreleased/private result is still NULL in the view for the same caller.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.
-- Fixtures: people 1369xx, auth uids 1369 1xx (deliberately different).

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000136801', 'site_admin', 'MYK9-1369 fixture', true),
  ('00000000-0000-0000-0000-000000136802', 'secretary', 'MYK9-1369 fixture', true),
  ('00000000-0000-0000-0000-000000136805', 'steward', 'MYK9-1369 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000136001', 'MYK9-1369 Club'),
       ('00000000-0000-0000-0000-000000136002', 'MYK9-1369 Other Club');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000136011', NULL, 'Owner', 'E1', 'myk91369-e1@example.test'),
  ('00000000-0000-0000-0000-000000136012', NULL, 'Other', 'E2', 'myk91369-e2@example.test'),
  ('00000000-0000-0000-0000-000000136013', NULL, 'Handler', 'H', 'myk91369-h@example.test'),
  ('00000000-0000-0000-0000-000000136014', NULL, 'Secretary', 'S', 'myk91369-s@example.test'),
  ('00000000-0000-0000-0000-000000136015', NULL, 'Judge', 'J', 'myk91369-j@example.test'),
  ('00000000-0000-0000-0000-000000136016', NULL, 'Steward', 'ST', 'myk91369-st@example.test'),
  ('00000000-0000-0000-0000-000000136017', NULL, 'Outsider', 'OUT', 'myk91369-out@example.test'),
  ('00000000-0000-0000-0000-000000136018', NULL, 'OtherSec', 'OS', 'myk91369-os@example.test'),
  ('00000000-0000-0000-0000-000000136019', NULL, 'CoOwner', 'CO', 'myk91369-co@example.test'),
  ('00000000-0000-0000-0000-000000136022', NULL, 'CoWithdrawn', 'CW', 'myk91369-cw@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000136111', 'myk91369-e1@example.test'),
  ('00000000-0000-0000-0000-000000136112', 'myk91369-e2@example.test'),
  ('00000000-0000-0000-0000-000000136113', 'myk91369-h@example.test'),
  ('00000000-0000-0000-0000-000000136114', 'myk91369-s@example.test'),
  ('00000000-0000-0000-0000-000000136115', 'myk91369-j@example.test'),
  ('00000000-0000-0000-0000-000000136116', 'myk91369-st@example.test'),
  ('00000000-0000-0000-0000-000000136117', 'myk91369-out@example.test'),
  ('00000000-0000-0000-0000-000000136118', 'myk91369-os@example.test'),
  ('00000000-0000-0000-0000-000000136119', 'myk91369-co@example.test'),
  ('00000000-0000-0000-0000-000000136122', 'myk91369-cw@example.test')
) AS u(id, email);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000136020', 'MYK9-1369 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000136001', 'published');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000136030', '00000000-0000-0000-0000-000000136020',
        'MYK9-1369 Trial', current_date);

-- Manual release everywhere: results are hidden from non-staff until released.
INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing, time_timing, faults_timing
) VALUES ('00000000-0000-0000-0000-000000136020', 'review',
          'manual_release', 'manual_release', 'manual_release', 'manual_release');

INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000000136040', '00000000-0000-0000-0000-000000136030',
        'Container Novice', 'upcoming');

INSERT INTO public.trial_visibility_overrides (trial_id, preset)
VALUES ('00000000-0000-0000-0000-000000136030', 'review');
INSERT INTO public.class_visibility_overrides (class_id, preset)
VALUES ('00000000-0000-0000-0000-000000136040', 'review');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
VALUES
  ('00000000-0000-0000-0000-000000136051', 'Alpha Registered', 'Alpha', 'Beagle',
   '00000000-0000-0000-0000-000000136011', '00000000-0000-0000-0000-000000136019'),
  ('00000000-0000-0000-0000-000000136052', 'Bravo Registered', 'Bravo', 'Beagle',
   '00000000-0000-0000-0000-000000136012', NULL),
  ('00000000-0000-0000-0000-000000136053', 'Charlie Registered', 'Charlie', 'Beagle',
   '00000000-0000-0000-0000-000000136012', '00000000-0000-0000-0000-000000136022');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR1369' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-00000013605_';

-- A: owner E1, co-owner CO, handled by H.  B: E2's dog.
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, payment_status,
  entry_fee, armband, run_order, is_scored, result_status, search_time_seconds,
  total_faults, total_score, final_placement
) VALUES
  ('00000000-0000-0000-0000-000000136061', '00000000-0000-0000-0000-000000136051',
   '00000000-0000-0000-0000-000000136040', '00000000-0000-0000-0000-000000136020',
   '00000000-0000-0000-0000-000000136030', '00000000-0000-0000-0000-000000136013',
   'confirmed', 'paid', 25, '101', 1, true, 'qualified', 30.5, 0, 100, 1),
  ('00000000-0000-0000-0000-000000136062', '00000000-0000-0000-0000-000000136052',
   '00000000-0000-0000-0000-000000136040', '00000000-0000-0000-0000-000000136020',
   '00000000-0000-0000-0000-000000136030', '00000000-0000-0000-0000-000000136012',
   'confirmed', 'paid', 25, '102', 2, true, 'qualified', 41.25, 0, 100, 2),
  -- C: withdrawn, so its co-owner CW is no show exhibitor (is_show_exhibitor
  -- needs a live, non-withdrawn entry) and the view admits CW to nothing.
  ('00000000-0000-0000-0000-000000136063', '00000000-0000-0000-0000-000000136053',
   '00000000-0000-0000-0000-000000136040', '00000000-0000-0000-0000-000000136020',
   '00000000-0000-0000-0000-000000136030', '00000000-0000-0000-0000-000000136012',
   'withdrawn', 'paid', 25, '103', 3, false, NULL, NULL, NULL, NULL, NULL);

INSERT INTO public.judge_assignments (id, person_id, show_id, trial_id, class_id, status)
VALUES ('00000000-0000-0000-0000-000000136071', '00000000-0000-0000-0000-000000136015',
        '00000000-0000-0000-0000-000000136020', '00000000-0000-0000-0000-000000136030',
        '00000000-0000-0000-0000-000000136040', 'confirmed');

INSERT INTO public.show_passcodes (id, show_id, role, passcode_hash, passcode_ciphertext, created_at)
VALUES ('00000000-0000-0000-0000-000000136081', '00000000-0000-0000-0000-000000136020',
        'judge', 'myk9-1369-fixture-hash', NULL, '2026-10-04 15:00:00+00'::timestamptz);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, g.show_id::uuid, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000136014', '00000000-0000-0000-0000-000000136114', 'secretary',
   '00000000-0000-0000-0000-000000136001', NULL),
  ('00000000-0000-0000-0000-000000136018', '00000000-0000-0000-0000-000000136118', 'secretary',
   '00000000-0000-0000-0000-000000136002', NULL),
  ('00000000-0000-0000-0000-000000136016', '00000000-0000-0000-0000-000000136116', 'steward',
   NULL, '00000000-0000-0000-0000-000000136020')
) AS g(person_id, auth_id, role_name, club_id, show_id)
JOIN public.roles r ON r.name = g.role_name;

-- Act as an account (NULL = anon). Claims are transaction-local.
CREATE FUNCTION pg_temp.act_as(p_auth uuid, p_app_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_auth IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', p_auth, 'role', 'authenticated',
                         'app_metadata', p_app_metadata)::text, true);
  END IF;
END;
$$;

-- The callers the view admits rows to, then the ones it admits nothing to.
CREATE TEMP TABLE callers (label text PRIMARY KEY, auth_id uuid, app_metadata jsonb, authorized boolean)
ON COMMIT DROP;
INSERT INTO callers VALUES
  ('secretary',            '00000000-0000-0000-0000-000000136114', '{}', true),
  ('assigned judge',       '00000000-0000-0000-0000-000000136115', '{}', true),
  ('steward',              '00000000-0000-0000-0000-000000136116', '{}', true),
  ('exhibitor (tied)',     '00000000-0000-0000-0000-000000136111', '{}', true),
  ('co-owner (tied)',      '00000000-0000-0000-0000-000000136119', '{}', true),
  ('handler (tied)',       '00000000-0000-0000-0000-000000136113', '{}', true),
  ('show exhibitor (not tied to A)', '00000000-0000-0000-0000-000000136112', '{}', true),
  ('ringside judge passcode', '00000000-0000-0000-0000-000000136199',
   '{"kind":"ringside_passcode","show_id":"00000000-0000-0000-0000-000000136020","ringside_role":"judge","passcode_generation":"2026-10-04T15:00:00+00:00"}', true),
  ('outsider',             '00000000-0000-0000-0000-000000136117', '{}', false),
  ('co-owner of a withdrawn entry only', '00000000-0000-0000-0000-000000136122', '{}', false),
  ('other club secretary', '00000000-0000-0000-0000-000000136118', '{}', false),
  ('ringside claim, other show', '00000000-0000-0000-0000-000000136198',
   '{"kind":"ringside_passcode","show_id":"00000000-0000-0000-0000-000000136999","ringside_role":"judge","passcode_generation":"2026-10-04T15:00:00+00:00"}', false);

-- fn = the function's answer; delta = whether the replication view has a row
-- newer than p_since for this caller. Run as that caller, then back.
CREATE FUNCTION pg_temp.probe(p_label text, p_since timestamptz,
                              OUT fn boolean, OUT delta boolean, OUT server_now timestamptz)
LANGUAGE plpgsql AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM callers WHERE label = p_label;
  PERFORM pg_temp.act_as(c.auth_id, c.app_metadata);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.changed, q.server_now INTO fn, server_now
  FROM public.entry_results_changed_since('00000000-0000-0000-0000-000000136020', p_since) q;
  delta := EXISTS (
    SELECT 1 FROM public.view_authenticated_entry_results_replication
    WHERE show_id = '00000000-0000-0000-0000-000000136020' AND updated_at > p_since
  );
  EXECUTE 'RESET ROLE';
END;
$$;

-- Backdate every timestamp the view's updated_at reads, triggers bypassed.
CREATE FUNCTION pg_temp.backdate() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE public.entries SET updated_at = '2000-01-01'
  WHERE show_id = '00000000-0000-0000-0000-000000136020';
  UPDATE public.classes SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000136040';
  UPDATE public.trials SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000136030';
  UPDATE public.shows SET updated_at = '2000-01-01'
  WHERE id = '00000000-0000-0000-0000-000000136020';
  UPDATE public.show_visibility_settings SET updated_at = '2000-01-01'
  WHERE show_id = '00000000-0000-0000-0000-000000136020';
  UPDATE public.trial_visibility_overrides SET updated_at = '2000-01-01'
  WHERE trial_id = '00000000-0000-0000-0000-000000136030';
  UPDATE public.class_visibility_overrides SET updated_at = '2000-01-01'
  WHERE class_id = '00000000-0000-0000-0000-000000136040';
  UPDATE public.dogs SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-00000013605_';
  UPDATE public.people SET updated_at = '2000-01-01'
  WHERE id::text LIKE '00000000-0000-0000-0000-0000001360__';
  UPDATE public.exhibitor_profiles SET updated_at = '2000-01-01'
  WHERE auth_user_id::text LIKE '00000000-0000-0000-0000-0000001361__';
  EXECUTE 'UPDATE private.results_privacy_epoch SET updated_at = ''2000-01-01''';
  SET LOCAL session_replication_role = origin;
END;
$$;

-- Assert, for every caller: authorized ones get the expected boolean and
-- never a false negative; unauthorized ones always get TRUE.
CREATE FUNCTION pg_temp.assert_all(p_input text, p_expect_changed boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c record;
  r record;
  t constant timestamptz := '2001-01-01';
BEGIN
  FOR c IN SELECT * FROM callers ORDER BY label LOOP
    SELECT * INTO r FROM pg_temp.probe(c.label, t);
    IF r.server_now IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'FAIL 6 [%] % server_now must be now() for every caller, got %',
        p_input, c.label, r.server_now;
    END IF;
    IF NOT c.authorized THEN
      IF r.fn IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'FAIL 3 [%] % must get TRUE (no information), got %', p_input, c.label, r.fn;
      END IF;
      IF r.delta THEN
        RAISE EXCEPTION 'FAIL 3 [%] % reads view rows it should not: delta', p_input, c.label;
      END IF;
    ELSIF p_expect_changed THEN
      IF r.fn IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'FAIL 2 [%] % got % after the input moved', p_input, c.label, r.fn;
      END IF;
    ELSE
      IF r.fn IS DISTINCT FROM false OR r.delta THEN
        RAISE EXCEPTION 'FAIL 2 [%] % baseline: fn=% delta=% (want false, false)',
          p_input, c.label, r.fn, r.delta;
      END IF;
    END IF;
    IF r.delta AND r.fn IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL 2 [%] % FALSE NEGATIVE: view delta exists, fn=%', p_input, c.label, r.fn;
    END IF;
  END LOOP;
  -- The mutation must have reached the view for the manager, or the case is vacuous.
  IF p_expect_changed AND p_input NOT LIKE '%(hidden from view)%' THEN
    SELECT * INTO r FROM pg_temp.probe('secretary', t);
    IF NOT r.delta THEN
      RAISE EXCEPTION 'FAIL 2 [%] control: the secretary''s view delta is empty, the case proves nothing',
        p_input;
    END IF;
  END IF;
  RAISE NOTICE 'PASS [%] expect_changed=%', p_input, p_expect_changed;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Grants.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.entry_results_changed_since(uuid, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 1 anon can EXECUTE entry_results_changed_since';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.entry_results_changed_since(uuid, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 1 authenticated cannot EXECUTE entry_results_changed_since';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.entry_results_changed_since(uuid, timestamptz)'::regprocedure
      AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'FAIL 1 PUBLIC holds EXECUTE on entry_results_changed_since';
  END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.entry_results_changed_since('00000000-0000-0000-0000-000000136020', now());
    RAISE EXCEPTION 'FAIL 1 anon call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS 1 anon and PUBLIC cannot execute; authenticated can';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2/3. Baseline, then one case per GREATEST input of the view's updated_at.
-- ---------------------------------------------------------------------------
SELECT pg_temp.backdate();
SELECT pg_temp.assert_all('baseline: nothing moved', false);

-- e: an entry of the show
SELECT pg_temp.backdate();
UPDATE public.entries SET armband = '901' WHERE id = '00000000-0000-0000-0000-000000136062';
SELECT pg_temp.assert_all('entry updated', true);

-- e: an entry soft-deleted (any deleted state counts)
SELECT pg_temp.backdate();
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000136061';
SELECT pg_temp.assert_all('entry soft-deleted', true);
UPDATE public.entries SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-000000136061';

-- c: the class
SELECT pg_temp.backdate();
UPDATE public.classes SET name = 'Container Novice (edited)'
WHERE id = '00000000-0000-0000-0000-000000136040';
SELECT pg_temp.assert_all('class updated', true);

-- held_trial: the trial
SELECT pg_temp.backdate();
UPDATE public.trials SET name = 'MYK9-1369 Trial (edited)'
WHERE id = '00000000-0000-0000-0000-000000136030';
SELECT pg_temp.assert_all('trial updated', true);

-- sh: the show
SELECT pg_temp.backdate();
UPDATE public.shows SET name = 'MYK9-1369 Show (edited)'
WHERE id = '00000000-0000-0000-0000-000000136020';
SELECT pg_temp.assert_all('show updated', true);

-- show_vis
SELECT pg_temp.backdate();
UPDATE public.show_visibility_settings SET results_private = true
WHERE show_id = '00000000-0000-0000-0000-000000136020';
SELECT pg_temp.assert_all('show visibility settings', true);

-- trial_vis (no updated_at trigger on the override tables: the writer stamps it)
SELECT pg_temp.backdate();
UPDATE public.trial_visibility_overrides SET placement_timing = 'class_complete', updated_at = now()
WHERE trial_id = '00000000-0000-0000-0000-000000136030';
SELECT pg_temp.assert_all('trial visibility override', true);

-- class_vis
SELECT pg_temp.backdate();
UPDATE public.class_visibility_overrides SET placement_timing = 'class_complete', updated_at = now()
WHERE class_id = '00000000-0000-0000-0000-000000136040';
SELECT pg_temp.assert_all('class visibility override', true);

-- d: a dog of the show
SELECT pg_temp.backdate();
UPDATE public.dogs SET call_name = 'Bravo2' WHERE id = '00000000-0000-0000-0000-000000136052';
SELECT pg_temp.assert_all('dog updated', true);

-- consent: the three tied roles' people rows
SELECT pg_temp.backdate();
UPDATE public.people SET first_name = 'Ownerx' WHERE id = '00000000-0000-0000-0000-000000136011';
SELECT pg_temp.assert_all('people: dog owner', true);

SELECT pg_temp.backdate();
UPDATE public.people SET first_name = 'Cox' WHERE id = '00000000-0000-0000-0000-000000136019';
SELECT pg_temp.assert_all('people: dog co-owner', true);

SELECT pg_temp.backdate();
UPDATE public.people SET first_name = 'Handlerx' WHERE id = '00000000-0000-0000-0000-000000136013';
SELECT pg_temp.assert_all('people: entry handler', true);

-- consent: the three tied roles' exhibitor_profiles rows
SELECT pg_temp.backdate();
UPDATE public.exhibitor_profiles SET results_public = true
WHERE auth_user_id = '00000000-0000-0000-0000-000000136111';
SELECT pg_temp.assert_all('exhibitor_profiles: dog owner', true);

SELECT pg_temp.backdate();
UPDATE public.exhibitor_profiles SET results_public = true
WHERE auth_user_id = '00000000-0000-0000-0000-000000136119';
SELECT pg_temp.assert_all('exhibitor_profiles: dog co-owner', true);

SELECT pg_temp.backdate();
UPDATE public.exhibitor_profiles SET results_public = true
WHERE auth_user_id = '00000000-0000-0000-0000-000000136113';
SELECT pg_temp.assert_all('exhibitor_profiles: entry handler', true);

-- epoch
SELECT pg_temp.backdate();
UPDATE private.results_privacy_epoch SET updated_at = now();
SELECT pg_temp.assert_all('privacy epoch', true);

-- A change in ANOTHER show moves nothing here.
SELECT pg_temp.backdate();
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000136021', 'MYK9-1369 Other Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000136002', 'published');
SELECT pg_temp.assert_all('baseline: another show changed', false);

-- ---------------------------------------------------------------------------
-- 4. NULL arguments and an unknown show are TRUE, for an authorized caller.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000136114');
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF (public.entry_results_changed_since(NULL, now())).changed IS DISTINCT FROM true
     OR (public.entry_results_changed_since('00000000-0000-0000-0000-000000136020', NULL)).changed IS DISTINCT FROM true
     OR (public.entry_results_changed_since('00000000-0000-0000-0000-000000136777', now())).changed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 4 NULL arguments or an unknown show must return changed = TRUE';
  END IF;
  IF (public.entry_results_changed_since(NULL, now())).server_now IS DISTINCT FROM now()
     OR (public.entry_results_changed_since('00000000-0000-0000-0000-000000136020', NULL)).server_now IS DISTINCT FROM now()
     OR (public.entry_results_changed_since('00000000-0000-0000-0000-000000136777', now())).server_now IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'FAIL 4 server_now must be filled in (= now()) for NULL arguments and an unknown show';
  END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS 4 NULL arguments and an unknown show return TRUE';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Results stay hidden: the function answers a boolean only, and the view
--    still masks the same entry for the same caller before release.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  answer boolean;
  v_type text;
BEGIN
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000136112');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO r FROM public.view_authenticated_entry_results_replication
  WHERE id = '00000000-0000-0000-0000-000000136061';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 5 fixture: the show exhibitor cannot see entry A at all';
  END IF;
  IF r.result_status IS NOT NULL OR r.final_placement IS NOT NULL
     OR r.search_time_seconds IS NOT NULL OR r.total_score IS NOT NULL
     OR r.results_private IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 5 unreleased result is visible to an unrelated exhibitor: %', row_to_json(r);
  END IF;
  SELECT q.changed INTO answer
  FROM public.entry_results_changed_since('00000000-0000-0000-0000-000000136020', '2001-01-01') q;
  v_type := pg_typeof(answer)::text;
  IF v_type <> 'boolean' OR answer IS NULL THEN
    RAISE EXCEPTION 'FAIL 5 the function must return a non-null boolean, got %', v_type;
  END IF;
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.entry_results_changed_since(uuid, timestamptz)'::regprocedure
      AND NOT p.proretset
      AND p.proargnames = ARRAY['p_show_id', 'p_since', 'changed', 'server_now']
      AND p.proargmodes = ARRAY['i', 'i', 'o', 'o']::"char"[]
  ) THEN
    RAISE EXCEPTION 'FAIL 5 the function must return exactly one row of (changed, server_now)';
  END IF;
  RAISE NOTICE 'PASS 5 results stay masked in the view and the function returns only a boolean';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Millisecond resolution: a client watermark is epoch milliseconds, so the
--    row that SET it (microseconds truncated away) must not read as newer.
-- ---------------------------------------------------------------------------
SELECT pg_temp.backdate();
DO $$
DECLARE
  same_ms boolean;
  earlier_ms boolean;
  next_ms boolean;
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE public.entries SET updated_at = '2026-01-01 00:00:00.123456+00'
  WHERE id = '00000000-0000-0000-0000-000000136061';
  SET LOCAL session_replication_role = origin;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000136114');
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.changed INTO same_ms FROM public.entry_results_changed_since(
    '00000000-0000-0000-0000-000000136020', '2026-01-01 00:00:00.123+00') q;
  SELECT q.changed INTO earlier_ms FROM public.entry_results_changed_since(
    '00000000-0000-0000-0000-000000136020', '2026-01-01 00:00:00.122+00') q;
  SELECT q.changed INTO next_ms FROM public.entry_results_changed_since(
    '00000000-0000-0000-0000-000000136020', '2026-01-01 00:00:00.124+00') q;
  EXECUTE 'RESET ROLE';
  IF same_ms IS DISTINCT FROM false OR earlier_ms IS DISTINCT FROM true OR next_ms IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 7 millisecond resolution: same ms=% (want false), earlier ms=% (want true), later ms=% (want false)',
      same_ms, earlier_ms, next_ms;
  END IF;
  RAISE NOTICE 'PASS 7 the row that set a millisecond watermark does not read as newer than it';
END;
$$;

ROLLBACK;
