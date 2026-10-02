-- MYK9-923 (migration 20261002015900): no entry is created, re-parented or
-- restored under a soft-deleted class, trial or show.
--
-- Every entry-creation path is driven as its real caller, and each refusal is
-- asserted by SQLSTATE AND message, so an RLS 42501 or an unrelated refusal
-- cannot read as a pass:
--   1. the walk-up / desk entry and the replication queue's INSERT: a direct
--      INSERT by a secretary, under a deleted class, a deleted trial (class
--      live) and a deleted show (trial and class live), with a live-class
--      positive control;
--   2. exhibitor checkout: submit_show_entries, self-service;
--   3. secretary on-behalf: submit_show_entries with submission_source
--      'organizer';
--   4. the paid online line: create_online_paid_entry as service_role (the
--      Stripe webhook);
--   5. move-up target: move_up_entry into a deleted class and into a class of a
--      deleted trial;
--   6. transfer: a direct UPDATE of class_id (what a class change uploads);
--      an ordinary update of a live entry still lands;
--   7. restore_entry refuses MK013 naming the topmost deleted parent (show,
--      trial), and the trigger refuses a direct un-delete under a deleted class
--      with the same MK013 message;
--   8. a replayed INSERT of an existing id answers 23505, not MK014 (the
--      replication queue reads 23505 as "the earlier attempt committed");
--   9. restore_dog brings back the dog's entry under a live class and leaves
--      the one under a deleted class tombstoned, instead of failing;
--  10. the replaced functions keep SECURITY DEFINER, search_path, owner and
--      grants; the new private helpers are not executable by client roles; both
--      triggers are installed and enabled;
--  11. the parent gate is really taken: an entry insert holds it SHARED on its
--      show, trial and class, move_up_entry holds it on the target, and
--      soft_delete_class holds it EXCLUSIVE on the class (read from pg_locks
--      for this backend).
-- The interleavings themselves (insert vs delete, move-up vs show delete)
-- need two sessions and are not asserted here.
--
-- Parents are deleted with a direct UPDATE as postgres (which the direct-write
-- block allows): it marks the parent deleted WITHOUT cascading, which is exactly
-- the state a racing insert used to leave behind.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

