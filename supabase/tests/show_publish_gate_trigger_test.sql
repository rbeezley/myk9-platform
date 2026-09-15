-- MYK9-579: enforce_show_publish_gate() is the DB-side backstop for the
-- draft->published Stripe-payouts gate that publishGateError
-- (ShowEditPanel.helpers.ts) and ShowStatusPill.tsx already enforce
-- client-side. A direct PostgREST `update shows set status='published'`
-- bypassed both of them before this trigger existed.
--
-- Matrix covered below: no club_stripe_accounts row; a row with
-- payouts_enabled=false; a row with payouts_enabled=true in the mode matching
-- platform_settings.stripe_livemode; a row with payouts_enabled=true in the
-- OTHER mode; an already-published show receiving an unrelated edit;
-- club_id IS NULL. Both livemode values are exercised by flipping
-- platform_settings inside this transaction.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

-- ---------------------------------------------------------------------------
-- Wiring: the guard must actually be attached, BEFORE, and scoped to
-- UPDATE OF status (not every column, and not INSERT — see the migration's
-- own comment for why INSERT is deliberately out of scope).
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
  IF v_timing <> 'BEFORE' THEN
    RAISE EXCEPTION 'FAIL wiring: guard must be BEFORE so the bad row never lands, found %', v_timing;
  END IF;
  IF v_columns <> 'status' THEN
    RAISE EXCEPTION 'FAIL wiring: expected UPDATE OF status only, found %', v_columns;
  END IF;
  IF NOT v_has_insert THEN
    RAISE EXCEPTION 'FAIL wiring: expected the trigger to also fire on INSERT (create_show_with_children and createShow() both let the caller set status)';
  END IF;
  IF NOT v_has_update THEN
    RAISE EXCEPTION 'FAIL wiring: expected the trigger to fire on UPDATE';
  END IF;
  RAISE NOTICE 'PASS wiring: BEFORE INSERT OR UPDATE OF status on public.shows';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: four clubs, one per matrix cell that needs its own
-- club_stripe_accounts state.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000000579001', 'MYK9-579 No Account Club'),
  ('00000000-0000-0000-0000-000000579002', 'MYK9-579 Payouts Disabled Club'),
  ('00000000-0000-0000-0000-000000579003', 'MYK9-579 Test-Mode Ready Club'),
  ('00000000-0000-0000-0000-000000579004', 'MYK9-579 Live-Mode Ready Club');

-- Pin the platform to test mode for the first half of this test.
-- trg_guard_platform_settings_write (20260615180000) is a BEFORE UPDATE/DELETE
-- guard that raises unless the caller is a site admin OR service_role -- this
-- fixture runs as postgres with no JWT, so it must reach the carve-out
-- explicitly, same as the seed's own manual-fix runbook.
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

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

-- Already-published fixture: inserted directly AS published (this trigger is
-- deliberately scoped to UPDATE OF status, not INSERT — see the migration
-- comment), so it starts published with no club_stripe_accounts row at all.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579014', 'MYK9-579 Already Published Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published');

-- ---------------------------------------------------------------------------
-- 1. No club_stripe_accounts row at all -> refused.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579010';
    RAISE EXCEPTION 'FAIL no-account: publish succeeded with no club_stripe_accounts row';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    v_state := 'MK003';
  END;
  IF v_message !~* 'payment account' THEN
    RAISE EXCEPTION 'FAIL no-account: unexpected message %', v_message;
  END IF;
  RAISE NOTICE 'PASS no-account: refused with MK003 and the payment-account message';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. A row with payouts_enabled=false -> refused.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579011';
    RAISE EXCEPTION 'FAIL payouts-disabled: publish succeeded with payouts_enabled=false';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RAISE NOTICE 'PASS payouts-disabled: refused with MK003';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. payouts_enabled=true in the mode MATCHING platform_settings.stripe_livemode
