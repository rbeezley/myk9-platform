-- MYK9-2163: online entries are always on, and publishing needs the club's
-- payouts (20261118021300_myk9_2163_publish_needs_payouts.sql).
--
--   0. Wiring: shows.online_entries_enabled DEFAULTs true; the helper exists
--      and no API role can execute it.
--   1. Refused without payouts: a club with no payout account cannot publish,
--      with online entries on OR off (MK003, PUBLISH_BLOCKED_MESSAGE verbatim),
--      by UPDATE and by create_show_with_children INSERT; the row stays draft.
--   2. Allowed with payouts: a Stripe-ready club publishes.
--   3. Allowed for a demo club (clubs.is_demo) with no payout account at all.
--      The exemption is the publish gate's only: can_accept_online_entry_payment
--      (checkout's check) still says no for that club.
--   4. Draft unaffected: a club with no payouts creates a draft through
--      create_show_with_children (online entries on, even when p_show sends
--      an explicit false), edits it, and sets and clears its entry window.
--      A draft can never be created with online entries off or switched off:
--      an authenticated INSERT with false, an UPDATE to false and
--      set_show_online_entries(id, false) are refused (MK003,
--      ONLINE_ENTRIES_ALWAYS_ON_MESSAGE verbatim). A legacy draft that is
--      already off (staged as postgres) stays editable: window, status among
--      non-public values, and turning it on.
--   5. Online entries cannot be turned off on a public show, by a direct
--      UPDATE or by set_show_online_entries (MK003,
--      ONLINE_ENTRIES_ALWAYS_ON_MESSAGE); publishing a legacy draft that is
--      still off is refused (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE verbatim).
--   6. The migration role and service_role still bypass the gate, and the
--      migration's data UPDATE, replayed verbatim
--      (publishGateMigrationContract pins this copy), turns every row with
--      online entries off on with a fresh updated_at, soft-deleted and
--      published rows included; a row already on is not touched.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- Fixture identities follow myk9_979_online_entries_switch_test.sql (people
-- first, auth.users second with the same email, then auth_user_id).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Wiring
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shows'
         AND column_name = 'online_entries_enabled') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FAIL 0 shows.online_entries_enabled must DEFAULT true';
  END IF;
  IF to_regprocedure('private.club_publish_payouts_ok(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0 private.club_publish_payouts_ok(uuid) is missing';
  END IF;
  IF has_function_privilege('anon', 'private.club_publish_payouts_ok(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.club_publish_payouts_ok(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 an API role can execute private.club_publish_payouts_ok';
  END IF;
  RAISE NOTICE 'PASS 0 column default true; helper present and closed to API roles';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (plain postgres session; the gates carve it out)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

-- Every club is myK9-authorized, so MK004 never fires and every refusal
-- below is this gate's. 001 has no payout account, 002 is Stripe-ready in
-- the platform's (test) mode, 003 is a demo club with no payout account,
-- 004 has payouts only in the OTHER (live) mode.
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000002163001', 'MYK9-2163 No Payouts Club', now()),
  ('00000000-0000-0000-0000-000002163002', 'MYK9-2163 Payouts Club', now()),
  ('00000000-0000-0000-0000-000002163003', 'MYK9-2163 Demo Club', now()),
  ('00000000-0000-0000-0000-000002163004', 'MYK9-2163 Live Only Club', now());

-- is_demo is writable only outside the API roles (guard_club_is_demo_write).
UPDATE public.clubs SET is_demo = true WHERE id = '00000000-0000-0000-0000-000002163003';

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000002163002', 'acct_myk92163_ready', true, true, false),
  ('00000000-0000-0000-0000-000002163004', 'acct_myk92163_live_only', true, true, true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled)
VALUES
  ('00000000-0000-0000-0000-000002163101', 'MYK9-2163 No Payouts, Online On', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002163102', 'MYK9-2163 No Payouts, Online Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false),
  ('00000000-0000-0000-0000-000002163103', 'MYK9-2163 Live Only Club Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163004', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002163104', 'MYK9-2163 Payouts Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163002', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002163105', 'MYK9-2163 Demo Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163003', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002163106', 'MYK9-2163 Payouts Show, Online Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163002', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false),
  -- A legacy draft with online entries off, staged outside the API roles.
  ('00000000-0000-0000-0000-000002163109', 'MYK9-2163 Legacy Off Draft', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
   NULL, NULL, false);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000002163011', 'MYK9-2163', 'ClubAdmin', 'myk9-2163-admin@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002163021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2163-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
   SET auth_user_id = '00000000-0000-0000-0000-000002163021'
 WHERE id = '00000000-0000-0000-0000-000002163011';

-- One club admin for every club, so every refusal below is the gate's,
-- never RLS hiding the row.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002163011', roles.id, club.id, true,
       '00000000-0000-0000-0000-000002163021'
FROM public.roles
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000002163001'::uuid),
  ('00000000-0000-0000-0000-000002163002'::uuid),
  ('00000000-0000-0000-0000-000002163003'::uuid),
  ('00000000-0000-0000-0000-000002163004'::uuid)
) AS club(id)
WHERE roles.name = 'club_admin';

-- ---------------------------------------------------------------------------
-- 1-5, as the club admin through the API role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002163021';
  c_blocked  CONSTANT text := 'This club''s payouts aren''t enabled yet, so the show can''t be published. A club admin connects the bank account on the club''s Payments tab. If Stripe is reviewing the account, that usually takes a day or two.';
  c_required CONSTANT text := 'A published show always takes online entries. Turn online entries on, or keep this show as a draft.';
  c_always   CONSTANT text := 'Every show takes online entries. This can''t be turned off.';
  v_target text;
  v_status text;
  v_online boolean;
  v_message text;
  v_show_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  -- 1a. No payouts, online on and online off: refused into every public
  --     status, with the payouts text, and the rows stay draft.
  FOREACH v_target IN ARRAY ARRAY['published', 'upcoming', 'in_progress', 'completed'] LOOP
    FOREACH v_show_id IN ARRAY ARRAY['00000000-0000-0000-0000-000002163101'::uuid,
                                      '00000000-0000-0000-0000-000002163102'::uuid] LOOP
      v_message := NULL;
      BEGIN
        UPDATE public.shows SET status = v_target WHERE id = v_show_id;
        RAISE EXCEPTION 'FAIL 1a show % went % without payouts', v_show_id, v_target;
      EXCEPTION WHEN SQLSTATE 'MK003' THEN
        v_message := SQLERRM;
      END;
      IF v_message IS DISTINCT FROM c_blocked THEN
        RAISE EXCEPTION 'FAIL 1a wrong MK003 text for show % going %: %', v_show_id, v_target, v_message;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.shows
              WHERE id IN ('00000000-0000-0000-0000-000002163101', '00000000-0000-0000-0000-000002163102')
                AND status IS DISTINCT FROM 'draft') THEN
    RAISE EXCEPTION 'FAIL 1a a refused publish changed a row';
  END IF;

  -- 1b. Payouts in the OTHER Stripe mode do not count.
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000002163103';
    RAISE EXCEPTION 'FAIL 1b a live-mode-only club published while the platform is in test mode';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    NULL;
  END;

  -- 1c. INSERT arm, through the Add Show RPC: a published show for a club
  --     with no payouts is refused on payouts (the RPC ignores the explicit
  --     online_entries_enabled false and creates the row with it on).
  v_message := NULL;
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000002163107',
        'name', 'MYK9-2163 Insert Published, No Payouts',
        'organization', 'UKC',
        'start_date', (current_date + 5)::text,
        'end_date', (current_date + 6)::text,
        'club_id', '00000000-0000-0000-0000-000002163001',
        'status', 'published',
        'entry_open_date', (current_date - 10)::text,
        'entry_close_date', (current_date + 4)::text,
        'accept_check_payments', true,
        'accept_cash_payments', true,
        'online_entries_enabled', false
      ),
      '[]'::jsonb, '[]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL 1c create_show_with_children inserted a published show without payouts';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_message := SQLERRM;
  END;
  IF v_message IS DISTINCT FROM c_blocked THEN
    RAISE EXCEPTION 'FAIL 1c wrong MK003 text: %', v_message;
  END IF;
  RAISE NOTICE 'PASS 1 no payouts: publishing is refused (MK003) whatever online entries say, by UPDATE and INSERT';

  -- 2. With payouts: publishes.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000002163104';
  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163104';
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL 2 a Stripe-ready club could not publish (status %)', v_status;
  END IF;
  RAISE NOTICE 'PASS 2 a club with payouts publishes';

  -- 3. A demo club with no payout account publishes.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000002163105';
  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163105';
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL 3 a demo club could not publish (status %)', v_status;
  END IF;
  IF public.can_accept_online_entry_payment('00000000-0000-0000-0000-000002163003', false) THEN
    RAISE EXCEPTION 'FAIL 3 the demo exemption reached checkout''s payment check';
  END IF;
  RAISE NOTICE 'PASS 3 a demo club publishes without payouts; checkout''s check still refuses it';

  -- 4. Draft unaffected, for a club with no payouts.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000002163108',
      'name', 'MYK9-2163 Draft, No Payouts',
      'organization', 'UKC',
      'start_date', (current_date + 5)::text,
      'end_date', (current_date + 6)::text,
      'club_id', '00000000-0000-0000-0000-000002163001',
      'accept_check_payments', true,
      'accept_cash_payments', true
    ),
    '[]'::jsonb, '[]'::jsonb, NULL);
  SELECT status, online_entries_enabled INTO v_status, v_online
    FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163108';
  IF v_status IS DISTINCT FROM 'draft' OR v_online IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 4 the new draft should be draft with online entries on, got % / %', v_status, v_online;
  END IF;
  UPDATE public.shows SET name = 'MYK9-2163 Draft, No Payouts (renamed)',
                          entry_open_date = (current_date - 10)::timestamptz,
                          entry_close_date = (current_date + 4)::timestamptz
   WHERE id = '00000000-0000-0000-0000-000002163108';
  UPDATE public.shows SET entry_open_date = NULL, entry_close_date = NULL
   WHERE id = '00000000-0000-0000-0000-000002163108';
  IF (SELECT entry_open_date FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163108') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4 the draft could not clear its window';
  END IF;

  -- 4b. The Add Show RPC ignores an explicit online_entries_enabled false
  --     (what the deployed wizard sends): the draft is created with it on.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000002163110',
      'name', 'MYK9-2163 Draft, Explicit False',
      'organization', 'UKC',
      'start_date', (current_date + 5)::text,
      'end_date', (current_date + 6)::text,
      'club_id', '00000000-0000-0000-0000-000002163001',
      'accept_check_payments', true,
      'accept_cash_payments', true,
      'online_entries_enabled', false
    ),
    '[]'::jsonb, '[]'::jsonb, NULL);
  IF (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163110') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 4b create_show_with_children kept an explicit false';
  END IF;

  -- 4c. A direct authenticated INSERT of a draft with it off is refused.
  v_message := NULL;
  BEGIN
    INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                              online_entries_enabled)
    VALUES ('00000000-0000-0000-0000-000002163111', 'MYK9-2163 Draft Insert Off', 'UKC',
            current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
            false);
    RAISE EXCEPTION 'FAIL 4c a draft was inserted with online entries off';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_message := SQLERRM;
  END;
  IF v_message IS DISTINCT FROM c_always THEN
    RAISE EXCEPTION 'FAIL 4c wrong MK003 text: %', v_message;
  END IF;

  -- 4d. A draft cannot be switched off, by UPDATE or by the RPC.
  v_message := NULL;
  BEGIN
    UPDATE public.shows SET online_entries_enabled = false
     WHERE id = '00000000-0000-0000-0000-000002163108';
    RAISE EXCEPTION 'FAIL 4d a draft was switched off by UPDATE';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_message := SQLERRM;
  END;
  IF v_message IS DISTINCT FROM c_always THEN
    RAISE EXCEPTION 'FAIL 4d wrong MK003 text from the UPDATE: %', v_message;
  END IF;
  v_message := NULL;
  BEGIN
    PERFORM public.set_show_online_entries('00000000-0000-0000-0000-000002163108', false);
    RAISE EXCEPTION 'FAIL 4d a draft was switched off by set_show_online_entries';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_message := SQLERRM;
  END;
  IF v_message IS DISTINCT FROM c_always THEN
    RAISE EXCEPTION 'FAIL 4d wrong MK003 text from the RPC: %', v_message;
  END IF;
  IF (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163108') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 4d a refused change turned the draft off';
  END IF;

  -- 4e. A legacy draft that is already off stays editable: its window, its
  --     status among non-public values, and turning online entries on.
  UPDATE public.shows
     SET entry_open_date = (current_date - 10)::timestamptz,
         entry_close_date = (current_date + 4)::timestamptz
   WHERE id = '00000000-0000-0000-0000-000002163109';
  UPDATE public.shows SET status = 'cancelled'
   WHERE id = '00000000-0000-0000-0000-000002163109';
  UPDATE public.shows SET status = 'draft'
   WHERE id = '00000000-0000-0000-0000-000002163109';
  SELECT status, online_entries_enabled INTO v_status, v_online
    FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163109';
  IF v_status IS DISTINCT FROM 'draft' OR v_online IS DISTINCT FROM false
     OR (SELECT entry_open_date FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163109') IS NULL THEN
    RAISE EXCEPTION 'FAIL 4e the legacy off draft''s edits did not land (% / %)', v_status, v_online;
  END IF;
  PERFORM public.set_show_online_entries('00000000-0000-0000-0000-000002163109', true);
  IF (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163109') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 4e the legacy off draft could not turn online entries on';
  END IF;
  RAISE NOTICE 'PASS 4 a draft is built in full before payouts and can never be switched off; a legacy off draft stays editable and can turn it on';

  -- 5a. A public show cannot turn online entries off, directly or by RPC.
  FOREACH v_show_id IN ARRAY ARRAY['00000000-0000-0000-0000-000002163104'::uuid,
                                    '00000000-0000-0000-0000-000002163105'::uuid] LOOP
    v_message := NULL;
    BEGIN
      UPDATE public.shows SET online_entries_enabled = false WHERE id = v_show_id;
      RAISE EXCEPTION 'FAIL 5a show % turned online entries off while public', v_show_id;
    EXCEPTION WHEN SQLSTATE 'MK003' THEN
      v_message := SQLERRM;
    END;
    IF v_message IS DISTINCT FROM c_always THEN
      RAISE EXCEPTION 'FAIL 5a wrong MK003 text: %', v_message;
    END IF;
    v_message := NULL;
    BEGIN
      PERFORM public.set_show_online_entries(v_show_id, false);
      RAISE EXCEPTION 'FAIL 5a set_show_online_entries turned show % off while public', v_show_id;
    EXCEPTION WHEN SQLSTATE 'MK003' THEN
      v_message := SQLERRM;
    END;
    IF v_message IS DISTINCT FROM c_always THEN
      RAISE EXCEPTION 'FAIL 5a wrong MK003 text from the RPC: %', v_message;
    END IF;
    IF (SELECT online_entries_enabled FROM public.shows WHERE id = v_show_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL 5a a refused change turned show % off', v_show_id;
    END IF;
  END LOOP;

  -- 5b. Publishing a payouts-ready legacy draft that is still off (staged as
  --     postgres) is refused, never silently flipped on.
  v_message := NULL;
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000002163106';
    RAISE EXCEPTION 'FAIL 5b a show with online entries off was published';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_message := SQLERRM;
  END;
  IF v_message IS DISTINCT FROM c_required THEN
    RAISE EXCEPTION 'FAIL 5b wrong MK003 text: %', v_message;
  END IF;
  SELECT status, online_entries_enabled INTO v_status, v_online
    FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163106';
  IF v_status IS DISTINCT FROM 'draft' OR v_online IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 5b the refused publish changed the row (% / %)', v_status, v_online;
  END IF;

  -- 5c. Moving a public show back to draft still passes, with online
  --     entries still on.
  UPDATE public.shows SET status = 'draft'
   WHERE id = '00000000-0000-0000-0000-000002163104';
  SELECT status, online_entries_enabled INTO v_status, v_online
    FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163104';
  IF v_status IS DISTINCT FROM 'draft' OR v_online IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 5c back to draft did not land (% / %)', v_status, v_online;
  END IF;
  RAISE NOTICE 'PASS 5 online entries cannot be turned off on a public show (UPDATE and RPC), and a legacy off draft cannot be published while off';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 6. The migration's data UPDATE, replayed verbatim. Fixture rows are written
--    as postgres (outside the gate): a published, a draft and a soft-deleted
--    show with online entries off, and one already on with an old updated_at.
-- ---------------------------------------------------------------------------
-- 6a. The migration role (no SET ROLE) and service_role are outside the
--     gate's API-role carve-out: both may still turn a show off.
UPDATE public.shows SET online_entries_enabled = false
 WHERE id = '00000000-0000-0000-0000-000002163108';
SET LOCAL ROLE service_role;
UPDATE public.shows SET online_entries_enabled = false
 WHERE id = '00000000-0000-0000-0000-000002163110';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.shows
       WHERE id IN ('00000000-0000-0000-0000-000002163108', '00000000-0000-0000-0000-000002163110')
         AND online_entries_enabled IS FALSE) <> 2 THEN
    RAISE EXCEPTION 'FAIL 6a the migration role or service_role was gated';
  END IF;
  RAISE NOTICE 'PASS 6a the migration role and service_role bypass the online-entries check';
END;
$$;

-- updated_at is set a day back on INSERT (update_shows_updated_at fires on
-- UPDATE only), so the replay's bump, and its absence, are visible.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          deleted_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000002163201', 'MYK9-2163 Legacy Published Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false,
   NULL, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000002163202', 'MYK9-2163 Legacy Draft Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
   NULL, NULL, false, NULL, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000002163203', 'MYK9-2163 Legacy Deleted Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163001', 'draft',
   NULL, NULL, false, now(), now() - interval '1 day'),
  ('00000000-0000-0000-0000-000002163204', 'MYK9-2163 Already On', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002163002', 'draft',
   NULL, NULL, true, NULL, now() - interval '1 day');

UPDATE public.shows
   SET online_entries_enabled = true,
       updated_at = now()
 WHERE online_entries_enabled IS DISTINCT FROM true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shows WHERE online_entries_enabled IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'FAIL 6 a show still has online entries off after the data UPDATE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shows
              WHERE id IN ('00000000-0000-0000-0000-000002163201', '00000000-0000-0000-0000-000002163202',
                           '00000000-0000-0000-0000-000002163203')
                AND updated_at IS DISTINCT FROM now()) THEN
    RAISE EXCEPTION 'FAIL 6 a changed row did not get a fresh updated_at (replicas would not re-pull it)';
  END IF;
  IF (SELECT updated_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163204') = now() THEN
    RAISE EXCEPTION 'FAIL 6 a row already on was rewritten';
  END IF;
  IF (SELECT status FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163201') IS DISTINCT FROM 'published'
     OR (SELECT deleted_at FROM public.shows WHERE id = '00000000-0000-0000-0000-000002163203') IS NULL THEN
    RAISE EXCEPTION 'FAIL 6 the data UPDATE changed a status or a soft delete';
  END IF;
  RAISE NOTICE 'PASS 6 the data UPDATE turns every off row on with a fresh updated_at (published, draft, soft-deleted) and leaves rows already on alone';
END;
$$;

ROLLBACK;