CREATE FUNCTION pg_temp.expect(label text, got text, want text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got;
  END IF;
  RAISE NOTICE 'PASS %', label;
END;
$$;

-- Runs p_sql as the CURRENT role and requires it to fail with p_state and a
-- message equal to p_message.
CREATE FUNCTION pg_temp.refused(label text, p_sql text, p_state text, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'FAIL %: the statement succeeded', label;
  END IF;
  IF v_state IS DISTINCT FROM p_state OR v_message IS DISTINCT FROM p_message THEN
    RAISE EXCEPTION 'FAIL %: expected % "%", got % "%"', label, p_state, p_message, v_state, v_message;
  END IF;
  RAISE NOTICE 'PASS % (%)', label, v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.expect(text, text, text) TO authenticated, service_role;
-- The lock mode this backend holds on the parent gate (kind, id), or NULL.
-- The gate is the two-int4 advisory key (923, hashtext('<kind>:<id>')); the
-- second key shows in pg_locks.objid as an unsigned oid.
CREATE FUNCTION pg_temp.gate_mode(p_kind text, p_id uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(l.mode, ',' ORDER BY l.mode)
  FROM pg_locks l
  WHERE l.locktype = 'advisory'
    AND l.pid = pg_backend_pid()
    AND l.objsubid = 2
    AND l.classid = 923::oid
    AND l.objid::text::bigint = (hashtext(p_kind || ':' || p_id::text)::bigint + 4294967296) % 4294967296;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.refused(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.gate_mode(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. People first, then auth.users, so handle_new_user adopts each
-- person and creates the exhibitor profile.
--   923001 secretary (club 923010)   923002 exhibitor (owns every dog)
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000000923010', 'MYK9-923 Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000923001', 'MYK9-923', 'Secretary', 'myk9-923-sec@example.test'),
  ('00000000-0000-0000-0000-000000923002', 'MYK9-923', 'Exhibitor', 'myk9-923-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000923101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-923-sec@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000923102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-923-exh@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000923001', r.id, '00000000-0000-0000-0000-000000923010',
       true, '00000000-0000-0000-0000-000000923101'
FROM public.roles r WHERE r.name = 'secretary';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id IN ('00000000-0000-0000-0000-000000923001', '00000000-0000-0000-0000-000000923002')
        AND auth_user_id IS NOT NULL) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                    WHERE auth_user_id = '00000000-0000-0000-0000-000000923102') THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt both people and create the exhibitor profile';
  END IF;
END;
$$;

-- S1 open for entries: T1 live (K1, K2, K6), T2 to be deleted (K3), T5 (K8).
-- S2 to be deleted (T3, K4 stay live). S3 (T4, K7) for the show-restore case.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
SELECT v.id, v.name, 'UKC', current_date + 5, current_date + 6,
       '00000000-0000-0000-0000-000000923010', 'published',
       (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true, true, 30
FROM (VALUES
  ('00000000-0000-0000-0000-000000923100'::uuid, 'MYK9-923 Show One'),
  ('00000000-0000-0000-0000-000000923110'::uuid, 'MYK9-923 Show Two'),
  ('00000000-0000-0000-0000-000000923120'::uuid, 'MYK9-923 Show Three')
) AS v(id, name);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  ('00000000-0000-0000-0000-000000923200', '00000000-0000-0000-0000-000000923100', 'MYK9-923 T1', current_date + 5, 'UKC', 'Nosework'),
  ('00000000-0000-0000-0000-000000923201', '00000000-0000-0000-0000-000000923100', 'MYK9-923 T2', current_date + 5, 'UKC', 'Nosework'),
  ('00000000-0000-0000-0000-000000923202', '00000000-0000-0000-0000-000000923100', 'MYK9-923 T5', current_date + 6, 'UKC', 'Nosework'),
  ('00000000-0000-0000-0000-000000923210', '00000000-0000-0000-0000-000000923110', 'MYK9-923 T3', current_date + 5, 'UKC', 'Nosework'),
  ('00000000-0000-0000-0000-000000923220', '00000000-0000-0000-0000-000000923120', 'MYK9-923 T4', current_date + 5, 'UKC', 'Nosework');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000923301', '00000000-0000-0000-0000-000000923200', 'K1 Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923302', '00000000-0000-0000-0000-000000923200', 'K2 Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923303', '00000000-0000-0000-0000-000000923201', 'K3 Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923304', '00000000-0000-0000-0000-000000923210', 'K4 Buried', 'Buried', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923306', '00000000-0000-0000-0000-000000923200', 'K6 Vehicle', 'Vehicle', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923307', '00000000-0000-0000-0000-000000923220', 'K7 Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923308', '00000000-0000-0000-0000-000000923202', 'K8 Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923309', '00000000-0000-0000-0000-000000923200', 'K9 Empty', 'Buried', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000923310', '00000000-0000-0000-0000-000000923200', 'K10 Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT ('00000000-0000-0000-0000-00000092340' || n)::uuid, 'MYK9-923 Dog ' || n, 'Dog' || n,
       'Border Collie', 'active', '00000000-0000-0000-0000-000000923002'
FROM generate_series(1, 6) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT ('00000000-0000-0000-0000-00000092340' || n)::uuid, 'UKC', 'SR9230000' || n, true
FROM generate_series(1, 6) AS n;

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000923500', '00000000-0000-0000-0000-000000923100',
        '00000000-0000-0000-0000-000000923002');

-- Entries that exist BEFORE any parent is deleted:
--   EM  923601 D1 in K1  (move-up source, transfer subject)
--   ER1 923602 D2 in K7  (show-restore case)
--   ER2 923603 D3 in K8  (trial-restore case)
--   ER3 923604 D4 in K2  (direct un-delete and replay cases)
--   RD1 923605 D5 in K1, RD2 923606 D5 in K6 (restore_dog case)
INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, entry_status, payment_status)
VALUES
  ('00000000-0000-0000-0000-000000923601', '00000000-0000-0000-0000-000000923401', '00000000-0000-0000-0000-000000923301', '00000000-0000-0000-0000-000000923200', '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending'),
  ('00000000-0000-0000-0000-000000923602', '00000000-0000-0000-0000-000000923402', '00000000-0000-0000-0000-000000923307', '00000000-0000-0000-0000-000000923220', '00000000-0000-0000-0000-000000923120', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending'),
  ('00000000-0000-0000-0000-000000923603', '00000000-0000-0000-0000-000000923403', '00000000-0000-0000-0000-000000923308', '00000000-0000-0000-0000-000000923202', '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending'),
  ('00000000-0000-0000-0000-000000923604', '00000000-0000-0000-0000-000000923404', '00000000-0000-0000-0000-000000923302', '00000000-0000-0000-0000-000000923200', '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending'),
  ('00000000-0000-0000-0000-000000923605', '00000000-0000-0000-0000-000000923405', '00000000-0000-0000-0000-000000923301', '00000000-0000-0000-0000-000000923200', '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending'),
  ('00000000-0000-0000-0000-000000923606', '00000000-0000-0000-0000-000000923405', '00000000-0000-0000-0000-000000923306', '00000000-0000-0000-0000-000000923200', '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', 'confirmed', 'pending');

-- ER3 is tombstoned on its own, then K2 is deleted directly; T2 and S2 are
-- deleted directly with their children left live.
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923604';
UPDATE public.classes SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923302';
UPDATE public.trials SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923201';
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923110';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entries WHERE id::text LIKE '00000000-0000-0000-0000-0000009236%') <> 6
     OR NOT EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000000923302' AND deleted_at IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000000923303' AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.trials WHERE id = '00000000-0000-0000-0000-000000923201' AND deleted_at IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000000923304' AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.trials WHERE id = '00000000-0000-0000-0000-000000923210' AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000000923110' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FIXTURE the parents were not deleted as the cases need';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Walk-up / desk entry and the replication INSERT: a direct INSERT by the
--    secretary.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000923101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000923101","role":"authenticated"}', true);

SELECT pg_temp.refused('direct insert under a deleted class',
  $q$INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, is_day_of_show)
     VALUES ('00000000-0000-0000-0000-000000923701', '00000000-0000-0000-0000-000000923406',
             '00000000-0000-0000-0000-000000923302', '00000000-0000-0000-0000-000000923200',
             '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', true)$q$,
  'MK014', 'This class has been deleted, so it can no longer take entries.');

SELECT pg_temp.refused('direct insert under a deleted trial (class live)',
  $q$INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, is_day_of_show)
     VALUES ('00000000-0000-0000-0000-000000923702', '00000000-0000-0000-0000-000000923406',
             '00000000-0000-0000-0000-000000923303', '00000000-0000-0000-0000-000000923201',
             '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', true)$q$,
  'MK014', 'This trial has been deleted, so it can no longer take entries.');

-- The entry names a live trial; the class's own trial is the deleted one.
SELECT pg_temp.refused('direct insert whose class sits under a deleted trial, entry trial_id live',
  $q$INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, is_day_of_show)
     VALUES ('00000000-0000-0000-0000-000000923703', '00000000-0000-0000-0000-000000923406',
             '00000000-0000-0000-0000-000000923303', '00000000-0000-0000-0000-000000923200',
             '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', true)$q$,
  'MK014', 'This trial has been deleted, so it can no longer take entries.');

SELECT pg_temp.refused('direct insert under a deleted show (trial and class live)',
  $q$INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, is_day_of_show)
     VALUES ('00000000-0000-0000-0000-000000923704', '00000000-0000-0000-0000-000000923406',
             '00000000-0000-0000-0000-000000923304', '00000000-0000-0000-0000-000000923210',
             '00000000-0000-0000-0000-000000923110', '00000000-0000-0000-0000-000000923002', true)$q$,
  'MK014', 'This show has been deleted, so it can no longer take entries.');

INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id, is_day_of_show)
VALUES ('00000000-0000-0000-0000-000000923705', '00000000-0000-0000-0000-000000923406',
        '00000000-0000-0000-0000-000000923301', '00000000-0000-0000-0000-000000923200',
        '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002', true);
SELECT pg_temp.expect('positive control: the same direct insert into a live class lands',
  (SELECT count(*)::text FROM public.entries WHERE id = '00000000-0000-0000-0000-000000923705' AND deleted_at IS NULL),
  '1');

-- 11. The insert took the shared gate on its show, trial and class.
SELECT pg_temp.expect('an entry insert holds the shared gate on its show, trial and class',
  pg_temp.gate_mode('show', '00000000-0000-0000-0000-000000923100') || '|'
  || pg_temp.gate_mode('trial', '00000000-0000-0000-0000-000000923200') || '|'
  || pg_temp.gate_mode('class', '00000000-0000-0000-0000-000000923301'),
  'ShareLock|ShareLock|ShareLock');

-- ---------------------------------------------------------------------------
-- 3. Secretary on-behalf: submit_show_entries, submission_source 'organizer',
--    into K3 (its trial is deleted).
-- ---------------------------------------------------------------------------
SELECT pg_temp.refused('submit_show_entries on behalf (organizer) under a deleted trial',
  $q$SELECT public.submit_show_entries(
       '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923500',
       jsonb_build_array(jsonb_build_object(
         'dog_id', '00000000-0000-0000-0000-000000923406', 'class_id', '00000000-0000-0000-0000-000000923303',
         'handler_name', 'MYK9-923 Exhibitor', 'client_fee_cents', 3000, 'submission_source', 'organizer')),
       '00000000-0000-0000-0000-000000923901'::uuid, 'check')$q$,
  'MK014', 'This trial has been deleted, so it can no longer take entries.');

