-- MYK9-639 / MYK9-640: behavioral test for public.move_up_entry and
-- public.reverse_move_up_entry (20260918193300_myk9_639_move_up_supersession.sql).
--
-- These are SECURITY DEFINER functions owned by `postgres`, which carries
-- rolbypassrls -- so RLS does not run inside them and the only authorization is
-- the `can_manage_show` they restate by hand. That is exactly the class of
-- object this repo already covers with a behavioral test
-- (withdraw_own_entry_test.sql, withdraw_or_pull_own_entry_test.sql,
-- judge_qualification_rpc_authorization_test.sql), and round 1 of this PR's
-- review found a real cross-show escalation in the reverse. Without a test the
-- next refactor reintroduces it silently.
--
-- Asserts:
--   1. A secretary appointed only to Club A cannot move an entry on Club B's
--      show (restated can_manage_show on the SOURCE).
--   2. Club A's secretary CAN move up inside their own show, and the
--      destination is created MONEY-NEUTRAL: payment_status 'pending',
--      entry_fee 0, no payment_method, no stripe_payment_intent_id -- while
--      is_day_of_show, entry_source, registration_id, the armband and the
--      approval state all travel, and check_in_status travels only as a
--      check-in.
--   3b. A source whose run has already STARTED is refused -- moving it would
--      vacate its result from the class it was earned in.
--   3. A STRIPE-PAID source moves without tripping
--      trg_entries_protect_payment_fields_insert (the round-1 P0). This is the
--      positive control for the money-neutral design: if the INSERT ever names
--      a payment column again, this step raises 42501 and the file fails.
--   4. reverse_move_up_entry refuses a source in a show the caller does not
--      manage -- the round-1 defect, pinned.
--   5. reverse_move_up_entry refuses once the run has STARTED (an area time
--      alone, with is_scored false and result_status still 'pending').
--   6. The full round trip: move up -> move back -> move up AGAIN into the same
--      class. The second move-up is what the relaxed
--      entries_dog_class_unique_idx exists for; under the old predicate the
--      tombstone the reverse leaves made it die 23505.
--   7. Moving a dog into a class they already hold a live entry in is refused
--      in words (22023), not as raw constraint text.
--   8. EXECUTE is revoked from PUBLIC and anon on both functions.
--   9. A 'move-up-requested' source does NOT carry that status onto the
--      destination -- the request is fulfilled by the move, not re-queued.
--  10. A round trip keeps an 'at-gate' check-in and does not renumber the
--      armband (the reverse re-arms auto_assign_armband_on_accept).
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database;
-- every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/move_up_supersession_test.sql

begin;

-- Schema-only isolated databases have no seed data.
insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000000639801', 'secretary', 'MYK9-639 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000639001', 'MYK9-639 Club A'),
  ('00000000-0000-0000-0000-000000639002', 'MYK9-639 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
values
  ('00000000-0000-0000-0000-000000639011', 'MYK9-639 Show A', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000639001',
   'published', true, true),
  ('00000000-0000-0000-0000-000000639012', 'MYK9-639 Show B', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000639002',
   'published', true, true);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000000639021', '00000000-0000-0000-0000-000000639011',
   'MYK9-639 Trial A', current_date + 10, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000639022', '00000000-0000-0000-0000-000000639012',
   'MYK9-639 Trial B', current_date + 10, 'AKC', 'Scent Work');

-- Novice -> Advanced in Show A; one class in Show B for the cross-show cases.
insert into public.classes (id, trial_id, name, element, level)
values
  ('00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639021',
   'Container Novice A', 'Container', 'Novice'),
  ('00000000-0000-0000-0000-000000639032', '00000000-0000-0000-0000-000000639021',
   'Container Advanced A', 'Container', 'Advanced'),
  ('00000000-0000-0000-0000-000000639033', '00000000-0000-0000-0000-000000639021',
   'Container Excellent A', 'Container', 'Excellent'),
  ('00000000-0000-0000-0000-000000639034', '00000000-0000-0000-0000-000000639022',
   'Container Novice B', 'Container', 'Novice'),
  ('00000000-0000-0000-0000-000000639035', '00000000-0000-0000-0000-000000639022',
   'Container Advanced B', 'Container', 'Advanced');

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
insert into public.dogs (id, name, call_name, breed, status)
values
  ('00000000-0000-0000-0000-000000639041', 'MYK9-639 Dog', 'Acorn', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639042', 'MYK9-639 Online Dog', 'Pip', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639043', 'MYK9-639 Club B Dog', 'Rook', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639044', 'MYK9-639 Request Dog', 'Juno', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639045', 'MYK9-639 Dupe Dog', 'Wren', 'Beagle', 'active');

