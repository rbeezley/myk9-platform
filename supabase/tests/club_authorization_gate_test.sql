-- MYK9-572: authorized_at gates show publication (a second, independent
-- refusal alongside the Stripe-readiness gate from MYK9-579/20260915195500)
-- and the public club directory (clubs_select). Both DEFAULT to trusted for
-- pre-existing rows (backfilled by the migration); this test creates its own
-- clubs with authorized_at explicitly set/unset per case.
--
-- Conventions match show_publish_gate_trigger_test.sql: run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.
--
-- platform_settings writes below go through SET LOCAL ROLE service_role —
-- the table's own write-guard trigger (trg_guard_platform_settings_write,
-- 20260615180000) refuses an UPDATE from any role that is neither a site
-- admin nor service_role, and the psql role this test connects as is neither.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- An authorized, Stripe-ready club (the control) and an unauthorized club,
-- both Stripe-ready, to isolate the authorization refusal from the Stripe one.
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000572001', 'MYK9-572 Authorized Club', now()),
  ('00000000-0000-0000-0000-000000572002', 'MYK9-572 Unauthorized Club', NULL);

SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000000572001', 'acct_myk9572_authorized', true, true, false),
  ('00000000-0000-0000-0000-000000572002', 'acct_myk9572_unauthorized', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000572010', 'MYK9-572 Authorized Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572001', 'draft'),
  ('00000000-0000-0000-0000-000000572011', 'MYK9-572 Unauthorized Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572002', 'draft');

-- ---------------------------------------------------------------------------
-- Shared secretary/club_admin identity for club 002, created EARLY so both
-- the fixture build below and every publish case (3, 3b, 4, 5) can exercise
-- the REAL gate as a PostgREST-shaped `authenticated` caller instead of the
-- plain-postgres session, which the API-roles-only carve-out (see
-- 20260915221500's header) bypasses entirely. Reused by case 2's
-- visibility check too (see that section) rather than creating a second,
-- duplicate identity.
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
  PERFORM set_config('myk9572.admin_person_id', v_person_id::text, false);
END;
$$;

-- Already-published fixture on the unauthorized club. The trigger is
-- UPDATE-only (mirrors 20260915195500), so this cannot be INSERTed straight
-- into 'published' for a club that is unauthorized right now. Insert as
-- draft, authorize the club, publish it (as the real club_admin, so the
-- gate actually runs instead of being bypassed), then revoke authorization
-- again — this exercises the never-retroactive rule for real instead of
-- assuming an already-published row can be inserted directly.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000572012', 'MYK9-572 Already Published (unauthorized club)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572002', 'draft');

UPDATE public.clubs SET authorized_at = now() WHERE id = '00000000-0000-0000-0000-000000572002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);
UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000572012';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

UPDATE public.clubs SET authorized_at = NULL WHERE id = '00000000-0000-0000-0000-000000572002';

-- ---------------------------------------------------------------------------
-- 1. anon SELECT excludes the unauthorized club, includes the authorized
--    one, and does not error (the P0 regression: a clubs_select predicate
--    that references public.club_members directly gets ACL-checked at
--    executor start regardless of OR short-circuiting, and anon has no
--    SELECT on club_members — 403 on every anon read of clubs, not just the
--    unauthorized row).
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
  RAISE NOTICE 'PASS anon-select: excludes unauthorized, includes authorized, no error';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL anon-select: anon SELECT on clubs raised % (%)', SQLERRM, SQLSTATE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The creator / club_admin of the unauthorized club can still select it
--    (mirrors trg_grant_club_admin_to_club_creator's grant).
-- ---------------------------------------------------------------------------
-- Reuses the shared club-002 admin identity created above (top of file),
-- instead of inserting a second, duplicate one.
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
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 2b. A club_admin of a DIFFERENT club cannot see the unauthorized club, and
--     an authenticated exhibitor with no relationship to it cannot either
--     (negative controls in the authenticated role, not only anon).
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000572003', 'MYK9-572 Other Club', now());

DO $$
DECLARE
  v_auth_user_id uuid := gen_random_uuid();
  v_person_id uuid := gen_random_uuid();
  v_role_id uuid;
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person_id, v_auth_user_id, 'MYK9-572', 'OtherClubAdmin', 'myk9572-otheradmin@example.test');

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';

  INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
  VALUES (v_person_id, v_role_id, '00000000-0000-0000-0000-000000572003', NULL, true, now(), v_person_id, v_auth_user_id);

  PERFORM set_config('myk9572.otheradmin_auth_user_id', v_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.otheradmin_auth_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL other-club-admin-cannot-see: a club_admin of a DIFFERENT club could see the unauthorized club';
  END IF;
  RAISE NOTICE 'PASS other-club-admin-cannot-see';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_auth_user_id uuid := gen_random_uuid();
  v_person_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person_id, v_auth_user_id, 'MYK9-572', 'Exhibitor', 'myk9572-exhibitor@example.test');

  PERFORM set_config('myk9572.exhibitor_auth_user_id', v_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.exhibitor_auth_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL unrelated-exhibitor-cannot-see: an exhibitor with no relationship to the club could see it';
  END IF;
  RAISE NOTICE 'PASS unrelated-exhibitor-cannot-see';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 2c. An active club_members row (not club_admin) sees the unauthorized
--     club via is_club_member(); a RESIGNED member does not.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_active_auth_user_id uuid := gen_random_uuid();
  v_active_person_id uuid := gen_random_uuid();
  v_resigned_auth_user_id uuid := gen_random_uuid();
  v_resigned_person_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES
    (v_active_person_id, v_active_auth_user_id, 'MYK9-572', 'ActiveMember', 'myk9572-activemember@example.test'),
    (v_resigned_person_id, v_resigned_auth_user_id, 'MYK9-572', 'ResignedMember', 'myk9572-resignedmember@example.test');

  INSERT INTO public.club_members (club_id, person_id, membership_status)
  VALUES
    ('00000000-0000-0000-0000-000000572002', v_active_person_id, 'active'),
    ('00000000-0000-0000-0000-000000572002', v_resigned_person_id, 'resigned');

  PERFORM set_config('myk9572.active_member_auth_user_id', v_active_auth_user_id::text, false);
  PERFORM set_config('myk9572.resigned_member_auth_user_id', v_resigned_auth_user_id::text, false);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.active_member_auth_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL active-member-sees-unauthorized-club: an active club_members row could not see it';
  END IF;
  RAISE NOTICE 'PASS active-member-sees-unauthorized-club';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.resigned_member_auth_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL resigned-member-cannot-see: a RESIGNED club_members row could see the unauthorized club';
  END IF;
  RAISE NOTICE 'PASS resigned-member-cannot-see';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 3. Publishing a show for the unauthorized club is refused with MK004,
--    even though its Stripe account is fully ready. Runs as the real club
--    002 club_admin (authenticated), not plain postgres — the API-roles-only
--    carve-out (20260915221500) bypasses the gate entirely for a plain
--    postgres session, which would make this case pass for the wrong reason.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_message text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000572011';
    RAISE EXCEPTION 'FAIL unauthorized-publish: publish succeeded for an unauthorized club';
  EXCEPTION WHEN SQLSTATE 'MK004' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_message !~* 'authorized' THEN
    RAISE EXCEPTION 'FAIL unauthorized-publish: unexpected message %', v_message;
  END IF;
  RAISE NOTICE 'PASS unauthorized-publish: refused with MK004 and the authorization message';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 3b. A club that is BOTH unauthorized AND not Stripe-ready fails with
--     MK004, not MK003 — trg_enforce_show_club_authorization fires BEFORE
--     trg_enforce_show_publish_gate (same-event triggers run in alphabetical
--     order by trigger name, 'c' < 'p'), so it must win the refusal even
--     when both reasons apply. Needs its
--     own club_admin appointment (club 004): the shared admin identity from
--     the top of this file is scoped to club 002 only. Grant the SAME
--     person_id club_admin of club 004 too, rather than a second identity —
--     it only needs to prove the authenticated path, not a distinct actor.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000572004', 'MYK9-572 Unauthorized, Not Stripe-Ready', NULL);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000572013', 'MYK9-572 Doubly Blocked Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000572004', 'draft');

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
SELECT
  current_setting('myk9572.admin_person_id')::uuid,
  id,
  '00000000-0000-0000-0000-000000572004',
  NULL,
  true,
  now(),
  current_setting('myk9572.admin_person_id')::uuid,
  current_setting('myk9572.admin_auth_user_id')::uuid
FROM public.roles WHERE name = 'club_admin';

DO $$
DECLARE
  v_sqlstate text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000572013';
    RAISE EXCEPTION 'FAIL doubly-blocked-precedence: publish succeeded for a club that is neither authorized nor Stripe-ready';
  EXCEPTION WHEN SQLSTATE 'MK004' OR SQLSTATE 'MK003' THEN
    v_sqlstate := SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_sqlstate <> 'MK004' THEN
    RAISE EXCEPTION 'FAIL doubly-blocked-precedence: expected MK004 (authorization wins), got %', v_sqlstate;
  END IF;
  RAISE NOTICE 'PASS doubly-blocked-precedence: MK004 wins over MK003 when both apply';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 4. Once authorized (and already Stripe-ready), the same publish succeeds.
--    Runs as the real club 002 club_admin (authenticated).
-- ---------------------------------------------------------------------------
UPDATE public.clubs SET authorized_at = now() WHERE id = '00000000-0000-0000-0000-000000572002';

DO $$
DECLARE
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000572011';

  SELECT status INTO v_status FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000572011';

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL now-authorized-publish: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS now-authorized-publish: publish succeeds once authorized AND Stripe-ready';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Revert back to unauthorized for the remaining cases.
UPDATE public.clubs SET authorized_at = NULL WHERE id = '00000000-0000-0000-0000-000000572002';

-- ---------------------------------------------------------------------------
-- 5. An already-published show on a club that becomes/stays unauthorized
--    still accepts an unrelated edit (never retroactive). Fixture 572012 was
--    built by authorizing, publishing, then revoking (see Fixtures above),
--    so this exercises the real revoke-after-publish path, not an
--    already-published row inserted directly. Runs as the real club 002
--    club_admin (authenticated) so the trigger's OLD.status = 'published'
--    exemption is actually exercised, not just bypassed by role.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  UPDATE public.shows
     SET status = 'published', name = 'MYK9-572 Already Published (unauthorized club, renamed)'
   WHERE id = '00000000-0000-0000-0000-000000572012';

  SELECT name, status INTO v_name, v_status FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000572012';

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status <> 'published' OR v_name <> 'MYK9-572 Already Published (unauthorized club, renamed)' THEN
    RAISE EXCEPTION 'FAIL already-published-unrelated-edit: edit did not land (name=%, status=%)', v_name, v_status;
  END IF;
  RAISE NOTICE 'PASS already-published-unrelated-edit: never re-gated, even for an unauthorized club';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

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
SELECT set_config('request.jwt.claim.sub', '', true);

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
SELECT set_config('request.jwt.claim.sub', '', true);

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

-- ---------------------------------------------------------------------------
-- 8. set_club_authorization is idempotent: a repeat "authorize" call on an
--    already-authorized club does not stamp a new authorized_at and does
--    not write a second audit row.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.siteadmin_auth_user_id'), true);

DO $$
DECLARE
  v_authorized_at_before timestamptz;
  v_authorized_at_after timestamptz;
  v_audit_count integer;
BEGIN
  SELECT authorized_at INTO v_authorized_at_before FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';

  PERFORM pg_sleep(0.01); -- guarantee now() would differ if the no-op path re-stamped it
  PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572002', true);

  SELECT authorized_at INTO v_authorized_at_after FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';

  IF v_authorized_at_after IS DISTINCT FROM v_authorized_at_before THEN
    RAISE EXCEPTION 'FAIL idempotent-authorize: authorized_at changed on a repeat authorize call (% -> %)',
      v_authorized_at_before, v_authorized_at_after;
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.permission_audit_log
   WHERE action = 'club_authorized'
     AND target_type = 'club'
     AND target_id = '00000000-0000-0000-0000-000000572002';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL idempotent-authorize: expected still 1 permission_audit_log row after the repeat call, found %', v_audit_count;
  END IF;

  RAISE NOTICE 'PASS idempotent-authorize: repeat authorize is a no-op (no re-stamp, no duplicate audit row)';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 9. set_club_authorization(..., false) clears authorized_at and writes a
--    club_authorization_revoked audit row; a repeat revoke is also a no-op.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.siteadmin_auth_user_id'), true);

DO $$
BEGIN
  PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572002', false);
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_authorized_at timestamptz;
  v_revoked_audit_count integer;
BEGIN
  SELECT authorized_at INTO v_authorized_at FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572002';
  IF v_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL site-admin-revokes: authorized_at was not cleared';
  END IF;

  SELECT count(*) INTO v_revoked_audit_count FROM public.permission_audit_log
   WHERE action = 'club_authorization_revoked'
     AND target_type = 'club'
     AND target_id = '00000000-0000-0000-0000-000000572002';
  IF v_revoked_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL site-admin-revokes: expected 1 club_authorization_revoked audit row, found %', v_revoked_audit_count;
  END IF;

  RAISE NOTICE 'PASS site-admin-revokes: authorized_at cleared and club_authorization_revoked audit row written';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.siteadmin_auth_user_id'), true);

DO $$
BEGIN
  PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572002', false);
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_revoked_audit_count integer;
BEGIN
  SELECT count(*) INTO v_revoked_audit_count FROM public.permission_audit_log
   WHERE action = 'club_authorization_revoked'
     AND target_type = 'club'
     AND target_id = '00000000-0000-0000-0000-000000572002';
  IF v_revoked_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL idempotent-revoke: expected still 1 club_authorization_revoked audit row after the repeat call, found %', v_revoked_audit_count;
  END IF;
  RAISE NOTICE 'PASS idempotent-revoke: repeat revoke is a no-op (no duplicate audit row)';
END;
$$;


-- ---------------------------------------------------------------------------
-- 10. guard_club_authorization_write: a club_admin (of the club itself, with
--     UPDATE rights under clubs_update) cannot PATCH authorized_at directly —
--     only set_club_authorization() may write it (P0-1). Reuses the shared
--     club-002 admin identity.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  BEGIN
    UPDATE public.clubs SET authorized_at = now()
     WHERE id = '00000000-0000-0000-0000-000000572002';
    RAISE EXCEPTION 'FAIL direct-authorized-at-write-refused: club_admin PATCH of authorized_at succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_sqlstate := SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'PASS direct-authorized-at-write-refused: 42501';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 11. Same guard blocks a direct write to authorized_by alone (no
--     authorized_at change at all) — both columns are covered, not just the
--     one this test suite otherwise exercises.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

  BEGIN
    UPDATE public.clubs SET authorized_by = current_setting('myk9572.admin_person_id')::uuid
     WHERE id = '00000000-0000-0000-0000-000000572002';
    RAISE EXCEPTION 'FAIL direct-authorized-by-write-refused: club_admin PATCH of authorized_by succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_sqlstate := SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'PASS direct-authorized-by-write-refused: 42501';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 12. A secretary/club_admin INSERTing a brand-new club with authorized_at
--     set in the payload gets a row that lands with authorized_at NULL —
--     the guard silently drops it on INSERT rather than raising, so the
--     Show Creation Wizard's "my club isn't listed" path keeps working with
--     zero human involvement (clubs_insert is unchanged).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.admin_auth_user_id'), true);

INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000572005', 'MYK9-572 Sneaky New Club', now());

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_authorized_at timestamptz;
BEGIN
  SELECT authorized_at INTO v_authorized_at FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572005';
  IF v_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL insert-authorized-at-dropped: a client-supplied authorized_at on INSERT was not nulled';
  END IF;
  RAISE NOTICE 'PASS insert-authorized-at-dropped: INSERT landed with authorized_at NULL despite the payload';
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. set_club_authorization still works after the two direct-write refusals
--     above — the GUC carve-out in guard_club_authorization_write() is not
--     an accidental total bypass, it is scoped to exactly this function's
--     own UPDATE. Reuses the site admin identity from case 7.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9572.siteadmin_auth_user_id'), true);

DO $$
BEGIN
  PERFORM public.set_club_authorization('00000000-0000-0000-0000-000000572005', true);
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_authorized_at timestamptz;
BEGIN
  SELECT authorized_at INTO v_authorized_at FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000000572005';
  IF v_authorized_at IS NULL THEN
    RAISE EXCEPTION 'FAIL set-club-authorization-still-works: authorized_at was not set through the GUC path';
  END IF;
  RAISE NOTICE 'PASS set-club-authorization-still-works: the sanctioned GUC path is unaffected by the new guard';
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Wiring assertion: trg_enforce_show_club_authorization must sort
--     BEFORE trg_enforce_show_publish_gate in pg_trigger's own ordering
--     (Postgres fires same-event triggers in ALPHABETICAL ORDER BY TRIGGER
--     NAME, not declaration order) -- this is what makes the doubly-blocked-
--     precedence case above (MK004 wins over MK003) hold at all. A rename
--     of either trigger that broke this ordering would not be caught by
--     that case alone if it happened to still pass for the wrong reason, so
--     assert the ordering directly here too.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_authz_name text;
  v_publish_name text;
BEGIN
  SELECT tgname INTO v_authz_name
  FROM pg_trigger
  WHERE tgrelid = 'public.shows'::regclass
    AND tgname = 'trg_enforce_show_club_authorization'
    AND NOT tgisinternal;

  SELECT tgname INTO v_publish_name
  FROM pg_trigger
  WHERE tgrelid = 'public.shows'::regclass
    AND tgname = 'trg_enforce_show_publish_gate'
    AND NOT tgisinternal;

  IF v_authz_name IS NULL THEN
    RAISE EXCEPTION 'FAIL trigger-ordering-wiring: trg_enforce_show_club_authorization not found on public.shows';
  END IF;
  IF v_publish_name IS NULL THEN
    RAISE EXCEPTION 'FAIL trigger-ordering-wiring: trg_enforce_show_publish_gate not found on public.shows';
  END IF;
  IF v_authz_name >= v_publish_name THEN
    RAISE EXCEPTION 'FAIL trigger-ordering-wiring: % does not sort before % (MK004 would no longer win over MK003)',
      v_authz_name, v_publish_name;
  END IF;
  RAISE NOTICE 'PASS trigger-ordering-wiring: % sorts before % (alphabetical trigger firing order)',
    v_authz_name, v_publish_name;
END;
$$;

ROLLBACK;