-- ---------------------------------------------------------------------------
-- 5. Move-up target. move_up_entry already refused a deleted class or trial;
--    pinned here so the path stays covered.
-- ---------------------------------------------------------------------------
SELECT pg_temp.refused('move_up_entry into a deleted class',
  $q$SELECT public.move_up_entry('00000000-0000-0000-0000-000000923601',
       '00000000-0000-0000-0000-000000923302', '00000000-0000-0000-0000-000000923711', NULL)$q$,
  'P0002', 'That class no longer exists.');
SELECT pg_temp.refused('move_up_entry into a class of a deleted trial',
  $q$SELECT public.move_up_entry('00000000-0000-0000-0000-000000923601',
       '00000000-0000-0000-0000-000000923303', '00000000-0000-0000-0000-000000923712', NULL)$q$,
  'P0002', 'That class no longer exists.');

-- ---------------------------------------------------------------------------
-- 6. Transfer: a direct UPDATE of class_id.
-- ---------------------------------------------------------------------------
SELECT pg_temp.refused('class change into a deleted class',
  $q$UPDATE public.entries SET class_id = '00000000-0000-0000-0000-000000923302'
     WHERE id = '00000000-0000-0000-0000-000000923601'$q$,
  'MK014', 'This class has been deleted, so it can no longer take entries.');
SELECT pg_temp.refused('class change into a class of a deleted trial',
  $q$UPDATE public.entries SET class_id = '00000000-0000-0000-0000-000000923303',
                              trial_id = '00000000-0000-0000-0000-000000923201'
     WHERE id = '00000000-0000-0000-0000-000000923601'$q$,
  'MK014', 'This trial has been deleted, so it can no longer take entries.');

UPDATE public.entries SET check_in_status = 'checked-in'
WHERE id = '00000000-0000-0000-0000-000000923601';
SELECT pg_temp.expect('an ordinary update of a live entry still lands',
  (SELECT check_in_status || '|' || class_id::text FROM public.entries WHERE id = '00000000-0000-0000-0000-000000923601'),
  'checked-in|00000000-0000-0000-0000-000000923301');

-- 11. A successful move-up holds the gate on its target class (taken before
-- it locks the source; the order itself is a two-session property).
SELECT pg_temp.expect('move_up_entry into a live class still works',
  public.move_up_entry('00000000-0000-0000-0000-000000923601',
    '00000000-0000-0000-0000-000000923310', '00000000-0000-0000-0000-000000923713', NULL)::text,
  '00000000-0000-0000-0000-000000923713');
SELECT pg_temp.expect('move_up_entry holds the shared gate on the target class',
  pg_temp.gate_mode('class', '00000000-0000-0000-0000-000000923310'),
  'ShareLock');

-- 11. soft_delete_class takes the gate EXCLUSIVE on the class it deletes.
SELECT public.soft_delete_class('00000000-0000-0000-0000-000000923309');
SELECT pg_temp.expect('soft_delete_class holds the exclusive gate on its class',
  pg_temp.gate_mode('class', '00000000-0000-0000-0000-000000923309'),
  'ExclusiveLock');

