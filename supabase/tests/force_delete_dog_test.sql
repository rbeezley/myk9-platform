-- force_delete_dog(): who may override the MK002 refusal, and what the override
-- must still clean up.
--
-- This is the admin escape hatch from soft_delete_dog's paid/scored refusal
-- (migration 20260915214500). Two properties matter and neither is visible in
-- the schema:
--
--   * It is ADMIN-ONLY. The owner of the dog — who may delete it via
--     soft_delete_dog — must be refused here, or the guard the whole feature
--     exists to protect is bypassable by the person it constrains.
--   * It still performs the FULL cascade. An override that skipped the waitlist
--     delete would leave a deleted dog promotable into a live entry, which is
--     the exact bug 20260830140000 fixed for the ordinary path.
--
-- Deliberately asserted: the paid entry IS soft-deleted and no refund is
-- recorded. That is the agreed behaviour, not an oversight — see the migration
-- header. If a future change starts issuing refunds here, this test should fail
-- and be updated on purpose.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (
    '00000000-0000-0000-0000-0000000fd011',
    'Force Delete',
    'Owner',
    'force-delete-dog-owner@example.test'
  ),
  (
    '00000000-0000-0000-0000-0000000fd012',
    'Force Delete',
    'Admin',
    'force-delete-dog-admin@example.test'
  );

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-0000000fd101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'force-delete-dog-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-0000000fd102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'force-delete-dog-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

-- Make the second user a site_admin: is_platform_admin() -> is_site_admin()
-- reads user_roles joined to roles by name.
INSERT INTO public.user_roles (auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-0000000fd102', r.id, true
FROM public.roles r
WHERE r.name = 'site_admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-0000000fd102'
      AND r.name = 'site_admin'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE no site_admin role row was created — the admin arm below would pass vacuously';
  END IF;
END;
$$;

INSERT INTO public.shows (id, name, organization, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-0000000fd021',
  'Force Delete Show',
  'AKC',
  current_date,
  current_date,
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-0000000fd031',
  '00000000-0000-0000-0000-0000000fd021',
  'Force Delete Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name)
VALUES (
  '00000000-0000-0000-0000-0000000fd041',
  '00000000-0000-0000-0000-0000000fd031',
  'Force Delete Class'
);

INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES (
  '00000000-0000-0000-0000-0000000fd051',
  'Paid Up',
  'Border Collie',
  '00000000-0000-0000-0000-0000000fd011'
);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES (
  '00000000-0000-0000-0000-0000000fd051',
  'AKC',
  'SW999101',
  'Paid Up Formally'
);

INSERT INTO public.entries (id, class_id, dog_id, payment_status)
VALUES (
  '00000000-0000-0000-0000-0000000fd081',
  '00000000-0000-0000-0000-0000000fd041',
  '00000000-0000-0000-0000-0000000fd051',
  'paid'
);

INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position)
SELECT
  '00000000-0000-0000-0000-0000000fd071',
  '00000000-0000-0000-0000-0000000fd041',
  ep.id,
  '00000000-0000-0000-0000-0000000fd051',
  1
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-0000000fd101';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE id = '00000000-0000-0000-0000-0000000fd071'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE waitlist row was never created — the cascade assertion below would pass vacuously';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The dog's OWNER must be refused. They can soft-delete their own dog, so
--    without this the override is reachable by exactly the people the MK002
--    guard is meant to stop.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd101","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');
    RAISE EXCEPTION 'FAIL the dog owner was allowed to force-delete';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'PASS a non-admin owner is refused 42501';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT deleted_at FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-0000000fd051'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the refused override still tombstoned the dog';
  END IF;
  RAISE NOTICE 'PASS the refused override left the dog untouched';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. A site admin succeeds over the paid entry, and the cascade still runs.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd102","role":"authenticated"}',
  true
);

SELECT public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');

RESET ROLE;

DO $$
DECLARE
  v_dog_deleted_at timestamptz;
  v_entry_deleted_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_dog_deleted_at
  FROM public.dogs WHERE id = '00000000-0000-0000-0000-0000000fd051';

  IF v_dog_deleted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the admin override did not tombstone the dog';
  END IF;
  RAISE NOTICE 'PASS admin override soft-deleted the dog over a paid entry';

  SELECT deleted_at INTO v_entry_deleted_at
  FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000fd081';

  IF v_entry_deleted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the paid entry survived the override; the cascade did not run';
  END IF;
  RAISE NOTICE 'PASS the paid entry was soft-deleted (no refund is issued — deliberate)';

  -- restore_dog re-links entries by matching the dog's deleted_at exactly. Both
  -- UPDATEs read NOW(), which is transaction-start time, so these MUST be equal
  -- — if they ever diverge, a force-deleted dog restores without its entries.
  IF v_entry_deleted_at IS DISTINCT FROM v_dog_deleted_at THEN
    RAISE EXCEPTION
      'FAIL dog and entry deleted_at differ (% vs %); restore_dog would not re-link the entries',
      v_dog_deleted_at, v_entry_deleted_at;
  END IF;
  RAISE NOTICE 'PASS dog and entry share a deleted_at, so restore_dog can re-link them';

  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE dog_id = '00000000-0000-0000-0000-0000000fd051'
  ) THEN
    RAISE EXCEPTION 'FAIL a force-deleted dog is still queued on a waitlist';
  END IF;
  RAISE NOTICE 'PASS waitlist spot removed by the override';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. An already-deleted dog raises P0002 rather than silently reporting success.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd102","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');
    RAISE EXCEPTION 'FAIL re-deleting an already-deleted dog reported success';
  EXCEPTION
    WHEN sqlstate 'P0002' THEN
      RAISE NOTICE 'PASS re-deleting an already-deleted dog raises P0002';
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
