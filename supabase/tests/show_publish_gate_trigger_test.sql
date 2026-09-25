-- MYK9-579: enforce_show_publish_gate() is the DB-side backstop for the
-- Stripe-payouts gate on a show entering 'published' that publishGateError
-- (ShowEditPanel.helpers.ts) and ShowStatusPill.tsx already enforce
-- client-side. A direct PostgREST `update shows set status='published'`
-- bypassed both of them before this trigger existed. Note: 'accepting_entries'
-- is not a permitted shows.status (072_align_show_class_statuses.sql) -- a
-- round-4 draft of the gate widened the gated set to include it, but that
-- transition dies on the CHECK constraint (23514) before it ever reaches
-- this trigger, so round 5 reverted the widening; the gated set is
-- 'published' only.
--
-- Matrix covered below: no club_stripe_accounts row; a row with
-- payouts_enabled=false; a row with payouts_enabled=true in the mode matching
-- platform_settings.stripe_livemode; a row with payouts_enabled=true in the
-- OTHER mode; an already-published show receiving an unrelated edit;
-- club_id IS NULL. Both livemode values are exercised by flipping
-- platform_settings inside this transaction.
--
-- The gate carves out everything except the `authenticated` and `anon`
-- roles (see the migration header) — it is a backstop for PostgREST/API
-- callers only. A plain postgres session (no SET ROLE) is therefore no
-- longer enough to exercise it: every case below that expects the gate to
-- actually fire runs as `SET LOCAL ROLE authenticated` with a JWT
-- (`set_config('request.jwt.claim.sub', ...)`) for a real person holding a
-- club-scoped secretary appointment at the fixture club, OR (for the two
-- clubless-show cases, 5 and 10) a SITE ADMIN -- a club-scoped secretary
-- cannot even SEE a clubless show under shows_select, so exercising those
-- cases as the secretary would silently match 0 rows and never reach the
-- gate at all (P0-1; see case 5's own comment). Fixture setup (clubs, shows,
-- club_stripe_accounts, people, auth.users, user_roles) stays under the
-- plain postgres session; `platform_settings` writes stay under
-- `SET LOCAL ROLE service_role` (trg_guard_platform_settings_write). Every
-- `RESET ROLE` is paired with clearing the JWT claim
-- (`set_config('request.jwt.claim.sub', '', true)`, PERFORM inside a DO
-- block or a plain SELECT outside one) so a stale identity never leaks into
-- the next case's plain-postgres fixture setup.
--
-- MYK9-716 (20260925023700): publishing also requires an entry window, checked
-- LAST, SQLSTATE MK005. Every fixture this file expects to PUBLISH is given a
-- window right after it is inserted; the refusal fixtures keep none, since
-- their MK003 fires first (section 12d pins that order). Section 12 covers
-- the window itself.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

-- ---------------------------------------------------------------------------
-- Wiring: the guard must actually be attached, BEFORE, and scoped to
-- INSERT and UPDATE OF status (see the migration's own SCOPE comment for
-- why both operations are in scope).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_timing text;
  v_columns text;
  v_has_insert boolean;
  v_has_update boolean;
BEGIN
  SELECT CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END,
         COALESCE((
           SELECT string_agg(a.attname, ',' ORDER BY a.attname)
           FROM unnest(t.tgattr::int2[]) AS col(attnum)
           JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = col.attnum
         ), '(none)'),
         -- TRIGGER_TYPE_INSERT = 4, TRIGGER_TYPE_UPDATE = 16 (see pg_trigger docs).
         (t.tgtype & 4) = 4,
         (t.tgtype & 16) = 16
    INTO v_timing, v_columns, v_has_insert, v_has_update
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE ns.nspname = 'public'
    AND c.relname = 'shows'
    AND NOT t.tgisinternal
    AND p.proname = 'enforce_show_publish_gate';

  IF v_timing IS NULL THEN
    RAISE EXCEPTION 'FAIL wiring: no trigger on public.shows runs enforce_show_publish_gate()';
  END IF;
  IF v_timing IS DISTINCT FROM 'BEFORE' THEN
    RAISE EXCEPTION 'FAIL wiring: guard must be BEFORE so the bad row never lands, found %', v_timing;
  END IF;
  -- MYK9-716: also the entry-window columns, so a published show cannot lose
  -- its window after publishing (the function ignores unchanged dates).
  IF v_columns IS DISTINCT FROM 'entry_close_date,entry_open_date,status' THEN
    RAISE EXCEPTION 'FAIL wiring: expected UPDATE OF status, entry_open_date, entry_close_date, found %', v_columns;
  END IF;
  IF NOT v_has_insert THEN
    RAISE EXCEPTION 'FAIL wiring: expected the trigger to also fire on INSERT (create_show_with_children and createShow() both let the caller set status)';
  END IF;
  IF NOT v_has_update THEN
    RAISE EXCEPTION 'FAIL wiring: expected the trigger to fire on UPDATE';
  END IF;
  RAISE NOTICE 'PASS wiring: BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date on public.shows';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: four clubs, one per matrix cell that needs its own
