-- CRUD standard Phase 1 (migration 20261001214300): the soft-delete and restore
-- RPCs for every core object, the money/scored guard, the Undo window, and the
-- direct-write block.
--
-- Properties that are not visible in the schema and are asserted here:
--   * each delete stamps ONE deleted_at across its cascade, and each restore
--     brings back exactly the rows that carry that stamp (a row deleted earlier
--     on its own stays deleted);
--   * a paid or scored entry blocks show/trial/class/entry delete with MK010 for
--     a secretary AND for a site admin who did not ask to override; only a site
--     admin passing p_override => true proceeds, and anyone else passing true is
--     refused with 42501 even when nothing blocks;
--   * the BEFORE UPDATE trigger refuses a direct deleted_at/deleted_by change
--     from `authenticated` on all seven tables (asserted by MESSAGE, so an RLS
--     42501 cannot read as a pass), while an ordinary column update, a
--     service_role write and the RPCs still work;
--   * Undo: the deleter restores within 10 minutes, not after; a different
--     non-admin never; a site admin always; a NULL deleted_by only an admin;
--   * a restore refuses (MK013) to bring a row back under a deleted parent.
--
-- Timestamps: every statement in this transaction shares one now(), so rows are
-- backdated (as postgres, which the trigger allows) to make stamps differ and to
-- age a deletion past the Undo window.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. The people row goes in first with the address, then auth.users, and
-- handle_new_user() adopts it (club_authorization_gate_test.sql).
--   915101 secretary (club 915021)   915102 outsider (no roles)
--   915103 site admin                915104 exhibitor (owns the dogs)
--   915105 exhibitor who deletes herself
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000915011', NULL, 'MYK9-915', 'Secretary', 'myk9915-sec@example.test'),
  ('00000000-0000-0000-0000-000000915012', NULL, 'MYK9-915', 'Outsider', 'myk9915-out@example.test'),
  ('00000000-0000-0000-0000-000000915013', NULL, 'MYK9-915', 'Admin', 'myk9915-adm@example.test'),
  ('00000000-0000-0000-0000-000000915014', NULL, 'MYK9-915', 'Exhibitor', 'myk9915-exh@example.test'),
  ('00000000-0000-0000-0000-000000915015', NULL, 'MYK9-915', 'Self', 'myk9915-self@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000915101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9915-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000915102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9915-out@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000915103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9915-adm@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000915104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9915-exh@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000915105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9915-self@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000000915021', 'MYK9-915 Club With Shows', now()),
  ('00000000-0000-0000-0000-000000915022', 'MYK9-915 Empty Club', now());

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
SELECT '00000000-0000-0000-0000-000000915011', r.id, '00000000-0000-0000-0000-000000915021', NULL, true, now(),
       '00000000-0000-0000-0000-000000915011', '00000000-0000-0000-0000-000000915101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (user_id, auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000915013', '00000000-0000-0000-0000-000000915103', r.id, true
FROM public.roles r WHERE r.name = 'site_admin';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people WHERE id IN (
        '00000000-0000-0000-0000-000000915011', '00000000-0000-0000-0000-000000915012',
        '00000000-0000-0000-0000-000000915013', '00000000-0000-0000-0000-000000915014',
        '00000000-0000-0000-0000-000000915015')
      AND auth_user_id IS NOT NULL) <> 5 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user() did not adopt all five people rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000915103' AND r.name = 'site_admin'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000915101' AND r.name = 'secretary'
  ) THEN
    RAISE EXCEPTION 'FIXTURE the secretary or site_admin role row was not created';
  END IF;
END;
$$;

