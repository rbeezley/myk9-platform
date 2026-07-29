-- Behavioral authorization and write-guard test for
-- 20260722160000_add_pull_refund_decisions.sql.
--
-- Run against a database where the migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pull_refund_decision_rls_test.sql
-- The transaction rolls back every fixture. A clean run prints PASS notices.

BEGIN;

-- Seed unlinked people first. handle_new_user() adopts a matching person by
-- email when the auth row is inserted, avoiding duplicate auth_user_id rows.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000811',
    'Pull', 'Secretary', 'pull-secretary@example.test', NULL
  ),
  (
    '00000000-0000-0000-0000-000000000812',
    'Other', 'Club Admin', 'pull-club-admin@example.test', NULL
  );

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pull-secretary@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pull-club-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000821', 'Pull Test Club'),
  ('00000000-0000-0000-0000-000000000822', 'Unrelated Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000831',
    'Managed Pull Show', 'AKC', CURRENT_DATE, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000821'
  ),
  (
    '00000000-0000-0000-0000-000000000832',
    'Clubless Pull Show', 'AKC', CURRENT_DATE, CURRENT_DATE, NULL
  );

-- Paid-online fixture rows must use the same privileged role as the payment
-- service. The authorization assertions below run as authenticated users.
SET LOCAL ROLE service_role;

INSERT INTO public.entries (
  id, show_id, entry_status, payment_method, payment_status, entry_fee
)
VALUES
  (
    '00000000-0000-0000-0000-000000000841',
    '00000000-0000-0000-0000-000000000831',
    'scratched', 'online', 'paid', 25
  ),
  (
    '00000000-0000-0000-0000-000000000842',
    '00000000-0000-0000-0000-000000000831',
    'scratched', 'online', 'paid', 25
  ),
  (
    '00000000-0000-0000-0000-000000000843',
    '00000000-0000-0000-0000-000000000832',
    'scratched', 'online', 'paid', 25
  );

RESET ROLE;

INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000811',
  id,
  '00000000-0000-0000-0000-000000000831',
  true,
  '00000000-0000-0000-0000-000000000801'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000812',
  id,
  '00000000-0000-0000-0000-000000000822',
  true,
  '00000000-0000-0000-0000-000000000802'
FROM public.roles
WHERE name = 'club_admin';

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT public.set_entry_refund_decision(
  '00000000-0000-0000-0000-000000000841',
  'denied'
);

DO $$
DECLARE
  saved_decision text;
  saved_by uuid;
BEGIN
  SELECT refund_decision, refund_decided_by
    INTO saved_decision, saved_by
    FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000000000841';

  IF saved_decision <> 'denied'
     OR saved_by <> '00000000-0000-0000-0000-000000000801' THEN
    RAISE EXCEPTION 'FAIL secretary decision was not persisted with its actor';
  END IF;
  RAISE NOTICE 'PASS show secretary can deny a refund for a managed show';
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE public.entries
       SET refund_decision = 'denied'
     WHERE id = '00000000-0000-0000-0000-000000000842';
    RAISE EXCEPTION 'FAIL direct refund-decision update succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS direct refund-decision update is rejected';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_entry_refund_decision(
      '00000000-0000-0000-0000-000000000841',
      'denied'
    );
    RAISE EXCEPTION 'FAIL unrelated club admin denied a refund';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS unrelated club admin is rejected';
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_entry_refund_decision(
      '00000000-0000-0000-0000-000000000843',
      'denied'
    );
    RAISE EXCEPTION 'FAIL club admin denied a refund for a clubless show';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS clubless show does not broaden club-admin authorization';
  END;
END;
$$;

RESET ROLE;
UPDATE public.entries
   SET entry_status = 'confirmed'
 WHERE id = '00000000-0000-0000-0000-000000000841';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);

DO $$
DECLARE
  saved_decision text;
  saved_at timestamptz;
  saved_by uuid;
BEGIN
  SELECT refund_decision, refund_decided_at, refund_decided_by
    INTO saved_decision, saved_at, saved_by
    FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000000000841';

  IF saved_decision IS NOT NULL OR saved_at IS NOT NULL OR saved_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL reinstated entry retained stale refund-decision metadata';
  END IF;
  RAISE NOTICE 'PASS reinstatement clears the saved refund decision';
END;
$$;

ROLLBACK;