-- club_stripe_accounts state. A fifth club (loses-readiness) is added later,
-- immediately before the section that needs it.
-- ---------------------------------------------------------------------------
-- Every club here is myK9-authorized (MYK9-572): this matrix isolates the
-- Stripe gate, and trg_enforce_show_club_authorization fires first (it sorts
-- before trg_enforce_show_publish_gate), so an unauthorized club would fail
-- every publish with MK004 before the Stripe check ran. The superuser session
-- may set authorized_at directly; guard_club_authorization_write carves out
-- non-API roles.
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000579001', 'MYK9-579 No Account Club', now()),
  ('00000000-0000-0000-0000-000000579002', 'MYK9-579 Payouts Disabled Club', now()),
  ('00000000-0000-0000-0000-000000579003', 'MYK9-579 Test-Mode Ready Club', now()),
  ('00000000-0000-0000-0000-000000579004', 'MYK9-579 Live-Mode Ready Club', now());

-- Pin the platform to test mode for the first half of this test.
-- trg_guard_platform_settings_write (20260615180000) is a BEFORE UPDATE/DELETE
-- guard that raises unless the caller is a site admin OR service_role -- this
-- fixture runs as postgres with no JWT, so it must reach the carve-out
-- explicitly, same as the seed's own manual-fix runbook.
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Club 2: payouts_enabled=false (onboarding started, not finished).
INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000579002', 'acct_myk9579_disabled', false, false, false);

-- Club 3: payouts_enabled=true in TEST mode — matches the platform default set above.
INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000579003', 'acct_myk9579_test_ready', true, true, false);

-- Club 4: payouts_enabled=true, but only in LIVE mode — the OTHER mode from
-- the platform's current test-mode setting, so it must NOT satisfy the gate yet.
INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000579004', 'acct_myk9579_live_ready', true, true, true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579010', 'MYK9-579 No Account Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'draft'),
  ('00000000-0000-0000-0000-000000579011', 'MYK9-579 Payouts Disabled Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579002', 'draft'),
  ('00000000-0000-0000-0000-000000579012', 'MYK9-579 Test-Mode Ready Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft'),
  ('00000000-0000-0000-0000-000000579013', 'MYK9-579 Live-Mode-Only Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579004', 'draft'),
  ('00000000-0000-0000-0000-000000579015', 'MYK9-579 Clubless Show', 'AKC',
   current_date, current_date + 1, NULL, 'draft');

-- MYK9-716: publishing requires an entry window; case 3 publishes this show.
UPDATE public.shows
   SET entry_open_date = current_date - 10, entry_close_date = current_date - 1
 WHERE id = '00000000-0000-0000-0000-000000579012';

-- Already-published fixture: inserted directly as postgres, WITH no SET ROLE
-- active, so `current_setting('role', true)` reads 'none' and the gate's
-- API-roles-only carve-out (see the migration header) bypasses it — same as
-- every other plain-postgres INSERT in this file. It starts published with
-- no club_stripe_accounts row at all; the case under test further down is
-- the UPDATE arm's "already published is exempt" rule, not this INSERT.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579014', 'MYK9-579 Already Published Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published');

-- ---------------------------------------------------------------------------
-- Secretary identity used to exercise the gate as a real authenticated
-- PostgREST-shaped caller for every case below. handle_new_user() adopts a
-- pre-seeded people row BY EMAIL when its auth_user_id is still NULL (see
-- 20260625000000), so the person row is seeded first with auth_user_id NULL
-- and the auth.users row is inserted second, matching on email — inserting
-- people.auth_user_id directly with no matching auth.users row would violate
-- the FK (009_online_entry_system.sql) and abort the whole script. One
-- identity holds a club-scoped secretary appointment at every club this
-- matrix touches; a club-5 appointment is added later, immediately before
-- the section that needs it.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000579200',
  'MYK9-579',
  'Secretary',
  'myk9-579-secretary@example.test',
  NULL
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000579201',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-579-secretary@example.test', '', now(),
  now(), now(), '{}', '{}', false, false, false
);