-- SH1/T1/K1,K2: nothing paid, the secretary may delete freely.
-- SH2/T2/K3,K4: K3 holds a PAID entry, K4 a SCORED one.
-- SH3/T3/K5: the Undo-window and parent-check arena.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000000915031', 'MYK9-915 Show Free', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000000915021'),
  ('00000000-0000-0000-0000-000000915032', 'MYK9-915 Show Money', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000000915021'),
  ('00000000-0000-0000-0000-000000915033', 'MYK9-915 Show Undo', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000000915021');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000915041', '00000000-0000-0000-0000-000000915031', 'MYK9-915 Trial 1', current_date),
  ('00000000-0000-0000-0000-000000915042', '00000000-0000-0000-0000-000000915032', 'MYK9-915 Trial 2', current_date),
  ('00000000-0000-0000-0000-000000915043', '00000000-0000-0000-0000-000000915033', 'MYK9-915 Trial 3', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000915051', '00000000-0000-0000-0000-000000915041', 'MYK9-915 K1'),
  ('00000000-0000-0000-0000-000000915052', '00000000-0000-0000-0000-000000915041', 'MYK9-915 K2'),
  ('00000000-0000-0000-0000-000000915053', '00000000-0000-0000-0000-000000915042', 'MYK9-915 K3'),
  ('00000000-0000-0000-0000-000000915054', '00000000-0000-0000-0000-000000915042', 'MYK9-915 K4'),
  ('00000000-0000-0000-0000-000000915055', '00000000-0000-0000-0000-000000915043', 'MYK9-915 K5');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT ('00000000-0000-0000-0000-00000091506' || n)::uuid, 'MYK9-915 Dog ' || n, 'Border Collie',
       '00000000-0000-0000-0000-000000915014'
FROM generate_series(1, 8) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT ('00000000-0000-0000-0000-00000091506' || n)::uuid, 'AKC', 'SW9915' || lpad(n::text, 2, '0'), 'MYK9-915 Dog ' || n
FROM generate_series(1, 7) AS n;

-- E1,E2 in K1; E3 in K2; E4 PAID and E5 pending in K3; E6 SCORED in K4; E7 in K5.
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, is_scored, result_status)
VALUES
  ('00000000-0000-0000-0000-000000915081', '00000000-0000-0000-0000-000000915051', '00000000-0000-0000-0000-000000915041', '00000000-0000-0000-0000-000000915031', '00000000-0000-0000-0000-000000915061', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000915082', '00000000-0000-0000-0000-000000915051', '00000000-0000-0000-0000-000000915041', '00000000-0000-0000-0000-000000915031', '00000000-0000-0000-0000-000000915062', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000915083', '00000000-0000-0000-0000-000000915052', '00000000-0000-0000-0000-000000915041', '00000000-0000-0000-0000-000000915031', '00000000-0000-0000-0000-000000915063', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000915084', '00000000-0000-0000-0000-000000915053', '00000000-0000-0000-0000-000000915042', '00000000-0000-0000-0000-000000915032', '00000000-0000-0000-0000-000000915064', 'paid', false, 'pending'),
  ('00000000-0000-0000-0000-000000915085', '00000000-0000-0000-0000-000000915053', '00000000-0000-0000-0000-000000915042', '00000000-0000-0000-0000-000000915032', '00000000-0000-0000-0000-000000915065', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000915086', '00000000-0000-0000-0000-000000915054', '00000000-0000-0000-0000-000000915042', '00000000-0000-0000-0000-000000915032', '00000000-0000-0000-0000-000000915066', 'pending', true, 'qualified'),
  ('00000000-0000-0000-0000-000000915087', '00000000-0000-0000-0000-000000915055', '00000000-0000-0000-0000-000000915043', '00000000-0000-0000-0000-000000915033', '00000000-0000-0000-0000-000000915067', 'pending', false, 'pending');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE id::text LIKE '00000000-0000-0000-0000-0000009150%') <> 7
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915084' AND payment_status = 'paid')
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915086' AND is_scored) THEN
    RAISE EXCEPTION 'FIXTURE the seven entries (one paid, one scored) were not seeded';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. ENTRY, as the secretary: delete, Undo, and the guard.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);

DO $$
DECLARE
  v_version integer;
BEGIN
  v_version := public.soft_delete_entry('00000000-0000-0000-0000-000000915081');
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'FAIL soft_delete_entry returned no version';
  END IF;
  RAISE NOTICE 'PASS soft_delete_entry returns the new version';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000915081'
      AND deleted_at IS NOT NULL
      AND deleted_by = '00000000-0000-0000-0000-000000915101'
  ) THEN
    RAISE EXCEPTION 'FAIL soft_delete_entry did not stamp deleted_at/deleted_by = the secretary''s auth uid';
  END IF;
  RAISE NOTICE 'PASS soft_delete_entry stamps deleted_at and deleted_by = auth.uid()';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT public.restore_entry('00000000-0000-0000-0000-000000915081');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000915081' AND deleted_at IS NULL AND deleted_by IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL the deleter could not Undo within the window';
  END IF;
  RAISE NOTICE 'PASS the deleter restores an entry inside the Undo window';
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.soft_delete_entry('00000000-0000-0000-0000-000000915084');
    RAISE EXCEPTION 'FAIL a secretary deleted a PAID entry';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS a paid entry is refused for a secretary (MK010)';
  END;

  BEGIN
    PERFORM public.soft_delete_entry('00000000-0000-0000-0000-000000915086');
    RAISE EXCEPTION 'FAIL a secretary deleted a SCORED entry';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS a scored entry is refused for a secretary (MK010)';
  END;

  BEGIN
    PERFORM public.soft_delete_entry('00000000-0000-0000-0000-000000915084', true);
    RAISE EXCEPTION 'FAIL a secretary used the override';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a non-admin passing p_override => true is refused (42501)';
  END;

  -- Even when nothing blocks: the flag must not be probeable.
  BEGIN
    PERFORM public.soft_delete_entry('00000000-0000-0000-0000-000000915085', true);
    RAISE EXCEPTION 'FAIL a non-admin override was accepted on an unblocked entry';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS the override flag is refused for a non-admin even when nothing blocks';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries
      WHERE id IN ('00000000-0000-0000-0000-000000915084', '00000000-0000-0000-0000-000000915085', '00000000-0000-0000-0000-000000915086')
        AND deleted_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'FAIL a refused entry delete still tombstoned a row';
  END IF;
  RAISE NOTICE 'PASS refused entry deletes left every row live';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. CLASS cascade and the exactness of restore, with the Undo window crossed