-- Every trial is AKC, so one registration each satisfies
-- trg_entries_require_dog_registration for every INSERT below.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000639041', 'AKC', 'SR6390001', true),
  ('00000000-0000-0000-0000-000000639042', 'AKC', 'SR6390002', true),
  ('00000000-0000-0000-0000-000000639043', 'AKC', 'SR6390003', true),
  ('00000000-0000-0000-0000-000000639044', 'AKC', 'SR6390004', true),
  ('00000000-0000-0000-0000-000000639045', 'AKC', 'SR6390005', true);

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000639051', 'Club A', 'Secretary',
   '00000000-0000-0000-0000-000000639151'),
  ('00000000-0000-0000-0000-000000639052', 'Club B', 'Secretary',
   '00000000-0000-0000-0000-000000639152');

-- Club-scoped appointments (ur.show_id IS NULL), matching is_trial_secretary().
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000639051', id, '00000000-0000-0000-0000-000000639001',
  true, '00000000-0000-0000-0000-000000639151'
from public.roles where name = 'secretary';

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000639052', id, '00000000-0000-0000-0000-000000639002',
  true, '00000000-0000-0000-0000-000000639152'
from public.roles where name = 'secretary';

-- The source entries.
--
-- SET LOCAL ROLE service_role, because 639062 is the Stripe-paid fixture and
-- `trg_entries_protect_payment_fields_insert` raises 42501 on
-- `payment_method='online' AND payment_status='paid'` for EVERY role but that
-- one. The runner connects with no SET ROLE at all, so `current_setting('role')`
-- reads 'none' and the trigger fires -- aborting this file under
-- ON_ERROR_STOP and taking every test file registered after it down with it
-- (the runner stops at the first failure). Eight other files in this directory
-- use the same idiom for the same reason.
SET LOCAL ROLE service_role;

insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, check_in_status,
  payment_status, payment_method, entry_fee, armband, is_day_of_show, entry_source
)
values
  ('00000000-0000-0000-0000-000000639061', '00000000-0000-0000-0000-000000639041',
   '00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639011',
   '00000000-0000-0000-0000-000000639021', 'confirmed', 'checked-in',
   'paid', 'check', 35.00, '100', true, 'ukc_online'),
  ('00000000-0000-0000-0000-000000639062', '00000000-0000-0000-0000-000000639042',
   '00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639011',
   '00000000-0000-0000-0000-000000639021', 'confirmed', 'no-status',
   'paid', 'online', 35.00, '101', false, 'myk9'),
  ('00000000-0000-0000-0000-000000639063', '00000000-0000-0000-0000-000000639043',
   '00000000-0000-0000-0000-000000639034', '00000000-0000-0000-0000-000000639012',
   '00000000-0000-0000-0000-000000639022', 'confirmed', 'no-status',
   'paid', 'check', 35.00, '102', false, 'myk9'),
  -- The approve-a-move-up-request flow's own starting state.
  ('00000000-0000-0000-0000-000000639065', '00000000-0000-0000-0000-000000639044',
   '00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639011',
   '00000000-0000-0000-0000-000000639021', 'move-up-requested', 'no-status',
   'paid', 'check', 35.00, '103', false, 'myk9'),
  -- A dog who ALREADY holds a live entry in Excellent, plus a Novice entry to
  -- move in from -- so the duplicate pre-check is reached rather than the
  -- "already in this class" guard that precedes it.
  ('00000000-0000-0000-0000-000000639066', '00000000-0000-0000-0000-000000639045',
   '00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639011',
   '00000000-0000-0000-0000-000000639021', 'confirmed', 'no-status',
   'paid', 'check', 35.00, '104', false, 'myk9'),
  ('00000000-0000-0000-0000-000000639067', '00000000-0000-0000-0000-000000639045',
   '00000000-0000-0000-0000-000000639033', '00000000-0000-0000-0000-000000639011',
   '00000000-0000-0000-0000-000000639021', 'confirmed', 'no-status',
   'paid', 'check', 35.00, '104', false, 'myk9');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 1. A secretary of Club A cannot move an entry on Club B's show.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000639151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.move_up_entry(
      '00000000-0000-0000-0000-000000639063',
      '00000000-0000-0000-0000-000000639035',
      '00000000-0000-0000-0000-000000639071'
    );
    RAISE EXCEPTION 'FAIL move_up_entry allowed a cross-club move';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS move_up_entry refuses a show the caller does not manage';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The same secretary CAN move up inside their own show, money-neutral.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_new_id uuid;
  v_dest   public.entries%ROWTYPE;
  v_source public.entries%ROWTYPE;
