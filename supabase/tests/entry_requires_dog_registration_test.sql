-- Behavioral test for 20260828210000_require_dog_registration_for_entries.sql.
--
-- A dog with no registration number must not be able to occupy a capacity spot it
-- cannot compete in. The rule previously lived only in the registration wizard
-- (registrationPrerequisite.ts), so every non-wizard write path -- replication,
-- the API, the seed -- created unregistered entries freely.
--
-- What this asserts, and why each case earns its place:
--   1. An entry for a dog with no registration is REJECTED.
--   2. An entry for a dog registered with the TRIAL'S registry is accepted.
--   3. A dog registered with a DIFFERENT registry is rejected -- the check is
--      registry-scoped, not "has any registration". A rule that accepted any
--      registration would pass a naive test and still let a UKC-only dog into an
--      AKC trial.
--   4. Organization naming drift is tolerated: 'AKC (American Kennel Club)'
--      matches registry 'AKC'. An exact-string match would reject most real rows.
--   5. The conformation-puppy exception still applies.
--   6. A blank/whitespace registration number does not count as a number.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/entry_requires_dog_registration_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-00000000dc01', 'Dog Registration Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES
  ('00000000-0000-0000-0000-00000000d510', 'Registration Gate Show', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-00000000dc01',
   'published', true, true);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  ('00000000-0000-0000-0000-00000000d520',
   '00000000-0000-0000-0000-00000000d510', 'AKC Scent Work Trial',
   current_date + 10, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-00000000d521',
   '00000000-0000-0000-0000-00000000d510', 'Conformation Trial',
   current_date + 11, 'AKC', 'Conformation');

INSERT INTO public.classes (id, trial_id, name, element, level)
VALUES
  ('00000000-0000-0000-0000-00000000d530',
   '00000000-0000-0000-0000-00000000d520', 'Container Novice A', 'Container', 'Novice'),
  ('00000000-0000-0000-0000-00000000d531',
   '00000000-0000-0000-0000-00000000d521', 'Puppy 6-9 Months', 'Puppy', 'Puppy');

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status)
VALUES
  ('00000000-0000-0000-0000-00000000d541', 'Unregistered Dog',   'Nono',  'Beagle', 'active'),
  ('00000000-0000-0000-0000-00000000d542', 'Registered Dog',     'Yep',   'Beagle', 'active'),
  ('00000000-0000-0000-0000-00000000d543', 'Other Registry Dog', 'Ukc',   'Beagle', 'active'),
  ('00000000-0000-0000-0000-00000000d544', 'Drifted Name Dog',   'Drift', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-00000000d545', 'Blank Number Dog',   'Blank', 'Beagle', 'active');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-00000000d542', 'AKC', 'SR11111111', true),
  ('00000000-0000-0000-0000-00000000d543', 'UKC', 'P111-1111', true),
  ('00000000-0000-0000-0000-00000000d544', 'AKC (American Kennel Club)', 'SR22222222', true),
  ('00000000-0000-0000-0000-00000000d545', 'AKC', '   ', true);

DO $$
DECLARE
  scent_class  uuid := '00000000-0000-0000-0000-00000000d530';
  puppy_class  uuid := '00000000-0000-0000-0000-00000000d531';
  show_id      uuid := '00000000-0000-0000-0000-00000000d510';
  scent_trial  uuid := '00000000-0000-0000-0000-00000000d520';
  puppy_trial  uuid := '00000000-0000-0000-0000-00000000d521';
  rejected     boolean;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. No registration at all -> rejected.
  ----------------------------------------------------------------------------
  rejected := false;
  BEGIN
    INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
    VALUES ('00000000-0000-0000-0000-00000000d541', scent_class, show_id, scent_trial, 'confirmed');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL an unregistered dog was allowed to enter';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Registered with the trial's registry -> accepted.
  ----------------------------------------------------------------------------
  INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
  VALUES ('00000000-0000-0000-0000-00000000d542', scent_class, show_id, scent_trial, 'confirmed');

  ----------------------------------------------------------------------------
  -- 3. Registered with a DIFFERENT registry -> rejected. The check is
  --    registry-scoped, not "holds any registration".
  ----------------------------------------------------------------------------
  rejected := false;
  BEGIN
    INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
    VALUES ('00000000-0000-0000-0000-00000000d543', scent_class, show_id, scent_trial, 'confirmed');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL a UKC-only dog was allowed into an AKC trial';
  END IF;

  ----------------------------------------------------------------------------
  -- 4. Organization naming drift is tolerated.
  ----------------------------------------------------------------------------
  INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
  VALUES ('00000000-0000-0000-0000-00000000d544', scent_class, show_id, scent_trial, 'confirmed');

  ----------------------------------------------------------------------------
  -- 5. Conformation puppy classes may be entered before registration completes.
  ----------------------------------------------------------------------------
  INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
  VALUES ('00000000-0000-0000-0000-00000000d541', puppy_class, show_id, puppy_trial, 'confirmed');

  ----------------------------------------------------------------------------
  -- 6. A whitespace-only registration number is not a number.
  ----------------------------------------------------------------------------
  rejected := false;
  BEGIN
    INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
    VALUES ('00000000-0000-0000-0000-00000000d545', scent_class, show_id, scent_trial, 'confirmed');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL a blank registration number counted as a registration';
  END IF;

  RAISE NOTICE 'PASS registration required per trial registry, naming drift tolerated, conformation puppy exempt, blank number rejected';
END;
$$;

ROLLBACK;