--    by the admin. E2 is deleted on its own and aged one hour BEFORE the class
--    is deleted, so its stamp differs from the class's.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT public.soft_delete_entry('00000000-0000-0000-0000-000000915082');
RESET ROLE;

UPDATE public.entries
SET deleted_at = deleted_at - interval '1 hour'
WHERE id = '00000000-0000-0000-0000-000000915082';

SET LOCAL ROLE authenticated;
SELECT public.soft_delete_class('00000000-0000-0000-0000-000000915051');
RESET ROLE;

DO $$
DECLARE
  v_class_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_class_at FROM public.classes WHERE id = '00000000-0000-0000-0000-000000915051';
  IF v_class_at IS NULL THEN
    RAISE EXCEPTION 'FAIL soft_delete_class did not delete the class';
  END IF;
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915081') IS DISTINCT FROM v_class_at THEN
    RAISE EXCEPTION 'FAIL the class and its cascaded entry do not share one deleted_at';
  END IF;
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915082') = v_class_at THEN
    RAISE EXCEPTION 'FAIL the class delete re-stamped an entry that was already deleted';
  END IF;
  RAISE NOTICE 'PASS soft_delete_class stamps one deleted_at across class and live entries';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.restore_class('00000000-0000-0000-0000-000000915051');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.classes WHERE id = '00000000-0000-0000-0000-000000915051') IS NOT NULL
     OR (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915081') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL restore_class did not bring the class and its cascaded entry back';
  END IF;
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915082') IS NULL THEN
    RAISE EXCEPTION 'FAIL restore_class resurrected an entry deleted separately, earlier';
  END IF;
  RAISE NOTICE 'PASS restore_class restores exactly the rows sharing its deleted_at';
END;
$$;

-- E2 was deleted an hour ago: the secretary (its deleter) is past the window.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.restore_entry('00000000-0000-0000-0000-000000915082');
    RAISE EXCEPTION 'FAIL the deleter restored an entry after the Undo window';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS the deleter cannot restore after the Undo window';
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);
SELECT public.restore_entry('00000000-0000-0000-0000-000000915082');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915082') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a site admin could not restore after the Undo window';
  END IF;
  RAISE NOTICE 'PASS a site admin restores after the Undo window';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. TRIAL cascade round trip, as the secretary.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);
SELECT count(*) FROM public.soft_delete_trial('00000000-0000-0000-0000-000000915041');
RESET ROLE;