--    (both false here) -> succeeds.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_status text;
BEGIN
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579012';

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579012';

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL matching-mode: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS matching-mode: publish succeeds when payouts_enabled is true in the live platform mode';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. payouts_enabled=true, but only in the OTHER mode -> refused.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579013';
    RAISE EXCEPTION 'FAIL wrong-mode: publish succeeded against a live-mode-only account while the platform is in test mode';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RAISE NOTICE 'PASS wrong-mode: refused when the ready account is in the OTHER Stripe mode';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. club_id IS NULL -> refused, with the assign-a-club message (same SQLSTATE
--    as the Stripe-readiness refusal — only the message text tells them apart).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579015';
    RAISE EXCEPTION 'FAIL clubless: publish succeeded with club_id IS NULL';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;
  IF v_message !~* 'assign a club' THEN
    RAISE EXCEPTION 'FAIL clubless: unexpected message %', v_message;
  END IF;
  RAISE NOTICE 'PASS clubless: refused with the assign-a-club message';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. An already-published show receiving an edit that explicitly re-sets
--    status (still the same value) succeeds untouched — the gate only fires
--    on a transition INTO published, never on a show that is already there.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
  v_status text;
BEGIN
  UPDATE public.shows
     SET status = 'published', name = 'MYK9-579 Already Published Show (renamed)'
   WHERE id = '00000000-0000-0000-0000-000000579014';

  SELECT name, status INTO v_name, v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579014';

  IF v_status <> 'published' OR v_name <> 'MYK9-579 Already Published Show (renamed)' THEN
    RAISE EXCEPTION 'FAIL already-published: edit did not land (name=%, status=%)', v_name, v_status;
  END IF;
  RAISE NOTICE 'PASS already-published: an edit to a show already published is never re-gated, even with a club that has no Stripe account at all';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Flip platform_settings.stripe_livemode to TRUE and re-test clubs 3 and 4
--    with FRESH draft shows — the roles reverse.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = true WHERE id = true;
RESET ROLE;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579016', 'MYK9-579 Test-Mode Ready Show (live cutover)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579003', 'draft'),
  ('00000000-0000-0000-0000-000000579017', 'MYK9-579 Live-Mode Ready Show (live cutover)', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579004', 'draft');

DO $$
BEGIN
  -- Club 3's account is test-mode only; now that the platform is live, it is
  -- the account in the WRONG mode.
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579016';
    RAISE EXCEPTION 'FAIL live-cutover: a test-mode-only account was accepted once the platform switched to live mode';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RAISE NOTICE 'PASS live-cutover: the test-mode account no longer satisfies the gate once platform_settings.stripe_livemode flips to true';
  END;
END;
$$;

DO $$
DECLARE
  v_status text;
BEGIN
  -- Club 4's account is live-mode and payouts_enabled — now the matching one.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579017';

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579017';

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL live-cutover: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS live-cutover: the live-mode account satisfies the gate once platform_settings.stripe_livemode flips to true';
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. INSERT bypass (P1-2): the trigger now also fires on INSERT, so a
--    hand-crafted request cannot create an already-published show. Platform
--    is back in TEST mode from section 7's flip... actually still LIVE at
--    this point (section 7 flipped it true and never flipped it back) -- club
--    1 has no club_stripe_accounts row at all, so the mode is irrelevant to
--    these cases: can_accept_online_entry_payment's EXISTS check refuses
--    regardless of livemode.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000579200',
  'MYK9-579',
  'Secretary',
  '00000000-0000-0000-0000-000000579201'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000579200',
  id,
  '00000000-0000-0000-0000-000000579001', -- No Account Club
  true,
  '00000000-0000-0000-0000-000000579201'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000579200',
  id,
  '00000000-0000-0000-0000-000000579003', -- Test-Mode Ready Club
  true,
  '00000000-0000-0000-0000-000000579201'
FROM public.roles
WHERE name = 'secretary';

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
    IF v_message !~* 'payment account' THEN
      RAISE EXCEPTION 'FAIL insert-bypass-rpc: unexpected message %', v_message;
    END IF;
    RAISE NOTICE 'PASS insert-bypass-rpc: create_show_with_children refused an already-published INSERT with MK003';
  END;
END;
$$;
RESET ROLE;

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
    RAISE NOTICE 'PASS insert-bypass-direct: a direct INSERT of an already-published show was refused with MK003';
  END;
END;
$$;
RESET ROLE;

-- 8c. The service_role carve-out this same trigger needs so
--     supabase/seed-demo.sql's deliberate MYK9-386 fixture (clubs with no
--     Stripe account, published on purpose) keeps working. Not reachable
--     from any client path (see the migration header) -- only a connection
--     actually running AS service_role reaches it.
DO $$
DECLARE
  v_status text;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES (
    '00000000-0000-0000-0000-000000579030', 'MYK9-579 Service Role Seed Fixture', 'AKC',
    current_date, current_date + 1, '00000000-0000-0000-0000-000000579001', 'published'
  );
  RESET ROLE;

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579030';

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL service-role-carveout: expected the service_role INSERT to succeed, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS service-role-carveout: a service_role INSERT of an already-published show (the seed-demo.sql fixture shape) is exempt';
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
    RAISE NOTICE 'PASS authenticated-refusal: a real authenticated secretary was refused with MK003';
  END;
