-- MYK9-822: count_blocking_entries_by_dog shares soft_delete_dog's own MK002
-- predicate (private.count_dog_blocking_entries), so the delete dialog's
-- pre-check and the server's refusal cannot read differently.
--
-- Covered:
--   * owner: a clean dog (a live, non-blocking entry present) counts 0;
--   * owner: a PAID entry counts 1, and soft_delete_dog itself refuses it
--     with MK002 — proving the RPC's count and the guard's decision agree;
--   * owner: a SCORED entry counts 1 and is refused the same way;
--   * owner: an entry with a settled result_status ('absent') and
--     is_scored = false counts 1 and is refused the same way — this is the
--     exact case the old client-side PostgREST filter missed (MYK9-799),
--     because it could not name entries.result_status without a 403;
--   * a non-owner, non-admin caller is refused (42501) rather than given a
--     count for a dog they cannot see;
--   * anon has no EXECUTE grant at all and is refused before the function
--     body ever runs.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (
    '00000000-0000-0000-0000-000000822011',
    'MYK9-822',
    'Owner',
    'myk9-822-owner@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000822012',
    'MYK9-822',
    'Non-Owner',
    'myk9-822-non-owner@example.test'
  );

-- handle_new_user fires on this insert and adopts the people rows by email
-- (migration 131).
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000822101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-822-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000822102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-822-non-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

-- MYK9-1008: every show belongs to a club (shows.club_id NOT NULL); each
-- fixture show gets its own fixture club, reusing the show's id.
INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000000822021', 'MYK9-1008 fixture club ' || '00000000-0000-0000-0000-000000822021');
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (
  '00000000-0000-0000-0000-000000822021',
  'MYK9-822 Blocking Entries Show',
  'AKC',
  current_date,
  current_date,
  'published',
  '00000000-0000-0000-0000-000000822021'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000822031',
  '00000000-0000-0000-0000-000000822021',
  'MYK9-822 Blocking Entries Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name)
VALUES (
  '00000000-0000-0000-0000-000000822041',
  '00000000-0000-0000-0000-000000822031',
  'MYK9-822 Blocking Entries Class'
);

-- Four dogs, one per scenario, all owned by the same person so the
-- authorization arm being tested is only "which dog", never "which owner".
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000822051',
    'Clean',
    'Border Collie',
    '00000000-0000-0000-0000-000000822011'
  ),
  (
    '00000000-0000-0000-0000-000000822052',
    'Paid Up',
    'Border Collie',
    '00000000-0000-0000-0000-000000822011'
  ),
  (
    '00000000-0000-0000-0000-000000822053',
    'Already Scored',
    'Border Collie',
    '00000000-0000-0000-0000-000000822011'
  ),
  (
    '00000000-0000-0000-0000-000000822054',
    'Marked Absent',
    'Border Collie',
    '00000000-0000-0000-0000-000000822011'
  );

-- trg_entries_require_dog_registration needs a registration matching the
-- trial's registry, which defaults to AKC.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES
  ('00000000-0000-0000-0000-000000822051', 'AKC', 'SW822001', 'Clean Formally'),
  ('00000000-0000-0000-0000-000000822052', 'AKC', 'SW822002', 'Paid Up Formally'),
  ('00000000-0000-0000-0000-000000822053', 'AKC', 'SW822003', 'Already Scored Formally'),
  ('00000000-0000-0000-0000-000000822054', 'AKC', 'SW822004', 'Marked Absent Formally');

-- The clean dog's entry is LIVE but accounted for nowhere: pending payment,
-- not scored, no result. It must not count, proving the RPC returns a real
-- zero rather than "no entries exist".
INSERT INTO public.entries (id, class_id, dog_id, payment_status, is_scored)
VALUES (
  '00000000-0000-0000-0000-000000822081',
  '00000000-0000-0000-0000-000000822041',
  '00000000-0000-0000-0000-000000822051',
  'pending',
  false
);

INSERT INTO public.entries (id, class_id, dog_id, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000822082',
  '00000000-0000-0000-0000-000000822041',
  '00000000-0000-0000-0000-000000822052',
  'paid'
);

INSERT INTO public.entries (id, class_id, dog_id, payment_status, is_scored)
VALUES (
  '00000000-0000-0000-0000-000000822083',
  '00000000-0000-0000-0000-000000822041',
  '00000000-0000-0000-0000-000000822053',
  'pending',
  true
);

-- The MYK9-799/822 case: a settled result WITHOUT is_scored ever being set.
-- The old client-side PostgREST filter could not name result_status at all
-- (403 on the whole request) and so read this as "not blocking"; the RPC
-- must not repeat that mistake.
INSERT INTO public.entries (id, class_id, dog_id, payment_status, is_scored, result_status)
VALUES (
  '00000000-0000-0000-0000-000000822084',
  '00000000-0000-0000-0000-000000822041',
  '00000000-0000-0000-0000-000000822054',
  'pending',
  false,
  'absent'
);