DO $$
DECLARE
  v_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915041';
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'FAIL soft_delete_trial did not delete the trial';
  END IF;
  IF (SELECT count(*) FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-000000915041' AND deleted_at = v_at) <> 2
     OR (SELECT count(*) FROM public.entries WHERE trial_id = '00000000-0000-0000-0000-000000915041' AND deleted_at = v_at) <> 3 THEN
    RAISE EXCEPTION 'FAIL the trial, its 2 classes and its 3 entries do not all share one deleted_at';
  END IF;
  IF (SELECT deleted_by FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915041') IS DISTINCT FROM '00000000-0000-0000-0000-000000915101'::uuid THEN
    RAISE EXCEPTION 'FAIL soft_delete_trial did not stamp deleted_by = auth.uid()';
  END IF;
  RAISE NOTICE 'PASS soft_delete_trial stamps one deleted_at across trial, classes and entries';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.restore_trial('00000000-0000-0000-0000-000000915041');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-000000915041' AND deleted_at IS NULL) <> 2
     OR (SELECT count(*) FROM public.entries WHERE trial_id = '00000000-0000-0000-0000-000000915041' AND deleted_at IS NULL) <> 3
     OR (SELECT deleted_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915041') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL restore_trial did not bring back the trial, 2 classes and 3 entries';
  END IF;
  RAISE NOTICE 'PASS restore_trial round-trips the same set';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. THE GUARD at every level, then the site-admin override.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.soft_delete_class('00000000-0000-0000-0000-000000915053');
    RAISE EXCEPTION 'FAIL a class with a paid entry was deleted by a secretary';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS class with a paid entry is refused (MK010)';
  END;

  BEGIN
    PERFORM public.soft_delete_class('00000000-0000-0000-0000-000000915054');
    RAISE EXCEPTION 'FAIL a class with a scored entry was deleted by a secretary';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS class with a scored entry is refused (MK010)';
  END;

  BEGIN
    PERFORM public.soft_delete_trial('00000000-0000-0000-0000-000000915042');
    RAISE EXCEPTION 'FAIL a trial with paid and scored entries was deleted by a secretary';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS trial with paid or scored entries is refused (MK010)';
  END;

  -- The one-argument call shape the client uses today still resolves.
  BEGIN
    PERFORM public.soft_delete_show(p_show_id => '00000000-0000-0000-0000-000000915032');
    RAISE EXCEPTION 'FAIL a show with paid and scored entries was deleted by a secretary';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS show with paid or scored entries is refused (MK010) through the one-argument call';
  END;

  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000000915032', true);
    RAISE EXCEPTION 'FAIL a secretary overrode the show guard';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a secretary cannot override the show guard (42501)';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at IS NULL) <> 3
     OR (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000915032') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a refused show delete left rows tombstoned';
  END IF;
  RAISE NOTICE 'PASS refused deletes touched nothing';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);

DO $$
BEGIN
  -- Being a site admin is not itself an override.
  BEGIN
    PERFORM public.soft_delete_show('00000000-0000-0000-0000-000000915032');
    RAISE EXCEPTION 'FAIL a site admin bypassed the guard without asking to override';
  EXCEPTION WHEN sqlstate 'MK010' THEN
    RAISE NOTICE 'PASS a site admin is still refused unless they pass the override';
  END;
END;
$$;

SELECT public.soft_delete_show('00000000-0000-0000-0000-000000915032', true);
RESET ROLE;

DO $$
DECLARE
  v_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000915032';
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the site-admin override did not delete the show';
  END IF;
  IF (SELECT count(*) FROM public.trials WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at = v_at) <> 1
     OR (SELECT count(*) FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-000000915042' AND deleted_at = v_at) <> 2
     OR (SELECT count(*) FROM public.entries WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at = v_at) <> 3 THEN
    RAISE EXCEPTION 'FAIL the show, trial, 2 classes and 3 entries do not share one deleted_at';
  END IF;
  IF (SELECT deleted_by FROM public.shows WHERE id = '00000000-0000-0000-0000-000000915032') IS DISTINCT FROM '00000000-0000-0000-0000-000000915103'::uuid THEN
    RAISE EXCEPTION 'FAIL soft_delete_show did not stamp deleted_by = the admin';
  END IF;
  RAISE NOTICE 'PASS a site admin may override; one deleted_at spans show, trial, classes and entries';
END;
$$;

-- MK013: nothing comes back under a parent that is still deleted.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.restore_trial('00000000-0000-0000-0000-000000915042');
    RAISE EXCEPTION 'FAIL restore_trial brought a trial back under a deleted show';
  EXCEPTION WHEN sqlstate 'MK013' THEN
    RAISE NOTICE 'PASS restore_trial refuses while the show is deleted (MK013)';
  END;
  BEGIN
    PERFORM public.restore_class('00000000-0000-0000-0000-000000915053');
    RAISE EXCEPTION 'FAIL restore_class brought a class back under a deleted trial';
  EXCEPTION WHEN sqlstate 'MK013' THEN
    RAISE NOTICE 'PASS restore_class refuses while the trial is deleted (MK013)';
  END;
  BEGIN
    PERFORM public.restore_entry('00000000-0000-0000-0000-000000915085');
    RAISE EXCEPTION 'FAIL restore_entry brought an entry back under a deleted class';
  EXCEPTION WHEN sqlstate 'MK013' THEN
    RAISE NOTICE 'PASS restore_entry refuses while the class is deleted (MK013)';
  END;
END;
$$;

SELECT count(*) FROM public.restore_show('00000000-0000-0000-0000-000000915032');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000915032') IS NOT NULL
     OR (SELECT count(*) FROM public.entries WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at IS NULL) <> 3
     OR (SELECT count(*) FROM public.classes WHERE trial_id = '00000000-0000-0000-0000-000000915042' AND deleted_at IS NULL) <> 2
     OR (SELECT count(*) FROM public.trials WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL restore_show did not bring back the show, trial, 2 classes and 3 entries';
  END IF;
  RAISE NOTICE 'PASS restore_show round-trips the same set';
END;
$$;

-- The override on the narrower levels, then restore.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);
SELECT public.soft_delete_entry('00000000-0000-0000-0000-000000915084', true);
SELECT public.restore_entry('00000000-0000-0000-0000-000000915084');
SELECT public.soft_delete_class('00000000-0000-0000-0000-000000915053', true);
SELECT count(*) FROM public.restore_class('00000000-0000-0000-0000-000000915053');
SELECT count(*) FROM public.soft_delete_trial('00000000-0000-0000-0000-000000915042', true);
SELECT count(*) FROM public.restore_trial('00000000-0000-0000-0000-000000915042');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE show_id = '00000000-0000-0000-0000-000000915032' AND deleted_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'FAIL the entry/class/trial override round trips left entries deleted';
  END IF;
  RAISE NOTICE 'PASS site-admin override works for entry, class and trial, and each restores';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. NON-MANAGERS: an outsider is refused everywhere; a non-admin secretary is
--    refused on clubs; and a non-deleter non-admin cannot restore.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915102","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.soft_delete_entry('00000000-0000-0000-0000-000000915081');
    RAISE EXCEPTION 'FAIL an outsider deleted an entry';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS outsider refused: soft_delete_entry'; END;
  BEGIN PERFORM public.soft_delete_class('00000000-0000-0000-0000-000000915051');
    RAISE EXCEPTION 'FAIL an outsider deleted a class';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS outsider refused: soft_delete_class'; END;
  BEGIN PERFORM public.soft_delete_trial('00000000-0000-0000-0000-000000915041');
    RAISE EXCEPTION 'FAIL an outsider deleted a trial';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS outsider refused: soft_delete_trial'; END;
  BEGIN PERFORM public.soft_delete_show('00000000-0000-0000-0000-000000915031');
    RAISE EXCEPTION 'FAIL an outsider deleted a show';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS outsider refused: soft_delete_show'; END;
  BEGIN PERFORM public.soft_delete_club('00000000-0000-0000-0000-000000915022');
    RAISE EXCEPTION 'FAIL an outsider deleted a club';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS outsider refused: soft_delete_club'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.soft_delete_club('00000000-0000-0000-0000-000000915022');
    RAISE EXCEPTION 'FAIL a club-scoped secretary deleted a club';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS secretary refused: soft_delete_club is site-admin only'; END;
END;
$$;

SELECT public.soft_delete_entry('00000000-0000-0000-0000-000000915081');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915102","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.restore_entry('00000000-0000-0000-0000-000000915081');
    RAISE EXCEPTION 'FAIL a different non-admin restored an entry inside someone else''s window';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS only the deleter (or an admin) can Undo'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);
SELECT public.restore_entry('00000000-0000-0000-0000-000000915081');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. CLUB: site admin only, refused while the club has live shows, Undo.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.soft_delete_club('00000000-0000-0000-0000-000000915021');
    RAISE EXCEPTION 'FAIL a club with live shows was deleted';
  EXCEPTION WHEN sqlstate 'MK011' THEN RAISE NOTICE 'PASS a club with live shows is refused (MK011)'; END;
END;
$$;

SELECT count(*) FROM public.soft_delete_club('00000000-0000-0000-0000-000000915022');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = '00000000-0000-0000-0000-000000915022'
      AND deleted_at IS NOT NULL AND deleted_by = '00000000-0000-0000-0000-000000915103'
  ) THEN
    RAISE EXCEPTION 'FAIL soft_delete_club did not stamp deleted_at/deleted_by';
  END IF;
  RAISE NOTICE 'PASS a site admin soft-deletes a club with no live shows';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.restore_club('00000000-0000-0000-0000-000000915022');
    RAISE EXCEPTION 'FAIL a non-admin non-deleter restored a club';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS restore_club refuses a non-admin who did not delete it'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);
SELECT count(*) FROM public.restore_club('00000000-0000-0000-0000-000000915022');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000000915022') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL restore_club did not restore';
  END IF;
  RAISE NOTICE 'PASS restore_club restores';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. THE DIRECT-WRITE BLOCK. Each arm asserts the trigger's MESSAGE: an RLS
--    42501 must not read as a pass. The positive control proves the same
--    caller CAN update the row, so the trigger is what stops the write.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.trials SET name = 'MYK9-915 Trial 3 renamed' WHERE id = '00000000-0000-0000-0000-000000915043';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL positive control: the secretary cannot even rename the trial (% rows), so the arms below prove nothing', v_rows;
  END IF;
  RAISE NOTICE 'PASS positive control: an ordinary update still works';
END;
$$;

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915033';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct shows.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL shows: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: shows.deleted_at';
  END;

  BEGIN
    UPDATE public.trials SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915043';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct trials.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL trials: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: trials.deleted_at';
  END;

  BEGIN
    UPDATE public.trials SET deleted_by = '00000000-0000-0000-0000-000000915101' WHERE id = '00000000-0000-0000-0000-000000915043';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct trials.deleted_by write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL trials.deleted_by: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: trials.deleted_by';
  END;

  BEGIN
    UPDATE public.classes SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915055';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct classes.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL classes: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: classes.deleted_at';
  END;

  BEGIN
    UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915087';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct entries.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL entries: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: entries.deleted_at';
  END;
END;
$$;

-- Clubs: even a site admin's direct write is blocked.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.clubs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915022';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct clubs.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL clubs: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: clubs.deleted_at, even for a site admin';
  END;
END;
$$;

-- Dogs and people: the owner / the person themself, whom RLS lets update the row.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915104","role":"authenticated"}', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.dogs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915068';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct dogs.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL dogs: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: dogs.deleted_at';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915105', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915105","role":"authenticated"}', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915015';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE EXCEPTION 'FAIL direct people.deleted_at write was not blocked (% rows)', v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%soft-delete and restore functions%' THEN
      RAISE EXCEPTION 'FAIL people: refused by something other than the trigger: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS direct write blocked: people.deleted_at';
  END;
END;
$$;

RESET ROLE;

-- Seeds and fixtures (postgres, service_role) keep working.
SET LOCAL ROLE service_role;
UPDATE public.trials SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915043';
UPDATE public.trials SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-000000915043';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915043') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL service_role could not write deleted_at';
  END IF;
  RAISE NOTICE 'PASS service_role (edge functions, seeds) is not blocked';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. THE UNDO WINDOW on the arena show SH3/T3/K5/E7 (secretary deletes).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);
