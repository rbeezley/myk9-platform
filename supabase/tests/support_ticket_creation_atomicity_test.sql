-- MYK9-320 behavioural contract: create_support_ticket is atomic.
--
-- The RPC inserts the parent ticket before its first message. This test forces
-- the message insert to fail and proves that the parent insert is rolled back.
-- It also keeps a successful call as a positive control, so a function that
-- always fails cannot satisfy the rollback assertion.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/support_ticket_creation_atomicity_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000320101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-320-owner@example.test', '', now(),
  now(), now(), '{}', '{}', false, false, false
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000320101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000320101',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

DO $$
DECLARE
  v_owner_id CONSTANT uuid := '00000000-0000-0000-0000-000000320101';
  created_ticket uuid;
  message_count integer;
  ticket_count integer;
  error_code text;
BEGIN
  -- Positive control: both rows are created by the RPC.
  SELECT id
  INTO created_ticket
  FROM public.create_support_ticket(
    v_owner_id,
    'MYK9-320 successful control',
    '{}'::jsonb,
    NULL,
    false,
    'The successful control message.'
  );

  SELECT count(*) INTO message_count
  FROM public.support_ticket_messages
  WHERE ticket_id = created_ticket;

  IF created_ticket IS NULL OR message_count <> 1 THEN
    RAISE EXCEPTION
      'FAIL positive control: expected one ticket and one message, got ticket % and % messages',
      created_ticket, message_count;
  END IF;

  -- The empty body passes the RPC's first insert but violates the message
  -- table's body check on the second insert. The whole RPC must roll back.
  BEGIN
    PERFORM public.create_support_ticket(
      v_owner_id,
      'MYK9-320 forced rollback',
      '{}'::jsonb,
      NULL,
      false,
      ''
    );
    RAISE EXCEPTION 'FAIL forced message insert unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE;
      IF error_code <> '23514' THEN
        RAISE EXCEPTION 'FAIL unexpected rollback error SQLSTATE %', error_code;
      END IF;
  END;

  SELECT count(*) INTO ticket_count
  FROM public.support_tickets
  WHERE support_tickets.owner_id = v_owner_id
    AND subject = 'MYK9-320 forced rollback';

  IF ticket_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL atomic rollback: % orphan ticket row(s) remained after message failure',
      ticket_count;
  END IF;
END;
$$;

ROLLBACK;