BEGIN
  v_new_id := public.move_up_entry(
    '00000000-0000-0000-0000-000000639061',
    '00000000-0000-0000-0000-000000639032',
    '00000000-0000-0000-0000-000000639072',
    'Qualified today'
  );

  SELECT * INTO v_dest FROM public.entries WHERE id = v_new_id;
  SELECT * INTO v_source FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639061';

  IF v_dest.payment_status <> 'pending' OR v_dest.entry_fee <> 0 THEN
    RAISE EXCEPTION 'FAIL destination is not money-neutral: % / %',
      v_dest.payment_status, v_dest.entry_fee;
  END IF;
  IF v_dest.payment_method IS NOT NULL OR v_dest.stripe_payment_intent_id IS NOT NULL
     OR COALESCE(v_dest.comped, false) OR COALESCE(v_dest.discount_amount, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL destination carried a payment field forward';
  END IF;
  IF v_dest.moved_from_entry_id <> '00000000-0000-0000-0000-000000639061' THEN
    RAISE EXCEPTION 'FAIL destination does not link back to the source';
  END IF;
  IF v_dest.check_in_status <> 'checked-in' THEN
    RAISE EXCEPTION 'FAIL the check-in did not travel: %', v_dest.check_in_status;
  END IF;
  IF v_dest.is_day_of_show IS DISTINCT FROM true
     OR v_dest.entry_source <> 'ukc_online'
     OR v_dest.armband <> '100' THEN
    RAISE EXCEPTION 'FAIL provenance did not travel: % / % / %',
      v_dest.is_day_of_show, v_dest.entry_source, v_dest.armband;
  END IF;
  IF v_dest.entry_status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL the approval state did not travel: %', v_dest.entry_status;
  END IF;
  IF v_source.entry_status <> 'moved' THEN
    RAISE EXCEPTION 'FAIL the source was not superseded: %', v_source.entry_status;
  END IF;
  IF v_source.payment_status <> 'paid' OR v_source.entry_fee <> 35.00 THEN
    RAISE EXCEPTION 'FAIL the money left the source';
  END IF;

  RAISE NOTICE 'PASS move_up_entry supersedes without moving money';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Positive control: a STRIPE-PAID source moves. If the INSERT ever names a
--    payment column again, trg_entries_protect_payment_fields_insert raises
--    42501 here and this file fails.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_new_id uuid;
BEGIN
  v_new_id := public.move_up_entry(
    '00000000-0000-0000-0000-000000639062',
    '00000000-0000-0000-0000-000000639032',
    '00000000-0000-0000-0000-000000639073'
  );
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'FAIL the Stripe-paid move-up returned no destination';
  END IF;
  RAISE NOTICE 'PASS a Stripe-paid entry can be moved up';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3b. A run that has already STARTED cannot be moved out of its class: marking
--     the source `moved` would vacate its result from the class it was earned
--     in. `completed` passes the approval-dimension guard, so this is a
--     separate refusal.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  is_scored, result_status
)
VALUES ('00000000-0000-0000-0000-000000639064', '00000000-0000-0000-0000-000000639043',
  '00000000-0000-0000-0000-000000639031', '00000000-0000-0000-0000-000000639011',
  '00000000-0000-0000-0000-000000639021', 'completed', 'paid', 35.00,
  true, 'qualified');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000639151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.move_up_entry(
      '00000000-0000-0000-0000-000000639064',
      '00000000-0000-0000-0000-000000639032',
      '00000000-0000-0000-0000-000000639076'
    );
    RAISE EXCEPTION 'FAIL a scored entry was moved out of the class it ran in';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS move_up_entry refuses a run that has already started';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. A dog already entered in the TARGET class is refused in words. Wren holds