SELECT count(*) FROM public.soft_delete_trial('00000000-0000-0000-0000-000000915043');
RESET ROLE;

DO $$
DECLARE
  v_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915043';
  -- 11 minutes ago: past the window, applied to the whole cascade so the stamps still match.
  UPDATE public.entries SET deleted_at = v_at - interval '11 minutes' WHERE deleted_at = v_at AND trial_id = '00000000-0000-0000-0000-000000915043';
  UPDATE public.classes SET deleted_at = v_at - interval '11 minutes' WHERE deleted_at = v_at AND trial_id = '00000000-0000-0000-0000-000000915043';
  UPDATE public.trials SET deleted_at = v_at - interval '11 minutes' WHERE id = '00000000-0000-0000-0000-000000915043';
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN PERFORM count(*) FROM public.restore_trial('00000000-0000-0000-0000-000000915043');
    RAISE EXCEPTION 'FAIL the deleter restored a trial 11 minutes after deleting it';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS a trial cannot be Undone after 10 minutes'; END;
END;
$$;

RESET ROLE;

-- 9 minutes ago: still inside the window.
DO $$
DECLARE
  v_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915043';
  UPDATE public.entries SET deleted_at = v_at + interval '2 minutes' WHERE deleted_at = v_at AND trial_id = '00000000-0000-0000-0000-000000915043';
  UPDATE public.classes SET deleted_at = v_at + interval '2 minutes' WHERE deleted_at = v_at AND trial_id = '00000000-0000-0000-0000-000000915043';
  UPDATE public.trials SET deleted_at = v_at + interval '2 minutes' WHERE id = '00000000-0000-0000-0000-000000915043';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.restore_trial('00000000-0000-0000-0000-000000915043');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.trials WHERE id = '00000000-0000-0000-0000-000000915043') IS NOT NULL
     OR (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915087') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the deleter could not Undo 9 minutes after deleting';
  END IF;
  RAISE NOTICE 'PASS a trial can be Undone at 9 minutes, cascade included';
END;
$$;

-- A site admin restores after the window.
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.soft_delete_trial('00000000-0000-0000-0000-000000915043');
RESET ROLE;
UPDATE public.trials SET deleted_at = deleted_at - interval '2 hours' WHERE id = '00000000-0000-0000-0000-000000915043';
UPDATE public.classes SET deleted_at = deleted_at - interval '2 hours' WHERE trial_id = '00000000-0000-0000-0000-000000915043' AND deleted_at IS NOT NULL;
UPDATE public.entries SET deleted_at = deleted_at - interval '2 hours' WHERE trial_id = '00000000-0000-0000-0000-000000915043' AND deleted_at IS NOT NULL;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);
SELECT count(*) FROM public.restore_trial('00000000-0000-0000-0000-000000915043');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915087') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a site admin could not restore a trial after the window';
  END IF;
  RAISE NOTICE 'PASS a site admin restores a trial after the window, cascade included';