DO $$
DECLARE
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_count integer;
BEGIN
  SELECT coalesce(bool_or(grant_row.grantee = 0), false)
    INTO v_public_execute
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(p.proacl) grant_row
  WHERE p.oid = 'public.count_blocking_entries_by_dog(uuid)'::regprocedure
    AND grant_row.privilege_type = 'EXECUTE';
  v_anon_execute := has_function_privilege(
    'anon', 'public.count_blocking_entries_by_dog(uuid)', 'EXECUTE');
  v_authenticated_execute := has_function_privilege(
    'authenticated', 'public.count_blocking_entries_by_dog(uuid)', 'EXECUTE');

  IF v_public_execute THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute count_blocking_entries_by_dog';
  END IF;
  IF v_anon_execute THEN
    RAISE EXCEPTION 'FAIL anon can execute count_blocking_entries_by_dog';
  END IF;
  IF NOT v_authenticated_execute THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute count_blocking_entries_by_dog';
  END IF;
  RAISE NOTICE 'PASS count_blocking_entries_by_dog execution is authenticated-only';
END;
$$;

-- Every authenticated call below runs as the OWNER, not a superuser: the
-- function gates on get_my_person_id(), so a fixture that skipped this would
-- exercise nothing about the authorization it claims to test.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000822101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000822101","role":"authenticated"}',
  true
);

DO $$
DECLARE
  v_count integer;
BEGIN
  v_count := public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822051');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL clean dog counted % blocking entries, expected 0', v_count;
  END IF;
  RAISE NOTICE 'PASS a live but unaccounted-for entry does not block';

  v_count := public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822052');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL paid dog counted %, expected 1', v_count;
  END IF;
  RAISE NOTICE 'PASS a paid entry blocks';

  v_count := public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822053');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL scored dog counted %, expected 1', v_count;
  END IF;
  RAISE NOTICE 'PASS a scored entry blocks';

  v_count := public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822054');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL absent-but-unscored dog counted %, expected 1', v_count;
  END IF;
  RAISE NOTICE 'PASS a settled result_status blocks even when is_scored is false (MYK9-799)';
END;
$$;

-- Behavioral parity: everything the RPC says blocks must be exactly what
-- soft_delete_dog itself refuses on, and nothing else. A RAISE aborts the
-- whole function transaction, so each refusal is caught in its own
-- subtransaction or the remaining fixtures go with it.
DO $$
BEGIN
  BEGIN
    PERFORM public.soft_delete_dog('00000000-0000-0000-0000-000000822052');
    RAISE EXCEPTION 'FAIL soft_delete_dog allowed deleting a dog with a paid entry';
  EXCEPTION WHEN sqlstate 'MK002' THEN
    RAISE NOTICE 'PASS soft_delete_dog refuses the same paid dog the RPC counted';
  END;

  BEGIN
    PERFORM public.soft_delete_dog('00000000-0000-0000-0000-000000822053');
    RAISE EXCEPTION 'FAIL soft_delete_dog allowed deleting a dog with a scored entry';
  EXCEPTION WHEN sqlstate 'MK002' THEN
    RAISE NOTICE 'PASS soft_delete_dog refuses the same scored dog the RPC counted';
  END;

  BEGIN
    PERFORM public.soft_delete_dog('00000000-0000-0000-0000-000000822054');
    RAISE EXCEPTION 'FAIL soft_delete_dog allowed deleting a dog with a settled result_status';
  EXCEPTION WHEN sqlstate 'MK002' THEN
    RAISE NOTICE 'PASS soft_delete_dog refuses the same absent-but-unscored dog the RPC counted';
  END;

  -- And the one the RPC said does NOT block must actually be deletable. Still
  -- run as the owner (not yet RESET) so this exercises the same ownership
  -- path as the calls above, not an admin/superuser shortcut.
  PERFORM public.soft_delete_dog('00000000-0000-0000-0000-000000822051');
END;
$$;

-- dogs_select (20260612090000) requires deleted_at IS NULL, so the owner's
-- own SELECT of a dog it just soft-deleted returns ZERO rows under RLS — a
-- scalar subquery over that read is NULL either way, which would make an
-- in-role verification pass on a delete that silently never happened. Verify
-- as the elevated role, after RESET ROLE, exactly like
-- soft_delete_dog_cascade_test.sql does.
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deleted_at FROM public.dogs
      WHERE id = '00000000-0000-0000-0000-000000822051') IS NULL THEN
    RAISE EXCEPTION 'FAIL soft_delete_dog did not delete the dog the RPC counted as clean';
  END IF;
  RAISE NOTICE 'PASS soft_delete_dog accepts the same clean dog the RPC counted as 0';
END;
$$;

-- A non-owner, non-admin caller must be refused a count for a dog it cannot
-- manage, not shown a number for it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000822102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000822102","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822052');
    RAISE EXCEPTION 'FAIL a non-owner received a blocking-entry count';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'PASS a non-owner is refused with SQLSTATE 42501';
  END;
END;
$$;

RESET ROLE;

-- anon has no EXECUTE grant at all, so the refusal happens before the
-- function body — and before get_my_person_id() or any dog lookup — runs.
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.count_blocking_entries_by_dog('00000000-0000-0000-0000-000000822052');
    RAISE EXCEPTION 'FAIL anon received a blocking-entry count';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'FAIL anon denial returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS anon is refused with SQLSTATE 42501 before the function body runs';
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
