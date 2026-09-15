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
BEGIN
  SELECT CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END,
         COALESCE((
           SELECT string_agg(a.attname, ',' ORDER BY a.attname)
           FROM unnest(t.tgattr::int2[]) AS col(attnum)
           JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = col.attnum
         ), '(none)')
    INTO v_timing, v_columns
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
  RAISE NOTICE 'PASS wiring: BEFORE UPDATE OF status on public.shows';
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
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;

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
UPDATE public.platform_settings SET stripe_livemode = true WHERE id = true;

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

ROLLBACK;