END;
$$;

-- Show: the deleter, an outsider, and a NULL deleted_by (fixture write as postgres).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);
SELECT public.soft_delete_show('00000000-0000-0000-0000-000000915033');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915102","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM count(*) FROM public.restore_show('00000000-0000-0000-0000-000000915033');
    RAISE EXCEPTION 'FAIL an outsider restored a show inside someone else''s window';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS restore_show refuses a non-deleter'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);
SELECT count(*) FROM public.restore_show('00000000-0000-0000-0000-000000915033');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000000915033') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the deleter could not Undo a show';
  END IF;
  RAISE NOTICE 'PASS the deleter Undoes a show';
END;
$$;

UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000915033';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915101","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM count(*) FROM public.restore_show('00000000-0000-0000-0000-000000915033');
    RAISE EXCEPTION 'FAIL a row with deleted_by NULL was restored by a non-admin';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS a NULL deleted_by is restorable by an admin only'; END;
END;
$$;

RESET ROLE;
UPDATE public.shows SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-000000915033';

-- Dog (owner) and person (self): the existing RPCs now carry the window.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915104","role":"authenticated"}', true);
SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000915068');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915102","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN PERFORM public.restore_dog('00000000-0000-0000-0000-000000915068');
    RAISE EXCEPTION 'FAIL an outsider restored someone else''s dog';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS restore_dog refuses a non-deleter'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915104","role":"authenticated"}', true);
