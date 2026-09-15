-- MYK9-572: authorized_at gates show publication (a second, independent
-- refusal alongside the Stripe-readiness gate from MYK9-579/20260915195500)
-- and the public club directory (clubs_select). Both DEFAULT to trusted for
-- pre-existing rows (backfilled by the migration); this test creates its own
-- clubs with authorized_at explicitly set/unset per case.
--
-- Conventions match show_publish_gate_trigger_test.sql: run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- An authorized, Stripe-ready club (the control) and an unauthorized club,
-- both Stripe-ready, to isolate the authorization refusal from the Stripe one.
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000572001', 'MYK9-572 Authorized Club', now()),
  ('00000000-0000-0000-0000-000000572002', 'MYK9-572 Unauthorized Club', NULL);

UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000000572001', 'acct_myk9572_authorized', true, true, false),
  ('00000000-0000-0000-0000-000000572002', 'acct_myk9572_unauthorized', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000572010', 'MYK9-572 Authorized Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572001', 'draft'),
  ('00000000-0000-0000-0000-000000572011', 'MYK9-572 Unauthorized Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572002', 'draft');

-- Already-published fixture on the unauthorized club, inserted directly (this
-- trigger is UPDATE-only, mirrors 20260915195500) so it starts published.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000572012', 'MYK9-572 Already Published (unauthorized club)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572002', 'published');

-- ---------------------------------------------------------------------------
-- 1. anon SELECT excludes the unauthorized club, includes the authorized one.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL ROLE anon;

  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL anon-hides-unauthorized: anon could see the unauthorized club';
  END IF;

  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL anon-sees-authorized: anon could not see the authorized club';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS anon-select: excludes unauthorized, includes authorized';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The creator / club_admin of the unauthorized club can still select it
--    (mirrors trg_grant_club_admin_to_club_creator's grant).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_user_id uuid := gen_random_uuid();
  v_person_id uuid := gen_random_uuid();
  v_role_id uuid;
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person_id, v_auth_user_id, 'MYK9-572', 'ClubAdmin', 'myk9572-admin@example.test');

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';

  INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
  VALUES (v_person_id, v_role_id, '00000000-0000-0000-0000-000000572002', NULL, true, now(), v_person_id, v_auth_user_id);

  PERFORM set_config('myk9572.admin_auth_user_id', v_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL creator-sees-own-unauthorized-club: club_admin of the unauthorized club could not see it';
  END IF;
  RAISE NOTICE 'PASS creator-sees-own-unauthorized-club';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Publishing a show for the unauthorized club is refused with MK004,
--    even though its Stripe account is fully ready.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000572011';
    RAISE EXCEPTION 'FAIL unauthorized-publish: publish succeeded for an unauthorized club';
  EXCEPTION WHEN SQLSTATE 'MK004' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;
  IF v_message !~* 'authorized' THEN
    RAISE EXCEPTION 'FAIL unauthorized-publish: unexpected message %', v_message;
  END IF;
  RAISE NOTICE 'PASS unauthorized-publish: refused with MK004 and the authorization message';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Once authorized (and already Stripe-ready), the same publish succeeds.
-- ---------------------------------------------------------------------------
UPDATE public.clubs SET authorized_at = now() WHERE id = '00000000-0000-0000-0000-000000572002';

DO $$
DECLARE
  v_status text;
BEGIN
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000572011';

  SELECT status INTO v_status FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000572011';

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL now-authorized-publish: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS now-authorized-publish: publish succeeds once authorized AND Stripe-ready';
END;
$$;

-- Revert back to unauthorized for the remaining cases.
UPDATE public.clubs SET authorized_at = NULL WHERE id = '00000000-0000-0000-0000-000000572002';

-- ---------------------------------------------------------------------------
-- 5. An already-published show on a club that becomes/stays unauthorized
--    still accepts an unrelated edit (never retroactive).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
  v_status text;
BEGIN
  UPDATE public.shows
     SET status = 'published', name = 'MYK9-572 Already Published (unauthorized club, renamed)'
   WHERE id = '00000000-0000-0000-0000-000000572012';

  SELECT name, status INTO v_name, v_status FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000572012';

  IF v_status <> 'published' OR v_name <> 'MYK9-572 Already Published (unauthorized club, renamed)' THEN
    RAISE EXCEPTION 'FAIL already-published-unrelated-edit: edit did not land (name=%, status=%)', v_name, v_status;
  END IF;
  RAISE NOTICE 'PASS already-published-unrelated-edit: never re-gated, even for an unauthorized club';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. set_club_authorization: a non-site-admin caller gets 42501.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_user_id uuid := gen_random_uuid();
  v_person_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person_id, v_auth_user_id, 'MYK9-572', 'NonAdmin', 'myk9572-nonadmin@example.test');

  PERFORM set_config('myk9572.nonadmin_auth_user_id', v_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.nonadmin_auth_user_id'), true);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572002', true);
    RAISE EXCEPTION 'FAIL non-admin-refused: a non-site-admin was allowed to authorize a club';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS non-admin-refused: 42501';
  END;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. A site admin's call succeeds and writes a permission_audit_log row.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_user_id uuid := gen_random_uuid();
  v_person_id uuid := gen_random_uuid();
  v_role_id uuid;
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person_id, v_auth_user_id, 'MYK9-572', 'SiteAdmin', 'myk9572-siteadmin@example.test');

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'site_admin';

  INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
  VALUES (v_person_id, v_role_id, NULL, NULL, true, now(), v_person_id, v_auth_user_id);

  PERFORM set_config('myk9572.siteadmin_auth_user_id', v_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.siteadmin_auth_user_id'), true);

DO $$
BEGIN
  PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572002', true);
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_authorized_at timestamptz;
  v_audit_count integer;
BEGIN
  SELECT authorized_at INTO v_authorized_at FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_authorized_at IS NULL THEN
    RAISE EXCEPTION 'FAIL site-admin-authorizes: authorized_at was not set';
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.permission_audit_log
   WHERE action = 'club_authorized'
     AND target_type = 'club'
     AND target_id = '00000000-0000-0000-0000-000000572002';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL site-admin-authorizes: expected 1 permission_audit_log row, found %', v_audit_count;
  END IF;

  RAISE NOTICE 'PASS site-admin-authorizes: authorized_at set and permission_audit_log written';
END;
$$;

ROLLBACK;