--    a live Excellent entry and a Novice one; moving the Novice entry into
--    Excellent reaches the duplicate pre-check, not the "already in this class"
--    guard that precedes it (which is what the earlier version of this case
--    actually hit).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.move_up_entry(
      '00000000-0000-0000-0000-000000639066',
      '00000000-0000-0000-0000-000000639033',
      '00000000-0000-0000-0000-000000639074'
    );
    RAISE EXCEPTION 'FAIL a duplicate class entry was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'FAIL duplicate surfaced as raw 23505 instead of a message';
    WHEN invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message NOT LIKE '%already entered in that class%' THEN
        RAISE EXCEPTION 'FAIL wrong refusal reached: %', v_message;
      END IF;
      RAISE NOTICE 'PASS a duplicate class entry is refused in words';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. A move-up FULFILS a move-up request: the destination must not inherit the
--    request status, or approving it puts the same dog straight back into the
--    pending queue, approvable again and again up the ladder.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_new_id uuid;
  v_dest   public.entries%ROWTYPE;
BEGIN
  v_new_id := public.move_up_entry(
    '00000000-0000-0000-0000-000000639065',
    '00000000-0000-0000-0000-000000639032',
    '00000000-0000-0000-0000-000000639077'
  );

  SELECT * INTO v_dest FROM public.entries WHERE id = v_new_id;
  IF v_dest.entry_status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL the destination inherited the request status: %', v_dest.entry_status;
  END IF;
  RAISE NOTICE 'PASS a move-up request does not survive onto the destination';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The reverse refuses once the run has STARTED. An area time alone, with
--    is_scored false and result_status still 'pending' -- the mid-run case a
--    result-only guard would have missed.
-- ---------------------------------------------------------------------------
RESET ROLE;
UPDATE public.entries SET area1_time_seconds = 12.5
 WHERE id = '00000000-0000-0000-0000-000000639073';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000639151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_move_up_entry('00000000-0000-0000-0000-000000639073');
    RAISE EXCEPTION 'FAIL the reverse ran on a started run';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS reverse_move_up_entry refuses a run that has started';
  END;
END;
$$;

RESET ROLE;
UPDATE public.entries SET area1_time_seconds = 0
 WHERE id = '00000000-0000-0000-0000-000000639073';

-- ---------------------------------------------------------------------------
-- 4. The reverse refuses a SOURCE in a show the caller does not manage.
--    Round 1's defect: the function authorized only the destination's show,
--    and `authenticated` holds table-wide UPDATE on entries with no trigger
--    guarding moved_from_entry_id, so a manager of Show A could point one of
--    their own rows at a `moved` row in Show B and have a definer function
--    flip it live.
-- ---------------------------------------------------------------------------
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee
)
VALUES ('00000000-0000-0000-0000-000000639081', '00000000-0000-0000-0000-000000639043',
  '00000000-0000-0000-0000-000000639035', '00000000-0000-0000-0000-000000639012',
  '00000000-0000-0000-0000-000000639022', 'moved', 'paid', 35.00);

-- A Club A destination pointing at a Club B source.
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  moved_from_entry_id
)
VALUES ('00000000-0000-0000-0000-000000639082', '00000000-0000-0000-0000-000000639041',
  '00000000-0000-0000-0000-000000639033', '00000000-0000-0000-0000-000000639011',
  '00000000-0000-0000-0000-000000639021', 'confirmed', 'pending', 0,
  '00000000-0000-0000-0000-000000639081');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000639151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  v_foreign public.entries%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.reverse_move_up_entry('00000000-0000-0000-0000-000000639082');
    RAISE EXCEPTION 'FAIL the reverse restored an entry in another club''s show';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS reverse_move_up_entry refuses a cross-show source';
  END;

  SELECT * INTO v_foreign FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000000639081';
  IF v_foreign.entry_status <> 'moved' THEN
    RAISE EXCEPTION 'FAIL the other club''s entry was modified: %', v_foreign.entry_status;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. The full round trip: move up -> move back -> move up AGAIN into the same