-- ---------------------------------------------------------------------------
-- 7. restore_entry. The secretary deletes ER1 and ER2 (entries only), then
--    the show of ER1 and the trial of ER2 are deleted directly.
-- ---------------------------------------------------------------------------
SELECT public.soft_delete_entry('00000000-0000-0000-0000-000000923602');
SELECT public.soft_delete_entry('00000000-0000-0000-0000-000000923603');
RESET ROLE;
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923120';
UPDATE public.trials SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923202';
SET LOCAL ROLE authenticated;

SELECT pg_temp.refused('restore_entry under a deleted show (class and trial live)',
  $q$SELECT public.restore_entry('00000000-0000-0000-0000-000000923602')$q$,
  'MK013', 'Restore the show first');
SELECT pg_temp.refused('restore_entry under a deleted trial (class live)',
  $q$SELECT public.restore_entry('00000000-0000-0000-0000-000000923603')$q$,
  'MK013', 'Restore the trial first');
RESET ROLE;

-- The trigger is the backstop for any other writer: a direct un-delete as
-- postgres (which the direct-write block lets through) under a deleted class.
SELECT pg_temp.refused('a direct un-delete under a deleted class is refused like a restore',
  $q$UPDATE public.entries SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-000000923604'$q$,
  'MK013', 'Restore the class first');

-- ---------------------------------------------------------------------------
-- 8. A replayed INSERT of an existing id answers 23505.
-- ---------------------------------------------------------------------------
SELECT pg_temp.refused('a replayed insert of an existing entry id under a deleted class',
  $q$INSERT INTO public.entries (id, dog_id, class_id, trial_id, show_id, handler_id)
     VALUES ('00000000-0000-0000-0000-000000923604', '00000000-0000-0000-0000-000000923404',
             '00000000-0000-0000-0000-000000923302', '00000000-0000-0000-0000-000000923200',
             '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923002')$q$,
  '23505', 'duplicate key value violates unique constraint "entries_pkey"');

-- ---------------------------------------------------------------------------
-- 2. Exhibitor checkout (self-service) into the deleted class K2.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000923102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000923102","role":"authenticated"}', true);

SELECT pg_temp.refused('submit_show_entries self-service under a deleted class',
  $q$SELECT public.submit_show_entries(
       '00000000-0000-0000-0000-000000923100', '00000000-0000-0000-0000-000000923500',
       jsonb_build_array(jsonb_build_object(
         'dog_id', '00000000-0000-0000-0000-000000923406', 'class_id', '00000000-0000-0000-0000-000000923302',
         'handler_name', 'MYK9-923 Exhibitor', 'client_fee_cents', 3000)),
       '00000000-0000-0000-0000-000000923902'::uuid, 'check')$q$,
  'MK014', 'This class has been deleted, so it can no longer take entries.');

-- ---------------------------------------------------------------------------
-- 9. restore_dog. The exhibitor deletes D5 (RD1 in K1, RD2 in K6 tombstoned
--    with it); K6 is then deleted directly; the exhibitor Undoes the dog.
-- ---------------------------------------------------------------------------
SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000923405');
RESET ROLE;
UPDATE public.classes SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000923306';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect('restore_dog restores the entry under the live class only',
  (SELECT (public.restore_dog('00000000-0000-0000-0000-000000923405') ->> 'entries_restored')),
  '1');
RESET ROLE;
SELECT pg_temp.expect('restore_dog left the entry under the deleted class tombstoned',
  (SELECT string_agg(e.id::text || '=' || (e.deleted_at IS NULL)::text, ',' ORDER BY e.id)
     FROM public.entries e WHERE e.dog_id = '00000000-0000-0000-0000-000000923405'),
  '00000000-0000-0000-0000-000000923605=true,00000000-0000-0000-0000-000000923606=false');