END;
$$;
RESET ROLE;

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
    RAISE NOTICE 'PASS authenticated-wrong-mode: a real authenticated secretary is still bound by the live-mode flip';
  END;
END;
$$;
RESET ROLE;

-- 9c. Flip the platform back to TEST mode and retry as the same authenticated
--     secretary against the now-matching club-3 account -> success. Proves
--     the RLS-scoped UPDATE (not just a superuser one) can actually publish.
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

DO $$
DECLARE
  v_status text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000579201', true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579041';

  SELECT status INTO v_status FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579041';
  RESET ROLE;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL authenticated-success: expected published, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS authenticated-success: a real authenticated secretary published once the club account matched platform mode';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 10. P3-8: an UPDATE that never touches status is never gated, even on a
--     clubless draft that would fail the gate if it tried to publish.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  UPDATE public.shows SET name = 'MYK9-579 Clubless Show (renamed)'
   WHERE id = '00000000-0000-0000-0000-000000579015';

  SELECT name INTO v_name FROM public.shows
  WHERE id = '00000000-0000-0000-0000-000000579015';

  IF v_name <> 'MYK9-579 Clubless Show (renamed)' THEN
    RAISE EXCEPTION 'FAIL name-only-update: rename did not land (name=%)', v_name;
  END IF;
  RAISE NOTICE 'PASS name-only-update: renaming a clubless draft never reaches the gate (UPDATE OF status only)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. P3-8: publish -> draft -> publish again after the club LOSES its
--     Stripe readiness in between -> the second publish is refused, proving
--     the "already-published exempt" branch does not leak into a show that
--     was moved back to draft.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000000579005', 'MYK9-579 Loses Readiness Club');

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000579005', 'acct_myk9579_loses_readiness', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000579050', 'MYK9-579 Loses Readiness Show', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000579005', 'draft');

DO $$
DECLARE
  v_status text;
BEGIN
  -- First publish: club is ready (test mode, matches the platform's current
  -- test-mode setting from section 9c's flip) -> succeeds.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000579050';

  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000579050';
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'FAIL republish: first publish should have succeeded, got %', v_status;
  END IF;

  -- Move back to draft: unaffected by the gate either way (only fires on a
  -- transition INTO published), and not itself under test here.
  UPDATE public.shows SET status = 'draft'
   WHERE id = '00000000-0000-0000-0000-000000579050';

  -- The club loses its Stripe readiness.
  UPDATE public.club_stripe_accounts SET payouts_enabled = false
   WHERE club_id = '00000000-0000-0000-0000-000000579005';

  -- Second publish attempt -> refused. The exemption is OLD.status =
  -- 'published' at the moment of THIS update, not "was published once".
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000579050';
    RAISE EXCEPTION 'FAIL republish: second publish succeeded after the club lost payouts_enabled';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    RAISE NOTICE 'PASS republish: publish -> draft -> publish is re-gated after the club loses Stripe readiness in between';
  END;
END;
$$;


ROLLBACK;
