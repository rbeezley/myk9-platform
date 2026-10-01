-- CRUD standard Phase 2 (migration 20261001233700): delete_preview, the read the
-- shared delete dialog makes before Delete is enabled.
--
-- Properties asserted here:
--   * every scope's counts (trials, classes, entries, shows, dogs) and its paid,
--     scored and blocking counts, on a fixture with a paid entry, a scored entry
--     and an entry deleted earlier on its own (which must not count);
--   * PARITY: the counts equal the rows the matching soft_delete_<scope> then
--     actually stamps, for a trial (secretary) and a show (site admin override);
--   * each scope refuses exactly as its delete RPC does: 42501 for a caller the
--     delete would refuse, the RPC's not-found code for a missing row, and 22023
--     for an unknown scope;
--   * anon and PUBLIC cannot execute it; authenticated can.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People first, then auth.users; handle_new_user() adopts each row.
--   922101 secretary (club 922021)   922102 outsider (no roles)
--   922103 site admin                922104 exhibitor (owns the dogs)
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000922011', NULL, 'MYK9-922', 'Secretary', 'myk9922-sec@example.test'),
  ('00000000-0000-0000-0000-000000922012', NULL, 'MYK9-922', 'Outsider', 'myk9922-out@example.test'),
  ('00000000-0000-0000-0000-000000922013', NULL, 'MYK9-922', 'Admin', 'myk9922-adm@example.test'),
  ('00000000-0000-0000-0000-000000922014', NULL, 'MYK9-922', 'Exhibitor', 'myk9922-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000922101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9922-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000922102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9922-out@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000922103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9922-adm@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000922104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9922-exh@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000000922021', 'MYK9-922 Club With Shows', now()),
  ('00000000-0000-0000-0000-000000922022', 'MYK9-922 Empty Club', now());

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
SELECT '00000000-0000-0000-0000-000000922011', r.id, '00000000-0000-0000-0000-000000922021', NULL, true, now(),
       '00000000-0000-0000-0000-000000922011', '00000000-0000-0000-0000-000000922101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (user_id, auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000922013', '00000000-0000-0000-0000-000000922103', r.id, true
FROM public.roles r WHERE r.name = 'site_admin';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people WHERE id IN (
        '00000000-0000-0000-0000-000000922011', '00000000-0000-0000-0000-000000922012',
        '00000000-0000-0000-0000-000000922013', '00000000-0000-0000-0000-000000922014')
      AND auth_user_id IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user() did not adopt all four people rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000922103' AND r.name = 'site_admin'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000922101' AND r.name = 'secretary'
  ) THEN
    RAISE EXCEPTION 'FIXTURE the secretary or site_admin role row was not created';
  END IF;
END;
$$;