SELECT pg_temp.expect('restore_dog brought the dog back',
  (SELECT (deleted_at IS NULL)::text FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000923405'),
  'true');

-- ---------------------------------------------------------------------------
-- 4. The paid online line: create_online_paid_entry as service_role, into K4
--    (its show is deleted).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.refused('create_online_paid_entry under a deleted show',
  $q$SELECT * FROM public.create_online_paid_entry(
       '00000000-0000-0000-0000-000000923406', '00000000-0000-0000-0000-000000923304', NULL, 30,
       NULL, NULL, 'pi_test_myk9_923', now(),
       '00000000-0000-0000-0000-000000923110', '00000000-0000-0000-0000-000000923210',
       (SELECT id FROM public.exhibitor_profiles WHERE auth_user_id = '00000000-0000-0000-0000-000000923102'))$q$,
  'MK014', 'This show has been deleted, so it can no longer take entries.');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The invariant across every case above: no fixture entry is live under a
-- deleted class, trial or show.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('no fixture entry is live under a deleted class, trial or show',
  (SELECT count(*)::text
     FROM public.entries e
     LEFT JOIN public.classes c ON c.id = e.class_id
     LEFT JOIN public.trials t ON t.id = c.trial_id
     LEFT JOIN public.trials t2 ON t2.id = e.trial_id
     LEFT JOIN public.shows s ON s.id = e.show_id
     LEFT JOIN public.shows s2 ON s2.id = t.show_id
    WHERE e.deleted_at IS NULL
      AND e.dog_id::text LIKE '00000000-0000-0000-0000-0000009234%'
      AND (c.deleted_at IS NOT NULL OR t.deleted_at IS NOT NULL OR t2.deleted_at IS NOT NULL
           OR s.deleted_at IS NOT NULL OR s2.deleted_at IS NOT NULL)),
  '0');

-- ---------------------------------------------------------------------------
-- 10. Function attributes, helper privileges, triggers.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('replaced functions keep SECURITY DEFINER, empty search_path, owner postgres and grants',
  (SELECT string_agg(
            p.proname || ':' || p.prosecdef::text || ':' || array_to_string(p.proconfig, ';') || ':'
            || pg_get_userbyid(p.proowner) || ':'
            || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ':'
            || has_function_privilege('anon', p.oid, 'EXECUTE')::text,
            ',' ORDER BY p.proname)
     FROM pg_proc p
    WHERE p.oid IN (
      'public.soft_delete_show(uuid, boolean)'::regprocedure,
      'public.soft_delete_class(uuid, boolean)'::regprocedure,
      'public.soft_delete_trial(uuid, boolean)'::regprocedure,
      'public.restore_entry(uuid)'::regprocedure,
      'public.restore_dog(uuid)'::regprocedure,
      'public.move_up_entry(uuid, uuid, uuid, text)'::regprocedure)),
  'move_up_entry:true:search_path="":postgres:true:false,'
  || 'restore_dog:true:search_path="":postgres:true:false,'
  || 'restore_entry:true:search_path="":postgres:true:false,'
  || 'soft_delete_class:true:search_path="":postgres:true:false,'
  || 'soft_delete_show:true:search_path="":postgres:true:false,'
  || 'soft_delete_trial:true:search_path="":postgres:true:false');

SELECT pg_temp.expect('the new private helpers are not executable by client roles',
  (SELECT bool_or(has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::text
     FROM (VALUES ('private.entry_deleted_parent(uuid, uuid, uuid)'::regprocedure),
                  ('private.entry_parent_gate(text, uuid, boolean)'::regprocedure),
                  ('private.entries_refuse_deleted_parent()'::regprocedure)) AS f(oid)
     CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)),
  'false');

SELECT pg_temp.expect('the trigger function is SECURITY DEFINER with an empty search_path',
  (SELECT p.prosecdef::text || ':' || array_to_string(p.proconfig, ';')
     FROM pg_proc p WHERE p.oid = 'private.entries_refuse_deleted_parent()'::regprocedure),
  'true:search_path=""');

SELECT pg_temp.expect('both entries triggers are installed and enabled',
  (SELECT string_agg(t.tgname || ':' || t.tgenabled::text, ',' ORDER BY t.tgname)
     FROM pg_trigger t
    WHERE t.tgrelid = 'public.entries'::regclass
      AND t.tgfoid = 'private.entries_refuse_deleted_parent()'::regprocedure),
  'entries_00_refuse_deleted_parent:O,trg_01_entries_refuse_deleted_parent:O');

ROLLBACK;