SELECT public.restore_dog('00000000-0000-0000-0000-000000915068');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000915068') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the owner could not Undo a dog delete';
  END IF;
  RAISE NOTICE 'PASS the owner Undoes a dog delete inside the window';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000915068');
RESET ROLE;
UPDATE public.dogs SET deleted_at = deleted_at - interval '11 minutes' WHERE id = '00000000-0000-0000-0000-000000915068';

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM public.restore_dog('00000000-0000-0000-0000-000000915068');
    RAISE EXCEPTION 'FAIL the owner restored a dog after the window';
  EXCEPTION WHEN sqlstate '42501' THEN RAISE NOTICE 'PASS restore_dog is refused after the window'; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915103","role":"authenticated"}', true);
SELECT public.restore_dog('00000000-0000-0000-0000-000000915068');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000915068') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a site admin could not restore a dog after the window';
  END IF;
  RAISE NOTICE 'PASS a site admin restores a dog after the window';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915105', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000915105","role":"authenticated"}', true);
SELECT count(*) FROM public.soft_delete_person('00000000-0000-0000-0000-000000915015');
SELECT count(*) FROM public.restore_person('00000000-0000-0000-0000-000000915015');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.people WHERE id = '00000000-0000-0000-0000-000000915015') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a person could not Undo deleting themself';
  END IF;
  RAISE NOTICE 'PASS a person Undoes their own delete inside the window';
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. ACL and shape contract.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.soft_delete_show(uuid, boolean)', 'public.soft_delete_class(uuid, boolean)',
    'public.soft_delete_trial(uuid, boolean)', 'public.soft_delete_entry(uuid, boolean)',
    'public.soft_delete_club(uuid)', 'public.restore_trial(uuid)', 'public.restore_entry(uuid)',
    'public.restore_club(uuid)', 'public.restore_show(uuid)', 'public.restore_class(uuid)',
    'public.restore_dog(uuid)', 'public.restore_person(uuid)'
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
  END LOOP;
  RAISE NOTICE 'PASS soft-delete and restore RPCs: authenticated + service_role only';

  FOREACH v_fn IN ARRAY ARRAY[
    'private.count_delete_blocking_entries(text, uuid)', 'private.enforce_delete_money_guard(text, uuid, boolean)',
    'private.can_undo_soft_delete(uuid, timestamptz)', 'private.block_direct_soft_delete_write()',
    'private.lock_delete_scope_entries(text, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR EXISTS (
         SELECT 1 FROM pg_proc p
         WHERE p.oid = v_fn::regprocedure
           AND (p.proacl IS NULL
                OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
       ) THEN
      RAISE EXCEPTION 'FAIL a client role can execute internal helper %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS the private helpers are not executable by client roles';

  IF to_regprocedure('public.soft_delete_show(uuid)') IS NOT NULL
     OR to_regprocedure('public.soft_delete_class(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the one-argument soft_delete_show/soft_delete_class overloads still exist';
  END IF;
  RAISE NOTICE 'PASS no ambiguous one-argument overloads remain';

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname = 'trg_00_block_direct_soft_delete' AND NOT tgisinternal
        AND tgrelid IN ('public.clubs'::regclass, 'public.shows'::regclass, 'public.trials'::regclass,
                        'public.classes'::regclass, 'public.entries'::regclass, 'public.dogs'::regclass,
                        'public.people'::regclass)) <> 7 THEN
    RAISE EXCEPTION 'FAIL the direct-write block is not on all seven tables';
  END IF;
  -- SECURITY DEFINER would make current_user the owner and the check inert.
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'private.block_direct_soft_delete_write()'::regprocedure) THEN
    RAISE EXCEPTION 'FAIL the block trigger function must be SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'PASS the direct-write block is on all seven tables and is SECURITY INVOKER';
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. THE GUARD LOCKS BEFORE IT COUNTS. A single session cannot race itself, but
--     row locks are observable: a locked tuple carries xmax = this transaction.
--     Fresh rows (xmax 0 at insert) are used so earlier updates cannot fake it.
--     The two-connection race itself is not reproducible in this harness.
-- ---------------------------------------------------------------------------
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000915034', 'MYK9-915 Show Lock', 'AKC', current_date, current_date, 'draft', '00000000-0000-0000-0000-000000915021');
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000915044', '00000000-0000-0000-0000-000000915034', 'MYK9-915 Trial Lock', current_date);
INSERT INTO public.classes (id, trial_id, name)
VALUES ('00000000-0000-0000-0000-000000915056', '00000000-0000-0000-0000-000000915044', 'MYK9-915 K6'),
       ('00000000-0000-0000-0000-000000915057', '00000000-0000-0000-0000-000000915044', 'MYK9-915 K7');
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id)
SELECT e.id, e.class_id, '00000000-0000-0000-0000-000000915044', '00000000-0000-0000-0000-000000915034', e.dog_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000915091'::uuid, '00000000-0000-0000-0000-000000915056'::uuid, '00000000-0000-0000-0000-000000915061'::uuid),
  ('00000000-0000-0000-0000-000000915092'::uuid, '00000000-0000-0000-0000-000000915057'::uuid, '00000000-0000-0000-0000-000000915062'::uuid),
  ('00000000-0000-0000-0000-000000915093'::uuid, '00000000-0000-0000-0000-000000915057'::uuid, '00000000-0000-0000-0000-000000915063'::uuid)
) AS e(id, class_id, dog_id);