-- SH1 holds T1 (K1, K2) and T2 (K3).
--   E1 K1 pending   E2 K1 PAID   E3 K2 SCORED   E4 K3 pending
--   E5 K3 deleted on its own earlier (never counted)
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000000922031', 'MYK9-922 Show', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000000922021');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000922041', '00000000-0000-0000-0000-000000922031', 'MYK9-922 Trial 1', current_date),
  ('00000000-0000-0000-0000-000000922042', '00000000-0000-0000-0000-000000922031', 'MYK9-922 Trial 2', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000922051', '00000000-0000-0000-0000-000000922041', 'MYK9-922 K1'),
  ('00000000-0000-0000-0000-000000922052', '00000000-0000-0000-0000-000000922041', 'MYK9-922 K2'),
  ('00000000-0000-0000-0000-000000922053', '00000000-0000-0000-0000-000000922042', 'MYK9-922 K3');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT ('00000000-0000-0000-0000-00000092206' || n)::uuid, 'MYK9-922 Dog ' || n, 'Border Collie',
       '00000000-0000-0000-0000-000000922014'
FROM generate_series(1, 6) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT ('00000000-0000-0000-0000-00000092206' || n)::uuid, 'AKC', 'SW9922' || lpad(n::text, 2, '0'), 'MYK9-922 Dog ' || n
FROM generate_series(1, 6) AS n;

INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, is_scored, result_status)
VALUES
  ('00000000-0000-0000-0000-000000922081', '00000000-0000-0000-0000-000000922051', '00000000-0000-0000-0000-000000922041', '00000000-0000-0000-0000-000000922031', '00000000-0000-0000-0000-000000922061', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000922082', '00000000-0000-0000-0000-000000922051', '00000000-0000-0000-0000-000000922041', '00000000-0000-0000-0000-000000922031', '00000000-0000-0000-0000-000000922062', 'paid', false, 'pending'),
  ('00000000-0000-0000-0000-000000922083', '00000000-0000-0000-0000-000000922052', '00000000-0000-0000-0000-000000922041', '00000000-0000-0000-0000-000000922031', '00000000-0000-0000-0000-000000922063', 'pending', true, 'qualified'),
  ('00000000-0000-0000-0000-000000922084', '00000000-0000-0000-0000-000000922053', '00000000-0000-0000-0000-000000922042', '00000000-0000-0000-0000-000000922031', '00000000-0000-0000-0000-000000922064', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000922085', '00000000-0000-0000-0000-000000922053', '00000000-0000-0000-0000-000000922042', '00000000-0000-0000-0000-000000922031', '00000000-0000-0000-0000-000000922065', 'pending', false, 'pending');

-- E5 was deleted on its own an hour ago (as postgres: the direct-write block lets it).
UPDATE public.entries
SET deleted_at = now() - interval '1 hour'
WHERE id = '00000000-0000-0000-0000-000000922085';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE id::text LIKE '00000000-0000-0000-0000-0000009220%' AND deleted_at IS NULL) <> 4
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000922082' AND payment_status = 'paid')
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000922083' AND is_scored) THEN
    RAISE EXCEPTION 'FIXTURE the four live entries (one paid, one scored) were not seeded';
  END IF;
END;
$$;

-- A preview is compared field by field; a helper keeps every assertion one line.
CREATE TEMP TABLE expect_preview (label text, got jsonb, want jsonb) ON COMMIT DROP;
GRANT ALL ON expect_preview TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Grants: anon and PUBLIC cannot execute; authenticated can.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.delete_preview(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute delete_preview';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.delete_preview(text, uuid)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute delete_preview';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.delete_preview(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute delete_preview';
  END IF;
  RAISE NOTICE 'PASS delete_preview is executable by authenticated only (not anon, not PUBLIC)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The secretary: show, trial, class, entry counts.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922101","role":"authenticated"}', true);

INSERT INTO expect_preview VALUES
  ('show SH1', public.delete_preview('show', '00000000-0000-0000-0000-000000922031'),
   '{"trials":2,"classes":3,"entries":4,"paid":1,"scored":1,"blocking":2}'),
  ('trial T1', public.delete_preview('trial', '00000000-0000-0000-0000-000000922041'),
   '{"trials":0,"classes":2,"entries":3,"paid":1,"scored":1,"blocking":2}'),
  ('trial T2', public.delete_preview('trial', '00000000-0000-0000-0000-000000922042'),
   '{"classes":1,"entries":1,"paid":0,"scored":0,"blocking":0}'),
  ('class K1', public.delete_preview('class', '00000000-0000-0000-0000-000000922051'),
   '{"classes":0,"entries":2,"paid":1,"scored":0,"blocking":1}'),
  ('class K2', public.delete_preview('class', '00000000-0000-0000-0000-000000922052'),
   '{"entries":1,"paid":0,"scored":1,"blocking":1}'),
  ('class K3 (E5 deleted earlier)', public.delete_preview('class', '00000000-0000-0000-0000-000000922053'),
   '{"entries":1,"paid":0,"scored":0,"blocking":0}'),
  ('entry E1', public.delete_preview('entry', '00000000-0000-0000-0000-000000922081'),
   '{"entries":0,"paid":0,"scored":0,"blocking":0}'),
  ('entry E2', public.delete_preview('entry', '00000000-0000-0000-0000-000000922082'),
   '{"entries":0,"paid":1,"scored":0,"blocking":1}'),
  ('entry E3', public.delete_preview('entry', '00000000-0000-0000-0000-000000922083'),
   '{"paid":0,"scored":1,"blocking":1}');

DO $$
BEGIN
  BEGIN
    PERFORM public.delete_preview('club', '00000000-0000-0000-0000-000000922021');
    RAISE EXCEPTION 'FAIL a secretary previewed a club delete';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a club preview is refused for a secretary, as soft_delete_club is (42501)';
  END;

  BEGIN
    PERFORM public.delete_preview('entry', '00000000-0000-0000-0000-000000922085');
    RAISE EXCEPTION 'FAIL an already deleted entry was previewed';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS an already deleted entry reads as not found (42501, as soft_delete_entry)';
  END;

  BEGIN
    PERFORM public.delete_preview('banana', '00000000-0000-0000-0000-000000922031');
    RAISE EXCEPTION 'FAIL an unknown scope was accepted';
  EXCEPTION WHEN sqlstate '22023' THEN
    RAISE NOTICE 'PASS an unknown scope is refused (22023)';
  END;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. The outsider: every scope the delete would refuse, the preview refuses.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922102","role":"authenticated"}', true);

DO $$
DECLARE
  v_scope text;
  v_id uuid;
BEGIN
  FOR v_scope, v_id IN
    VALUES ('show', '00000000-0000-0000-0000-000000922031'::uuid),
           ('trial', '00000000-0000-0000-0000-000000922041'::uuid),
           ('class', '00000000-0000-0000-0000-000000922051'::uuid),
           ('entry', '00000000-0000-0000-0000-000000922081'::uuid),
           ('dog', '00000000-0000-0000-0000-000000922061'::uuid),
           ('person', '00000000-0000-0000-0000-000000922014'::uuid),
           ('club', '00000000-0000-0000-0000-000000922021'::uuid)
  LOOP
    BEGIN
      PERFORM public.delete_preview(v_scope, v_id);
      RAISE EXCEPTION 'FAIL an outsider previewed a % delete', v_scope;
    EXCEPTION WHEN sqlstate '42501' THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS an outsider is refused (42501) on all seven scopes';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. The dogs' owner: dog counts, and her own person preview names her dogs.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922104","role":"authenticated"}', true);

INSERT INTO expect_preview VALUES
  ('dog D2 (paid entry)', public.delete_preview('dog', '00000000-0000-0000-0000-000000922062'),
   '{"entries":1,"paid":1,"scored":0,"blocking":1}'),
  ('dog D1 (pending entry)', public.delete_preview('dog', '00000000-0000-0000-0000-000000922061'),
   '{"entries":1,"paid":0,"scored":0,"blocking":0}'),
  ('dog D5 (only a deleted entry)', public.delete_preview('dog', '00000000-0000-0000-0000-000000922065'),
   '{"entries":0,"blocking":0}'),
  ('person self', public.delete_preview('person', '00000000-0000-0000-0000-000000922014'),
   '{"dogs":6,"blocking":6}');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. The site admin: club and person scopes.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922103","role":"authenticated"}', true);

INSERT INTO expect_preview VALUES
  ('club with a show', public.delete_preview('club', '00000000-0000-0000-0000-000000922021'),
   '{"shows":1,"blocking":1}'),
  ('empty club', public.delete_preview('club', '00000000-0000-0000-0000-000000922022'),
   '{"shows":0,"blocking":0}'),
  ('person without dogs', public.delete_preview('person', '00000000-0000-0000-0000-000000922012'),
   '{"dogs":0,"blocking":0}');

DO $$
BEGIN
  BEGIN
    PERFORM public.delete_preview('club', '00000000-0000-0000-0000-0000009220ff');
    RAISE EXCEPTION 'FAIL a missing club was previewed';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    RAISE NOTICE 'PASS a missing club reads as not found (P0002, as soft_delete_club)';
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  r record;
  k text;
BEGIN
  FOR r IN SELECT * FROM expect_preview LOOP
    FOR k IN SELECT jsonb_object_keys(r.want) LOOP
      IF (r.got -> k) IS DISTINCT FROM (r.want -> k) THEN
        RAISE EXCEPTION 'FAIL % preview: % is %, expected %', r.label, k, r.got -> k, r.want -> k;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS every preview count matches its fixture (% previews)', (SELECT count(*) FROM expect_preview);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. PARITY: the counts are the rows the delete then stamps.
-- ---------------------------------------------------------------------------
TRUNCATE expect_preview;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922101","role":"authenticated"}', true);
INSERT INTO expect_preview VALUES
  ('trial T2 before delete', public.delete_preview('trial', '00000000-0000-0000-0000-000000922042'), NULL);
SELECT public.soft_delete_trial('00000000-0000-0000-0000-000000922042');
RESET ROLE;

DO $$
DECLARE
  v_stamp timestamptz;
  v_preview jsonb;
BEGIN
  SELECT deleted_at INTO v_stamp FROM public.trials WHERE id = '00000000-0000-0000-0000-000000922042';
  SELECT got INTO v_preview FROM expect_preview WHERE label = 'trial T2 before delete';
  IF (SELECT count(*) FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-000000922042' AND deleted_at = v_stamp)
       <> (v_preview ->> 'classes')::integer
     OR (SELECT count(*) FROM public.entries WHERE trial_id = '00000000-0000-0000-0000-000000922042' AND deleted_at = v_stamp)
       <> (v_preview ->> 'entries')::integer THEN
    RAISE EXCEPTION 'FAIL trial preview % disagrees with what soft_delete_trial stamped', v_preview;
  END IF;
  RAISE NOTICE 'PASS the trial preview equals the rows soft_delete_trial stamped';
END;
$$;

-- Age T2's cascade so the show delete's stamp is distinct from it (one now() per
-- transaction), then preview and delete the whole show as the site admin.
UPDATE public.trials SET deleted_at = deleted_at - interval '1 hour'
WHERE id = '00000000-0000-0000-0000-000000922042';
UPDATE public.classes SET deleted_at = deleted_at - interval '1 hour'
WHERE trial_id = '00000000-0000-0000-0000-000000922042';
UPDATE public.entries SET deleted_at = deleted_at - interval '1 hour'
WHERE id = '00000000-0000-0000-0000-000000922084';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000922103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000922103","role":"authenticated"}', true);
INSERT INTO expect_preview VALUES
  ('show SH1 before delete', public.delete_preview('show', '00000000-0000-0000-0000-000000922031'), NULL);
SELECT public.soft_delete_show('00000000-0000-0000-0000-000000922031', true);
RESET ROLE;

DO $$
DECLARE
  v_stamp timestamptz;
  v_preview jsonb;
BEGIN
  SELECT deleted_at INTO v_stamp FROM public.shows WHERE id = '00000000-0000-0000-0000-000000922031';
  SELECT got INTO v_preview FROM expect_preview WHERE label = 'show SH1 before delete';
  IF (v_preview ->> 'trials')::integer <> 1 OR (v_preview ->> 'entries')::integer <> 3 THEN
    RAISE EXCEPTION 'FAIL the show preview still counted the deleted trial: %', v_preview;
  END IF;
  IF (SELECT count(*) FROM public.trials WHERE show_id = '00000000-0000-0000-0000-000000922031' AND deleted_at = v_stamp)
       <> (v_preview ->> 'trials')::integer
     OR (SELECT count(*) FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
         WHERE t.show_id = '00000000-0000-0000-0000-000000922031' AND c.deleted_at = v_stamp)
       <> (v_preview ->> 'classes')::integer
     OR (SELECT count(*) FROM public.entries WHERE show_id = '00000000-0000-0000-0000-000000922031' AND deleted_at = v_stamp)
       <> (v_preview ->> 'entries')::integer THEN
    RAISE EXCEPTION 'FAIL show preview % disagrees with what soft_delete_show stamped', v_preview;
  END IF;
  RAISE NOTICE 'PASS the show preview equals the rows soft_delete_show stamped';
END;
$$;

ROLLBACK;