-- P3-6: assert the adoption this whole file rests on, right after the
-- auth.users insert (show_message_tenant_isolation_test.sql:~70-76) --
-- if handle_new_user() ever stops adopting by email, every case below would
-- silently authenticate as the wrong (or no) person instead of failing loud.
DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000000579200')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000579201'::uuid THEN
    RAISE EXCEPTION 'FAIL wiring: handle_new_user() did not adopt the secretary fixture by email';
  END IF;
END $adopt$;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000579200',
  roles.id,
  club.id,
  true,
  '00000000-0000-0000-0000-000000579201'
FROM public.roles
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000000579001'::uuid),
  ('00000000-0000-0000-0000-000000579002'::uuid),
  ('00000000-0000-0000-0000-000000579003'::uuid),
  ('00000000-0000-0000-0000-000000579004'::uuid)
) AS club(id)
WHERE roles.name = 'secretary';

-- ---------------------------------------------------------------------------
-- P0-1: a SITE ADMIN identity, for the clubless-show cases (5 and 10) below.
-- is_show_secretary()/is_show_secretary-backed shows_select admits a
-- secretary only for a club_id match or a show_id-scoped appointment --
-- neither exists for a clubless show -- but is_show_secretary() ALSO
-- wildcards for r.name = 'site_admin' with no club/show qualifier at all
-- (20260830240000), and shows_update's is_site_admin() arm does the same.
-- A club-scoped secretary genuinely cannot see or update a clubless show, so
-- exercising the clubless-show refusal needs an identity RLS actually admits
-- to the row -- a site admin, same as admin_soft_deleted_show_visibility_test.sql.
-- Same handle_new_user()-adopts-by-email pattern as the secretary identity
-- above: people row first with auth_user_id NULL, auth.users second.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000579210',
  'MYK9-579',
  'SiteAdmin',
  'myk9-579-siteadmin@example.test',
  NULL
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000579211',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-579-siteadmin@example.test', '', now(),
  now(), now(), '{}', '{}', false, false, false
);

DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000000579210')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000579211'::uuid THEN
    RAISE EXCEPTION 'FAIL wiring: handle_new_user() did not adopt the site-admin fixture by email';
  END IF;
END $adopt$;

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000579210',
  id,
  true,
  '00000000-0000-0000-0000-000000579211'
FROM public.roles
WHERE name = 'site_admin';

-- ---------------------------------------------------------------------------
-- 1. No club_stripe_accounts row at all -> refused. Secretary of club 1.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579010';
    RAISE EXCEPTION 'FAIL no-account: publish succeeded with no club_stripe_accounts row';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    v_state := 'MK003';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_message !~* 'payment account' THEN
    RAISE EXCEPTION 'FAIL no-account: unexpected message %', v_message;
  END IF;
  RAISE NOTICE 'PASS no-account: refused with MK003 and the payment-account message';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 2. A row with payouts_enabled=false -> refused. Secretary of club 2.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579011';
    RAISE EXCEPTION 'FAIL payouts-disabled: publish succeeded with payouts_enabled=false';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS payouts-disabled: refused with MK003';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 3. payouts_enabled=true in the mode MATCHING platform_settings.stripe_livemode
--    (both false here) -> succeeds. Secretary of club 3.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579012';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL matching-mode: expected the publish to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579012';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL matching-mode: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS matching-mode: publish succeeds when payouts_enabled is true in the live platform mode';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 4. payouts_enabled=true, but only in the OTHER mode -> refused. Secretary
--    of club 4.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579013';
    RAISE EXCEPTION 'FAIL wrong-mode: publish succeeded against a live-mode-only account while the platform is in test mode';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS wrong-mode: refused when the ready account is in the OTHER Stripe mode';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 5. club_id IS NULL -> refused, with the assign-a-club message (same SQLSTATE
