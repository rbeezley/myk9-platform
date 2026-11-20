-- MYK9-2192: public.show_card_entries_paused(p_show_id)
-- (20261121174500_myk9_2192_show_card_entries_paused.sql).
--
--   0. Wiring: anon and authenticated may execute it; PUBLIC may not.
--   1. A published show whose club has no payout account: true, for anon.
--   2. A published show whose club has payouts in the platform's mode: false.
--   3. A club with payouts only in the OTHER mode: true (same mode rule as
--      checkout's can_accept_online_entry_payment).
--   4. A payouts-disabled account row: true.
--   5. A draft show, a soft-deleted show and an unknown id: false.
--   6. A demo club with no payouts: true (the publish gate's exemption is
--      never checkout's).
--   7. The answer follows the same predicate checkout rests on, for every
--      fixture show.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000002192001', 'MYK9-2192 No Payouts Club', now()),
  ('00000000-0000-0000-0000-000002192002', 'MYK9-2192 Payouts Club', now()),
  ('00000000-0000-0000-0000-000002192003', 'MYK9-2192 Live Only Club', now()),
  ('00000000-0000-0000-0000-000002192004', 'MYK9-2192 Payouts Off Club', now()),
  ('00000000-0000-0000-0000-000002192005', 'MYK9-2192 Demo Club', now());

UPDATE public.clubs SET is_demo = true WHERE id = '00000000-0000-0000-0000-000002192005';

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000002192002', 'acct_myk92192_ready', true, true, false),
  ('00000000-0000-0000-0000-000002192003', 'acct_myk92192_live_only', true, true, true),
  ('00000000-0000-0000-0000-000002192004', 'acct_myk92192_off', true, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled)
VALUES
  ('00000000-0000-0000-0000-000002192101', 'MYK9-2192 No Payouts', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192001', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192102', 'MYK9-2192 Payouts', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192002', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192103', 'MYK9-2192 Live Only', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192003', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192104', 'MYK9-2192 Payouts Off', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192004', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192105', 'MYK9-2192 Draft No Payouts', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192106', 'MYK9-2192 Deleted No Payouts', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192001', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true),
  ('00000000-0000-0000-0000-000002192107', 'MYK9-2192 Demo No Payouts', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002192005', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true);

UPDATE public.shows SET deleted_at = now()
 WHERE id = '00000000-0000-0000-0000-000002192106';

-- ---------------------------------------------------------------------------
-- 0. Wiring
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.show_card_entries_paused(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0 public.show_card_entries_paused(uuid) is missing';
  END IF;
  IF NOT has_function_privilege('anon', 'public.show_card_entries_paused(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.show_card_entries_paused(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 anon and authenticated must be able to execute show_card_entries_paused';
  END IF;
  IF has_function_privilege('public', 'public.show_card_entries_paused(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 PUBLIC must not execute show_card_entries_paused';
  END IF;
  RAISE NOTICE 'PASS 0 anon and authenticated execute; PUBLIC does not';
END;
$$;

-- ---------------------------------------------------------------------------
-- 1-6. The answer, asked as anon
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
BEGIN
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192101') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 1 published show, club with no payout account: expected true';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192102') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 2 published show, club with payouts: expected false';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192103') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 3 club with payouts only in the other mode: expected true';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192104') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 4 payouts-disabled account: expected true';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192105') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 5 draft show: expected false';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192106') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 5 soft-deleted show: expected false';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192999') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 5 unknown show: expected false';
  END IF;
  IF public.show_card_entries_paused(NULL) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 5 null show id: expected false';
  END IF;
  IF public.show_card_entries_paused('00000000-0000-0000-0000-000002192107') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 6 demo club with no payouts: expected true (checkout has no demo exemption)';
  END IF;
  RAISE NOTICE 'PASS 1-6 anon answers';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Same predicate as checkout's readiness check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT s.id, s.club_id
      FROM public.shows s
     WHERE s.id::text LIKE '00000000-0000-0000-0000-0000021921%'
       AND s.deleted_at IS NULL
       AND s.status = 'published'
  LOOP
    IF public.show_card_entries_paused(v_row.id)
       IS DISTINCT FROM NOT public.can_accept_online_entry_payment(v_row.club_id, false) THEN
      RAISE EXCEPTION 'FAIL 7 show % disagrees with can_accept_online_entry_payment', v_row.id;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 7 matches can_accept_online_entry_payment';
END;
$$;

ROLLBACK;
