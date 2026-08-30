-- soft_delete_dog(): what it refuses, and what it must leave nothing live behind.
--
-- The dog_id children are NOT reached by any FK rule here: a soft delete never
-- deletes the dogs row, so `ON DELETE CASCADE` / `SET NULL` never fire and the
-- function is the ONLY thing that cleans up. That is why this is a behavioural
-- test and not a constraint assertion — reading the schema tells you nothing
-- about what actually happens.
--
-- Covered:
--   * a dog with a PAID entry is refused (MK002) and nothing is touched, because
--     the delete would otherwise vanish a paid entry with no refund decision and
--     recompute placements behind a scored one;
--   * armbands are marked available but KEEP dog_id, so a restore or a re-entry
--     reclaims the same number through assign_armband's (show_id, dog_id) fast
--     path — nulling it would make restore_dog lossy;
--   * waitlist spots are DELETED, so a deleted dog cannot be promoted into a
--     live entry;
--   * a RESTORE brings the armband back to assigned. Releasing without this is
--     worse than the stale assignment it replaced: the ringside replication pull
--     filters `is_available = false`, so a restored dog would carry a number the
--     offline store never receives (Codex P1 on #1879).
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES (
  '00000000-0000-0000-0000-000000dd0011',
  'Soft Delete',
  'Owner',
  'soft-delete-dog-owner@example.test'
);

-- `handle_new_user` fires on this insert, adopts the people row BY EMAIL
-- (migration 131) and creates its exhibitor_profiles row — which is what the
-- waitlist fixture below needs an exhibitor_id from.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000dd0101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'soft-delete-dog-owner@example.test', '', now(),
  now(), now(), '{}', '{}', false, false, false
);

INSERT INTO public.shows (id, name, organization, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-000000dd0021',
  'Soft Delete Cascade Show',
  'AKC',
  current_date,
  current_date,
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000dd0031',
  '00000000-0000-0000-0000-000000dd0021',
  'Soft Delete Cascade Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name)
VALUES (
  '00000000-0000-0000-0000-000000dd0041',
  '00000000-0000-0000-0000-000000dd0031',
  'Soft Delete Cascade Class'
);

-- Two dogs: one clean, one carrying a paid entry.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000dd0051',
    'Cascade',
    'Border Collie',
    '00000000-0000-0000-0000-000000dd0011'
  ),
  (
    '00000000-0000-0000-0000-000000dd0052',
    'Paid Up',
    'Border Collie',
    '00000000-0000-0000-0000-000000dd0011'
  );

-- trg_entries_require_dog_registration needs a registration matching the trial's
-- registry, which defaults to AKC.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES (
  '00000000-0000-0000-0000-000000dd0052',
  'AKC',
  'SW999001',
  'Paid Up Formally'
);

INSERT INTO public.entries (id, class_id, dog_id, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000dd0081',
  '00000000-0000-0000-0000-000000dd0041',
  '00000000-0000-0000-0000-000000dd0052',
  'paid'
);

INSERT INTO public.armbands (
  id, show_id, dog_id, armband_number, assigned_at, is_available
)
VALUES (
  '00000000-0000-0000-0000-000000dd0061',
  '00000000-0000-0000-0000-000000dd0021',
  '00000000-0000-0000-0000-000000dd0051',
  '101',
  now(),
  false
);

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position
)
SELECT
  '00000000-0000-0000-0000-000000dd0071',
  '00000000-0000-0000-0000-000000dd0041',
  ep.id,
  '00000000-0000-0000-0000-000000dd0051',
  1
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000dd0101';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE id = '00000000-0000-0000-0000-000000dd0071'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE waitlist row was never created — handle_new_user did not produce an exhibitor_profiles row';
  END IF;
END;
$$;

-- Delete as the dog's OWNER, not as a superuser: the function gates on
-- get_my_person_id(), so a fixture that skipped this would exercise the admin
-- arm and prove nothing about the path exhibitors actually take.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000dd0101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000dd0101","role":"authenticated"}',
  true
);

-- A RAISE aborts the whole function transaction, so the refusal has to be caught
-- in its own subtransaction or the fixtures go with it.
DO $$
BEGIN
  BEGIN
    PERFORM public.soft_delete_dog('00000000-0000-0000-0000-000000dd0052');
    RAISE EXCEPTION 'FAIL deleting a dog with a paid entry succeeded';
  EXCEPTION
    WHEN sqlstate 'MK002' THEN
      RAISE NOTICE 'PASS deleting a dog with a paid entry is refused';
  END;
END;
$$;

SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000dd0051');

RESET ROLE;

DO $$
DECLARE
  v_armband RECORD;
BEGIN
  -- The refusal must leave the blocked dog and its entry completely untouched:
  -- the permission-gated UPDATE runs before the guard, so a non-atomic function
  -- would tombstone the dog and then refuse.
  IF (
    SELECT deleted_at FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-000000dd0052'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the refused delete still tombstoned the dog';
  END IF;
  IF (
    SELECT deleted_at FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000dd0081'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the refused delete still soft-deleted the paid entry';
  END IF;
  RAISE NOTICE 'PASS the refused delete rolled back cleanly';

  IF (
    SELECT deleted_at FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-000000dd0051'
  ) IS NULL THEN
    RAISE EXCEPTION 'FAIL soft_delete_dog did not stamp the unblocked dog';
  END IF;
  RAISE NOTICE 'PASS dog is soft-deleted';

  SELECT dog_id, is_available, assigned_at INTO v_armband
  FROM public.armbands WHERE id = '00000000-0000-0000-0000-000000dd0061';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL the armband row was removed — release is the contract, not delete';
  END IF;
  IF v_armband.is_available IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL the armband is still marked assigned for a deleted dog';
  END IF;
  IF v_armband.assigned_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the released armband kept its assigned_at stamp';
  END IF;
  -- Deliberate: nulling dog_id would destroy the only link back and make
  -- restore_dog lossy. Do not "tidy" this assertion away.
  IF v_armband.dog_id IS DISTINCT FROM '00000000-0000-0000-0000-000000dd0051'::uuid THEN
    RAISE EXCEPTION 'FAIL the armband lost its dog link, so a restore cannot reclaim the number';
  END IF;
  RAISE NOTICE 'PASS armband released with its dog link intact';

  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE dog_id = '00000000-0000-0000-0000-000000dd0051'
  ) THEN
    RAISE EXCEPTION 'FAIL a deleted dog is still queued on a waitlist';
  END IF;
  RAISE NOTICE 'PASS waitlist spot removed';
END;
$$;

-- restore_dog is platform-admin gated, and the fixture owner is not one, so the
-- restore runs as the migration role rather than through another JWT.
SELECT public.restore_dog('00000000-0000-0000-0000-000000dd0051');

DO $$
DECLARE
  v_armband RECORD;
BEGIN
  SELECT dog_id, is_available, assigned_at INTO v_armband
  FROM public.armbands WHERE id = '00000000-0000-0000-0000-000000dd0061';

  IF v_armband.is_available IS NOT FALSE THEN
    RAISE EXCEPTION
      'FAIL a restored dog keeps a number the ringside replication pull filters out';
  END IF;
  IF v_armband.assigned_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the reclaimed armband has no assigned_at stamp';
  END IF;
  IF v_armband.dog_id IS DISTINCT FROM '00000000-0000-0000-0000-000000dd0051'::uuid THEN
    RAISE EXCEPTION 'FAIL the reclaimed armband is not the restored dog''s';
  END IF;
  RAISE NOTICE 'PASS restore reclaims the armband as assigned';
END;
$$;

ROLLBACK;