--    as the Stripe-readiness refusal — only the message text tells them apart).
--
--    P0-1 fix: a club-scoped SECRETARY cannot even SEE this clubless row --
--    is_show_secretary() (which backs shows_select) admits a secretary only
--    for a club_id match or a show_id-scoped appointment, neither of which
--    exists here, and has no NULL-club wildcard the way is_trial_secretary()
--    does. Postgres applies the SELECT policy to the rows an UPDATE's WHERE
--    clause can even see, so running this as the secretary makes the UPDATE
--    match ZERO rows and never reach the trigger at all -- a silent
--    false-pass, not a real refusal. Run as the SITE ADMIN instead:
--    is_show_secretary()/is_site_admin() both wildcard for site_admin with no
--    club/show qualifier (20260830240000, 20260515110000), so this identity
--    actually reaches the trigger, which is what proves the TRIGGER -- not
--    RLS -- is what refuses the publish. The positive control below proves
--    the row really is visible/matched before trusting the refusal.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_message text;
  v_visible_count int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579211', true);

  -- Positive control: the site admin can see exactly this one row. Without
  -- this, a 0-row UPDATE below would look identical to a real refusal.
  SELECT count(*) INTO v_visible_count FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579015';
  IF v_visible_count <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL clubless: expected the site admin to see exactly 1 row, saw %', v_visible_count;
  END IF;

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579015';
    RAISE EXCEPTION 'FAIL clubless: publish succeeded with club_id IS NULL';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END;
  IF v_message IS DISTINCT FROM NULL AND v_message !~* 'assign a club' THEN
    RAISE EXCEPTION 'FAIL clubless: unexpected message %', v_message;
  END IF;
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'FAIL clubless: MK003 was raised but no message text was captured';
  END IF;
  RAISE NOTICE 'PASS clubless: refused with the assign-a-club message';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 6. An already-published show receiving an edit that explicitly re-sets