--    class. The second move-up is what the relaxed unique index exists for.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_restored uuid;
  v_source   public.entries%ROWTYPE;
  v_dest     public.entries%ROWTYPE;
  v_again    uuid;
BEGIN
  v_restored := public.reverse_move_up_entry('00000000-0000-0000-0000-000000639072');
  IF v_restored <> '00000000-0000-0000-0000-000000639061' THEN
    RAISE EXCEPTION 'FAIL the reverse restored the wrong entry: %', v_restored;
  END IF;

  SELECT * INTO v_source FROM public.entries WHERE id = v_restored;
  SELECT * INTO v_dest FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639072';

  IF v_source.entry_status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL the source was not restored: %', v_source.entry_status;
  END IF;
  IF v_source.check_in_status <> 'checked-in' THEN
    RAISE EXCEPTION 'FAIL the live check-in did not come back: %', v_source.check_in_status;
  END IF;
  IF v_source.payment_status <> 'paid' OR v_source.entry_fee <> 35.00 THEN
    RAISE EXCEPTION 'FAIL the reverse touched the money';
  END IF;
  IF v_dest.deleted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the destination was not soft-deleted';
  END IF;

  -- The second move-up into the SAME class. Under the old index predicate the
  -- tombstone above still held the (dog, class) seat and this died 23505.
  v_again := public.move_up_entry(
    '00000000-0000-0000-0000-000000639061',
    '00000000-0000-0000-0000-000000639032',
    '00000000-0000-0000-0000-000000639075'
  );
  IF v_again IS NULL THEN
    RAISE EXCEPTION 'FAIL the second move-up returned no destination';
  END IF;

  RAISE NOTICE 'PASS move up -> move back -> move up again';
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. A round trip must not downgrade the dog's check-in. The forward half
--     narrows everything but 'checked-in' to 'no-status' on the DESTINATION;
--     copying that back verbatim used to leave a dog standing at the gate as
--     'no-status', silently out of the gate queue. It must also not renumber
--     the armband: the reverse's 'moved' -> live transition re-arms
--     auto_assign_armband_on_accept.
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, check_in_status,
  payment_status, entry_fee, armband
)
VALUES ('00000000-0000-0000-0000-000000639068', '00000000-0000-0000-0000-000000639044',
  '00000000-0000-0000-0000-000000639033', '00000000-0000-0000-0000-000000639011',
  '00000000-0000-0000-0000-000000639021', 'confirmed', 'at-gate', 'paid', 35.00, '103');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000639151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000639151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  v_new_id   uuid;
  v_dest     public.entries%ROWTYPE;
  v_restored public.entries%ROWTYPE;
BEGIN
  v_new_id := public.move_up_entry(
    '00000000-0000-0000-0000-000000639068',
    '00000000-0000-0000-0000-000000639032',
    '00000000-0000-0000-0000-000000639078'
  );

  SELECT * INTO v_dest FROM public.entries WHERE id = v_new_id;
  IF v_dest.check_in_status <> 'no-status' THEN
    RAISE EXCEPTION 'FAIL at-gate travelled to the destination: %', v_dest.check_in_status;
  END IF;

  PERFORM public.reverse_move_up_entry(v_new_id);

  SELECT * INTO v_restored FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000000639068';
  IF v_restored.check_in_status <> 'at-gate' THEN
    RAISE EXCEPTION 'FAIL the round trip downgraded the check-in to %',
      v_restored.check_in_status;
  END IF;
  IF v_restored.armband IS DISTINCT FROM '103' THEN
    RAISE EXCEPTION 'FAIL the round trip renumbered the armband to %', v_restored.armband;
  END IF;

  RAISE NOTICE 'PASS a round trip keeps the gate state and the armband';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 8. EXECUTE is revoked from PUBLIC and anon on both functions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.move_up_entry(uuid, uuid, uuid, text)',
    'public.reverse_move_up_entry(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated cannot execute %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS EXECUTE is granted to authenticated and withheld from anon';
END;
$$;

ROLLBACK;