DO $$
DECLARE
  v_locked uuid[];
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE id::text LIKE '00000000-0000-0000-0000-00000091509%' AND xmax::text::bigint <> 0) <> 0 THEN
    RAISE EXCEPTION 'FIXTURE the lock-probe entries are already locked';
  END IF;

  -- class scope: only K6's entry is locked; K7's are not.
  PERFORM private.enforce_delete_money_guard('class', '00000000-0000-0000-0000-000000915056', false);
  SELECT array_agg(id ORDER BY id) INTO v_locked FROM public.entries
  WHERE id::text LIKE '00000000-0000-0000-0000-00000091509%' AND xmax::text::bigint <> 0;
  IF v_locked IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000915091']::uuid[] THEN
    RAISE EXCEPTION 'FAIL class-scope guard locked % instead of only the class''s entry', v_locked;
  END IF;
  RAISE NOTICE 'PASS the class guard row-locks exactly the class''s live entries before counting';

  -- trial scope reaches the rest.
  PERFORM private.enforce_delete_money_guard('trial', '00000000-0000-0000-0000-000000915044', false);
  IF (SELECT count(*) FROM public.entries WHERE id::text LIKE '00000000-0000-0000-0000-00000091509%' AND xmax::text::bigint <> 0) <> 3 THEN
    RAISE EXCEPTION 'FAIL trial-scope guard did not lock all three entries';
  END IF;
  RAISE NOTICE 'PASS the trial guard row-locks every live entry under it';
END;
$$;

-- The override path locks too (a site admin's cascade must not race a payment).
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id)
VALUES ('00000000-0000-0000-0000-000000915094', '00000000-0000-0000-0000-000000915057', '00000000-0000-0000-0000-000000915044',
        '00000000-0000-0000-0000-000000915034', '00000000-0000-0000-0000-000000915064');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000915103', true);

DO $$
BEGIN
  PERFORM private.enforce_delete_money_guard('entry', '00000000-0000-0000-0000-000000915094', true);
  IF (SELECT xmax::text::bigint FROM public.entries WHERE id = '00000000-0000-0000-0000-000000915094') = 0 THEN
    RAISE EXCEPTION 'FAIL the override path returned without locking the entry';
  END IF;
  RAISE NOTICE 'PASS the override path row-locks before it returns';
END;
$$;

ROLLBACK;