--    status (still the same value) succeeds untouched — the gate only fires
--    on a transition INTO published, never on a show that is already there.
--    Secretary of club 1 (the fixture's own club).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
  v_status text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows
     SET status = 'published', name = 'MYK9-579 Already Published Show (renamed)'
   WHERE id = '00000000-0000-0000-0000-000000579014';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL already-published: expected the edit to affect 1 row, affected %', v_n;
  END IF;

  SELECT name, status INTO v_name, v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579014';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status IS DISTINCT FROM 'published'
     OR v_name IS DISTINCT FROM 'MYK9-579 Already Published Show (renamed)' THEN
    RAISE EXCEPTION 'FAIL already-published: edit did not land (name=%, status=%)', v_name, v_status;
  END IF;
  RAISE NOTICE 'PASS already-published: an edit to a show already published is never re-gated, even with a club that has no Stripe account at all';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 7. Flip platform_settings.stripe_livemode to TRUE and re-test clubs 3 and 4
--    with FRESH draft shows — the roles reverse. Secretaries of clubs 3/4.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = true WHERE id = true;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579016', 'MYK9-579 Test-Mode Ready Show (live cutover)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft'),
  ('00000000-0000-0000-0000-000000579017', 'MYK9-579 Live-Mode Ready Show (live cutover)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579004', 'draft');

-- MYK9-716: publishing requires an entry window; section 7's success case publishes this show.
UPDATE public.shows
   SET entry_open_date = current_date - 10, entry_close_date = current_date - 1
 WHERE id = '00000000-0000-0000-0000-000000579017';

DO $$
BEGIN
  -- Club 3's account is test-mode only; now that the platform is live, it is
  -- the account in the WRONG mode.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579016';
    RAISE EXCEPTION 'FAIL live-cutover: a test-mode-only account was accepted once the platform switched to live mode';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS live-cutover: the test-mode account no longer satisfies the gate once platform_settings.stripe_livemode flips to true';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  -- Club 4's account is live-mode and payouts_enabled — now the matching one.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579017';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL live-cutover: expected the publish to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579017';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL live-cutover: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS live-cutover: the live-mode account satisfies the gate once platform_settings.stripe_livemode flips to true';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);


-- ---------------------------------------------------------------------------
-- 8. INSERT bypass (P1-2): the trigger now also fires on INSERT, so a
--    hand-crafted request cannot create an already-published show. Platform
--    is still LIVE at this point (section 7 flipped it true and never
--    flipped it back) -- club 1 has no club_stripe_accounts row at all, so
--    the mode is irrelevant to these cases: can_accept_online_entry_payment's
--    EXISTS check refuses regardless of livemode. Secretary/roles for clubs
--    1 and 3 were seeded above, alongside the fixture identity.
-- ---------------------------------------------------------------------------

-- 8a. create_show_with_children (SECURITY DEFINER, RPC) with status='published'
--     for a club with no Stripe account -> MK003. This is the exact hole
--     P1-2 named: the RPC takes `status` straight from the caller's JSON.
DO $$
DECLARE
  v_message text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000579018',
        'name', 'MYK9-579 Insert Bypass Show (RPC)',
        'organization', 'AKC',
        'start_date', (current_date)::text,
        'end_date', (current_date + 1)::text,
        'club_id', '00000000-0000-0000-0000-000000579001',
        'status', 'published',
        'accept_check_payments', true,
        'accept_cash_payments', true
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'FAIL insert-bypass-rpc: create_show_with_children inserted an already-published show with no Stripe account';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    IF v_message !~* 'payment account' THEN
      RAISE EXCEPTION 'FAIL insert-bypass-rpc: unexpected message %', v_message;
    END IF;
    RAISE NOTICE 'PASS insert-bypass-rpc: create_show_with_children refused an already-published INSERT with MK003';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 8b. A direct `INSERT INTO shows (..., status) VALUES (..., 'published')` as
--     the same secretary -> MK003. shows_insert RLS (135) would ADMIT this
--     secretary for club 1 (is_trial_secretary(club_id) = true), so this
--     proves the trigger -- not RLS -- is what refuses it: Postgres runs
--     BEFORE ROW triggers before RLS WITH CHECK is evaluated on INSERT, so
--     enforce_show_publish_gate()'s RAISE EXCEPTION fires first regardless.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
    VALUES (
      '00000000-0000-0000-0000-000000579019', 'MYK9-579 Insert Bypass Show (direct)', 'AKC',
      current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published'
    );
    RAISE EXCEPTION 'FAIL insert-bypass-direct: a direct INSERT created an already-published show with no Stripe account';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS insert-bypass-direct: a direct INSERT of an already-published show was refused with MK003';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 8c. The API-roles-only carve-out this same trigger needs, split into the
--     two roles it actually exempts (see the migration header):
--
-- 8c-i. A plain postgres session with no SET ROLE at all -- the shape of
--       EVERY other fixture INSERT in this file, and of every migration and
--       supabase/tests/*.sql fixture -- inserting an already-published show
--       succeeds. current_setting('role', true) reads 'none' with no SET
--       ROLE active in the session, which is NOT IN ('authenticated',
--       'anon'), so the gate bypasses it.
DO $$
DECLARE
  v_role text;
  v_status text;
  v_n int;
BEGIN
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'FAIL superuser-no-role: expected current_setting(''role'', true) = ''none'' with no SET ROLE active, got %', COALESCE(v_role, '(null)');
  END IF;

  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES (
    '00000000-0000-0000-0000-000000579031', 'MYK9-579 Superuser No-Role Fixture', 'AKC',
    current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL superuser-no-role: expected the INSERT to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579031';
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL superuser-no-role: expected the no-SET-ROLE INSERT to succeed, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS superuser-no-role: a plain postgres session with no SET ROLE (current_setting(''role'', true) = ''none'') bypasses the gate, same as every migration and supabase/tests/*.sql fixture';
END;
$$;

-- 8c-ii. supabase/seed-demo.sql's deliberate MYK9-386 fixture shape: a
--        SET LOCAL ROLE service_role INSERT of an already-published show
--        with no club_stripe_accounts row. Not reachable from any client
--        path (see the migration header) -- only a connection actually
--        running AS service_role reaches it.
DO $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES (
    '00000000-0000-0000-0000-000000579030', 'MYK9-579 Service Role Seed Fixture', 'AKC',
    current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL service-role-passthrough: expected the INSERT to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579030';

  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL service-role-passthrough: expected the service_role INSERT to succeed, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS service-role-passthrough: a service_role INSERT of an already-published show (the seed-demo.sql fixture shape) is exempt';
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. A real authenticated caller, not postgres (P2-7). Same secretary/club
--    fixtures as section 8.
-- ---------------------------------------------------------------------------
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579040', 'MYK9-579 Authenticated Refusal Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'draft'),
  ('00000000-0000-0000-0000-000000579041', 'MYK9-579 Authenticated Success Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft');

-- MYK9-716: publishing requires an entry window; 9c publishes this show.
UPDATE public.shows
   SET entry_open_date = current_date - 10, entry_close_date = current_date - 1
 WHERE id = '00000000-0000-0000-0000-000000579041';

-- 9a. Secretary of a club with no Stripe account publishes -> MK003.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579040';
    RAISE EXCEPTION 'FAIL authenticated-refusal: publish succeeded as a real authenticated secretary with no Stripe account';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS authenticated-refusal: a real authenticated secretary was refused with MK003';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 9b. Secretary of the same club-3 (Test-Mode Ready, payouts_enabled=true in
--     TEST mode) publishes while the platform is in LIVE mode (section 7's
--     flip) -> still MK003, the test-mode account is the WRONG mode now.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579041';
    RAISE EXCEPTION 'FAIL authenticated-wrong-mode: publish succeeded against a test-mode-only account while the platform is live';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS authenticated-wrong-mode: a real authenticated secretary is still bound by the live-mode flip';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 9c. Flip the platform back to TEST mode and retry as the same authenticated
--     secretary against the now-matching club-3 account -> success. Proves
--     the RLS-scoped UPDATE (not just a superuser one) can actually publish.
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579041';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL authenticated-success: expected the publish to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579041';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL authenticated-success: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS authenticated-success: a real authenticated secretary published once the club account matched platform mode';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 10. P3-8: an UPDATE that never touches status is never gated, even on a
--     clubless draft that would fail the gate if it tried to publish.
--
--     P0-1 fix: same problem as section 5 -- a club-scoped secretary cannot
--     see this clubless row via shows_select at all, so the UPDATE below
--     would silently match 0 rows and the old `v_name <> 'expected'`
--     comparison (NULL <> text = NULL = "false" in an IF) would vacuously
--     pass without proving anything. Run as the SITE ADMIN (see section 5's
--     comment for why it actually reaches the row), and assert the row
--     count landed via GET DIAGNOSTICS rather than trusting a SELECT alone.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579211', true);

  UPDATE public.shows SET name = 'MYK9-579 Clubless Show (renamed)'
   WHERE id = '00000000-0000-0000-0000-000000579015';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL name-only-update: expected the rename to affect 1 row, affected %', v_n;
  END IF;

  SELECT name INTO v_name FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579015';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_name IS DISTINCT FROM 'MYK9-579 Clubless Show (renamed)' THEN
    RAISE EXCEPTION 'FAIL name-only-update: rename did not land (name=%)', v_name;
  END IF;
  RAISE NOTICE 'PASS name-only-update: renaming a clubless draft never reaches the gate (UPDATE OF status only)';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- 11. P3-8: publish -> draft -> publish again after the club LOSES its
--     Stripe readiness in between -> the second publish is refused, proving
--     the "already-published exempt" branch does not leak into a show that
--     was moved back to draft. Secretary of a fifth, dedicated club.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000579005', 'MYK9-579 Loses Readiness Club', now());

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000579005', 'acct_myk9579_loses_readiness', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579050', 'MYK9-579 Loses Readiness Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579005', 'draft');

-- MYK9-716: publishing requires an entry window; section 11's first publish needs it.
UPDATE public.shows
   SET entry_open_date = current_date - 10, entry_close_date = current_date - 1
 WHERE id = '00000000-0000-0000-0000-000000579050';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000579200',
  id,
  '00000000-0000-0000-0000-000000579005',
  true,
  '00000000-0000-0000-0000-000000579201'
FROM public.roles
WHERE name = 'secretary';

DO $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  -- First publish: club is ready (test mode, matches the platform's current
  -- test-mode setting from section 9c's flip) -> succeeds.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579050';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL republish: expected the first publish to affect 1 row, affected %', v_n;
  END IF;

  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579050';
  IF v_status IS DISTINCT FROM 'published' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL republish: first publish should have succeeded, got %', v_status;
  END IF;

  -- Move back to draft: unaffected by the gate either way (only fires on a
  -- transition INTO published), and not itself under test here.
  UPDATE public.shows SET status = 'draft'
   WHERE id = '00000000-0000-0000-0000-000000579050';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- The club loses its Stripe readiness (not itself under this test's RLS
  -- scope -- done as the fixture owner).
  UPDATE public.club_stripe_accounts SET payouts_enabled = false
   WHERE club_id = '00000000-0000-0000-0000-000000579005';

  -- Second publish attempt -> refused. The exemption is OLD.status =
  -- 'published' at the moment of THIS update, not "was published once".
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579050';
    RAISE EXCEPTION 'FAIL republish: second publish succeeded after the club lost payouts_enabled';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE NOTICE 'PASS republish: publish -> draft -> publish is re-gated after the club loses Stripe readiness in between';
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);


-- ---------------------------------------------------------------------------
-- 12. MYK9-716: a draft may have no entry window, but publishing requires
--     one. Club 3 is authorized and Stripe-ready in the platform's current
--     mode (test, per section 9c), so the entry window is the only thing
--     these fixtures lack. Secretary of club 3.
-- ---------------------------------------------------------------------------
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date) VALUES
  ('00000000-0000-0000-0000-000000579060', 'MYK9-716 Windowless Draft', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft', NULL, NULL),
  ('00000000-0000-0000-0000-000000579061', 'MYK9-716 Inverted Window', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft',
   current_date - 1, current_date - 10),
  ('00000000-0000-0000-0000-000000579062', 'MYK9-716 Same-Day Window', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft',
   current_date - 1, current_date - 1),
  ('00000000-0000-0000-0000-000000579063', 'MYK9-716 Windowless, Not Stripe-Ready', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'draft', NULL, NULL);

-- 12a. A draft saves without a window: an authenticated INSERT of a
--      windowless draft, and an unrelated edit to one, both land.
DO $$
DECLARE
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES ('00000000-0000-0000-0000-000000579064', 'MYK9-716 Draft Insert, No Window', 'AKC',
          current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL windowless-draft-insert: expected 1 row, got %', v_n;
  END IF;

  UPDATE public.shows SET name = 'MYK9-716 Windowless Draft (renamed)'
   WHERE id = '00000000-0000-0000-0000-000000579060';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL windowless-draft-edit: expected the rename to affect 1 row, affected %', v_n;
  END IF;
  RAISE NOTICE 'PASS windowless-draft: a draft with no entry window inserts and saves edits as an authenticated secretary';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12b. Publishing the windowless draft is refused with MK005 and the
--      "set the entry window" message, and the row stays a draft. The
--      positive control proves the secretary really reaches the row.
DO $$
DECLARE
  v_message text;
  v_visible int;
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  SELECT count(*) INTO v_visible FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000579060';
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'FAIL windowless-publish: expected the secretary to see the fixture, saw % rows', v_visible;
  END IF;

  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579060';
    RAISE EXCEPTION 'FAIL windowless-publish: a show with no entry window was published';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579060';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_message IS NULL OR v_message !~* 'set the entry window before publishing' THEN
    RAISE EXCEPTION 'FAIL windowless-publish: unexpected message %', v_message;
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'FAIL windowless-publish: expected the show to stay draft, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS windowless-publish: refused with MK005 and the set-the-entry-window message';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12c. A window that closes before it opens is refused with the order
--      message. A same-day window is NOT: entry dates are stored as calendar
--      days (the wizard's online create writes toLocalDateOnly, so open and
--      close on one day land as the same midnight) and the close day is
--      inclusive, so it is a valid one-day window and must publish.
DO $$
DECLARE
  v_message text;
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579061';
    RAISE EXCEPTION 'FAIL window-order: a show whose window closes before it opens was published';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579062';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_message IS NULL OR v_message !~* 'can.t close before it opens' THEN
    RAISE EXCEPTION 'FAIL window-order: unexpected message %', v_message;
  END IF;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL window-same-day: expected the same-day window to publish 1 row, got %', v_n;
  END IF;
  RAISE NOTICE 'PASS window-order: an inverted window is refused with MK005, and a same-day window publishes';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12d. The window is checked LAST: a windowless show on a club with no
--      Stripe account still gets MK003 and the payment-account message.
DO $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579063';
    RAISE EXCEPTION 'FAIL window-precedence: publish succeeded with no Stripe account and no window';
  EXCEPTION WHEN SQLSTATE 'MK003' OR SQLSTATE 'MK005' THEN
    v_state := SQLSTATE;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_state IS DISTINCT FROM 'MK003' OR v_message !~* 'payment account' THEN
    RAISE EXCEPTION 'FAIL window-precedence: expected MK003 payment-account, got % %', v_state, v_message;
  END IF;
  RAISE NOTICE 'PASS window-precedence: the Stripe refusal (MK003) still wins over a missing window';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12e. INSERT arm: creating an already-published show with no window is
--      refused with MK005 (the trigger's INSERT branch).
DO $$
DECLARE
  v_state text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);
  BEGIN
    INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
    VALUES ('00000000-0000-0000-0000-000000579065', 'MYK9-716 Published Insert, No Window', 'AKC',
            current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'published');
    RAISE EXCEPTION 'FAIL windowless-insert-published: an already-published show was inserted with no window';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_state IS DISTINCT FROM 'MK005' THEN
    RAISE EXCEPTION 'FAIL windowless-insert-published: expected MK005, got %', v_state;
  END IF;
  RAISE NOTICE 'PASS windowless-insert-published: refused with MK005';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12f. Once the secretary sets the window, the same draft publishes.
DO $$
DECLARE
  v_n int;
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows
     SET entry_open_date = current_date - 10, entry_close_date = current_date - 1
   WHERE id = '00000000-0000-0000-0000-000000579060';

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579060';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579060';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_n <> 1 OR v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL window-set-publishes: expected 1 row published, got % row(s), status %', v_n, v_status;
  END IF;
  RAISE NOTICE 'PASS window-set-publishes: the draft publishes once its entry window is set';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);


-- ---------------------------------------------------------------------------
-- 12g. MYK9-716 (Codex P1): the window must stay valid WHILE the show is
--      published, not just at the moment it is published. The trigger also
--      fires on UPDATE OF entry_open_date / entry_close_date; on an
--      already-published show it re-checks only the window, and only when a
--      date actually changes (never the club or Stripe checks, never
--      retroactively). 579060 was published in 12f with a valid window.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_message text;
  v_n int;
  v_open timestamptz;
  v_close timestamptz;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  -- Clearing a date on a published show -> MK005.
  v_state := NULL;
  BEGIN
    UPDATE public.shows SET entry_close_date = NULL
     WHERE id = '00000000-0000-0000-0000-000000579060';
    RAISE EXCEPTION 'FAIL published-clear-date: a published show lost its entry close date';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    v_state := SQLSTATE;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;
  IF v_message IS NULL OR v_message !~* 'published show has to keep its entry window' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL published-clear-date: unexpected message %', v_message;
  END IF;

  -- Reversing the window on a published show -> MK005.
  v_state := NULL;
  BEGIN
    UPDATE public.shows
       SET entry_open_date = current_date + 5, entry_close_date = current_date + 1
     WHERE id = '00000000-0000-0000-0000-000000579060';
    RAISE EXCEPTION 'FAIL published-reverse-window: a published show got a window that closes before it opens';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'MK005' THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL published-reverse-window: expected MK005, got %', v_state;
  END IF;

  -- A valid change to a published show's window passes.
  UPDATE public.shows SET entry_close_date = current_date + 3
   WHERE id = '00000000-0000-0000-0000-000000579060';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT entry_open_date, entry_close_date INTO v_open, v_close
    FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579060';
  IF v_n <> 1 OR v_close IS DISTINCT FROM (current_date + 3)::timestamptz THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL published-valid-change: expected the new close date to land (rows=%, close=%)', v_n, v_close;
  END IF;

  -- A legacy non-midnight window is compared by UTC calendar day, the reading
  -- the entry-open/close guards use: opening at 15:00 and closing at 02:00 on
  -- the same UTC day is a valid one-day window, not an inverted one. (A
  -- regression raises MK005 here, uncaught, which fails the file.)
  UPDATE public.shows
     SET entry_open_date = ((current_date + 4)::timestamp + interval '15 hours') AT TIME ZONE 'UTC',
         entry_close_date = ((current_date + 4)::timestamp + interval '2 hours') AT TIME ZONE 'UTC'
   WHERE id = '00000000-0000-0000-0000-000000579060';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL published-same-utc-day: expected a same-UTC-day window to land, affected %', v_n;
  END IF;

  -- A draft may still clear or reverse its window (579061 is a draft).
  UPDATE public.shows SET entry_open_date = NULL, entry_close_date = NULL
   WHERE id = '00000000-0000-0000-0000-000000579061';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE EXCEPTION 'FAIL draft-clear-window: expected the draft to clear its window, affected %', v_n;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE 'PASS published-window-edits: a published show cannot clear or reverse its window (MK005), a valid change passes (a same-UTC-day legacy window included), and a draft can clear it';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 12h. Never retroactive: 579014 was inserted already published with NO
--      window (section 6's fixture, club with no Stripe account). An edit that
--      re-sends its unchanged NULL dates, as a full-row client save does,
--      still lands; only a CHANGE to a published show's dates is checked.
DO $$
DECLARE
  v_n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);
  UPDATE public.shows
     SET name = 'MYK9-716 Legacy Windowless Published (renamed)',
         entry_open_date = NULL, entry_close_date = NULL
   WHERE id = '00000000-0000-0000-0000-000000579014';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL legacy-windowless-edit: expected the rename to land, affected %', v_n;
  END IF;
  RAISE NOTICE 'PASS legacy-windowless-edit: an unchanged (NULL) window on an already-published show is never re-gated';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);


ROLLBACK;
