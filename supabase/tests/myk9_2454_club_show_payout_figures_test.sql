-- MYK9-2454: club_show_payout_figures, a club's Collected, Refunded, owed and Paid per show.
-- Behavioural contract for 20261126183700_myk9_2454_club_show_payout_figures.sql.
--
-- Asserts:
--   1. anon cannot execute it; authenticated can (catalog and a real call);
--   2. a NULL club, another club's admin, a show-pinned-only admin, a plain account and a
--      caller with no identity are refused with 42501, never handed an empty set;
--   3. the club's club-wide admin gets exactly the club's money shows (not another club's, not
--      a desk-only show), and a site admin gets the same rows;
--   4. a partial refund: collected 5000, refunded 2000, owed 3000;
--   5. a refund larger than the fee floors owed at 0 (payoutCalc.ts);
--   6. cash and check entries are left out of every figure;
--   7. a fully refunded show closed with a completed $0 row: paid_cents 0, status completed;
--   8. a completed $50 row: paid_cents 5000;
--   9. a failed row followed by a pending row picks the pending row, and a pending row beats a
--      NEWER failed row (status first, then recency: pickCanonicalPayout);
--  10. a soft-deleted show is still returned, with show_deleted true and its money counted.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000002454001', 'MYK9-2454 Club'),
  ('00000000-0000-0000-0000-000002454002', 'MYK9-2454 Other Club');

-- S1 partial refund + failed then pending; S2 refund above fee; S3 fully refunded, completed $0;
-- S4 completed $50 with desk money beside it; S5 soft-deleted, pending beats a newer failed;
-- S6 desk money only (not returned); SB the other club's show.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES
  ('00000000-0000-0000-0000-000002454011', 'MYK9-2454 Partial', 'AKC', current_date, current_date + 1,
   '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454012', 'MYK9-2454 Over', 'AKC', current_date, current_date + 1,
   '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454013', 'MYK9-2454 Fully Refunded', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454014', 'MYK9-2454 Paid', 'AKC', current_date, current_date + 1,
   '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454015', 'MYK9-2454 Deleted', 'AKC', current_date, current_date + 1,
   '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454016', 'MYK9-2454 Desk Only', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000002454001'),
  ('00000000-0000-0000-0000-000002454021', 'MYK9-2454 Other Club Show', 'AKC', current_date,
   current_date + 1, '00000000-0000-0000-0000-000002454002');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
SELECT ('00000000-0000-0000-0000-0000024540' || x.n)::uuid,
       ('00000000-0000-0000-0000-0000024540' || x.s)::uuid,
       'MYK9-2454 Trial ' || x.n, current_date, 'AKC', 'Scent Work', 'America/Chicago'
  FROM (VALUES ('31', '11'), ('32', '12'), ('33', '13'), ('34', '14'), ('35', '15'), ('36', '16'),
               ('41', '21')) AS x(n, s);

-- Unclaimed people first, then their sign-ins: handle_new_user adopts each row by email.
-- private.can_administer_club needs a live account, so every sign-in has been used.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000002454051', 'Club', 'Admin', 'myk9-2454-admin@example.test'),
  ('00000000-0000-0000-0000-000002454052', 'Other', 'ClubAdmin', 'myk9-2454-other@example.test'),
  ('00000000-0000-0000-0000-000002454053', 'Show', 'Pinned', 'myk9-2454-pinned@example.test'),
  ('00000000-0000-0000-0000-000002454054', 'Plain', 'Account', 'myk9-2454-plain@example.test'),
  ('00000000-0000-0000-0000-000002454055', 'Site', 'Admin', 'myk9-2454-site@example.test'),
  ('00000000-0000-0000-0000-000002454056', 'Entry', 'Handler', 'myk9-2454-handler@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000002454151', 'myk9-2454-admin@example.test'),
  ('00000000-0000-0000-0000-000002454152', 'myk9-2454-other@example.test'),
  ('00000000-0000-0000-0000-000002454153', 'myk9-2454-pinned@example.test'),
  ('00000000-0000-0000-0000-000002454154', 'myk9-2454-plain@example.test'),
  ('00000000-0000-0000-0000-000002454155', 'myk9-2454-site@example.test')
) AS v(id, email);

-- 051 club-wide admin of the club; 052 club-wide admin of the other club; 053 admin pinned to
-- show S1 only (is_club_admin is show-blind and would let 053 through).
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT v.person::uuid, r.id, v.club::uuid, v.show::uuid, true, v.auth::uuid
FROM public.roles r,
  (VALUES
    ('00000000-0000-0000-0000-000002454051', '00000000-0000-0000-0000-000002454001', NULL,
     '00000000-0000-0000-0000-000002454151'),
    ('00000000-0000-0000-0000-000002454052', '00000000-0000-0000-0000-000002454002', NULL,
     '00000000-0000-0000-0000-000002454152'),
    ('00000000-0000-0000-0000-000002454053', '00000000-0000-0000-0000-000002454001',
     '00000000-0000-0000-0000-000002454011', '00000000-0000-0000-0000-000002454153')
  ) AS v(person, club, show, auth)
WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002454055', r.id, true, '00000000-0000-0000-0000-000002454155'
FROM public.roles r WHERE r.name = 'site_admin';

-- Entries, written as the payment service writes them; refunds are stripe-refund-entry's stamp.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, handler_id, entry_status, payment_status,
                            payment_method, entry_fee)
SELECT ('00000000-0000-0000-0000-0000024542' || x.n)::uuid,
       ('00000000-0000-0000-0000-0000024540' || x.s)::uuid,
       ('00000000-0000-0000-0000-0000024540' || x.t)::uuid,
       '00000000-0000-0000-0000-000002454056', 'confirmed', 'paid', x.method, x.fee
  FROM (VALUES
    ('01', '11', '31', 'online', 50.00),  -- S1 partial refund of $20
    ('02', '12', '32', 'online', 25.00),  -- S2 refund of $30 against a $25 fee
    ('03', '13', '33', 'online', 40.00),  -- S3 fully refunded
    ('04', '14', '34', 'online', 50.00),  -- S4 paid
    ('05', '14', '34', 'cash', 25.00),    -- S4 desk cash: never in a transfer
    ('06', '14', '34', 'check', 15.00),   -- S4 desk check: never in a transfer
    ('07', '15', '35', 'online', 30.00),  -- S5 soft-deleted show
    ('08', '16', '36', 'cash', 20.00),    -- S6 desk only
    ('09', '21', '41', 'online', 99.00)   -- the other club's show
  ) AS x(n, s, t, method, fee);

UPDATE public.entries AS e
   SET refund_amount = x.refund, refunded_at = now(), payment_status = 'refunded'
  FROM (VALUES
    ('00000000-0000-0000-0000-000002454201'::uuid, 20.00),
    ('00000000-0000-0000-0000-000002454202'::uuid, 30.00),
    ('00000000-0000-0000-0000-000002454203'::uuid, 40.00)
  ) AS x(id, refund)
 WHERE e.id = x.id;
RESET ROLE;

INSERT INTO public.show_payouts (id, show_id, amount_cents, status, stripe_transfer_id,
                                 failure_reason, completed_at, created_at)
VALUES
  -- S1: a failed attempt, then the retry row waiting.
  ('00000000-0000-0000-0000-000002454301', '00000000-0000-0000-0000-000002454011', 3000, 'failed',
   NULL, 'insufficient_balance', NULL, now() - interval '2 days'),
  ('00000000-0000-0000-0000-000002454302', '00000000-0000-0000-0000-000002454011', 3000, 'pending',
   NULL, NULL, NULL, now() - interval '1 day'),
  -- S3: the payout run closed the fully refunded show at $0.
  ('00000000-0000-0000-0000-000002454303', '00000000-0000-0000-0000-000002454013', 0, 'completed',
   NULL, NULL, now(), now() - interval '1 day'),
  -- S4: $50 sent.
  ('00000000-0000-0000-0000-000002454304', '00000000-0000-0000-0000-000002454014', 5000, 'completed',
   'tr_myk9_2454', NULL, now(), now() - interval '1 day'),
  -- S5: a pending row, then a NEWER failed row: status decides before recency.
  ('00000000-0000-0000-0000-000002454305', '00000000-0000-0000-0000-000002454015', 3000, 'pending',
   NULL, NULL, NULL, now() - interval '2 days'),
  ('00000000-0000-0000-0000-000002454306', '00000000-0000-0000-0000-000002454015', 3000, 'failed',
   NULL, 'account_closed', NULL, now() - interval '1 day');

-- soft_delete_show() tombstones the show and its entries; the money is still real.
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000002454015';
UPDATE public.entries SET deleted_at = now() WHERE show_id = '00000000-0000-0000-0000-000002454015';

-- 1. Privileges, read from the catalog.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.club_show_payout_figures(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute club_show_payout_figures';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.club_show_payout_figures(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute club_show_payout_figures';
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 anon cannot execute, authenticated can';
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001');
    RAISE EXCEPTION 'FAIL anon read a club''s payout figures';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS MYK9-2454 anon is refused';
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;

-- 2. Refusals: an error, never an empty set.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002454151', true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.club_show_payout_figures(NULL);
    RAISE EXCEPTION 'FAIL a NULL club id returned rows instead of raising';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS MYK9-2454 a NULL club id raises';
END;
$$;

DO $$
DECLARE
  who text;
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000002454152', -- the other club's admin
    '00000000-0000-0000-0000-000002454153', -- show-pinned-only admin of this club
    '00000000-0000-0000-0000-000002454154', -- a plain account
    ''                                      -- no identity at all
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who, true);
    BEGIN
      PERFORM * FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001');
      RAISE EXCEPTION 'FAIL caller "%" read the club''s payout figures', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS MYK9-2454 another club''s admin, a show-pinned admin, a plain account and no identity are refused';
END;
$$;

-- 3 to 10, as the club's club-wide admin, then the same rows as a site admin.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002454151', true);
DO $$
DECLARE
  ids uuid[];
  r record;
BEGIN
  SELECT array_agg(f.show_id ORDER BY f.show_id) INTO ids
    FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f;
  IF ids IS DISTINCT FROM ARRAY[
    '00000000-0000-0000-0000-000002454011',
    '00000000-0000-0000-0000-000002454012',
    '00000000-0000-0000-0000-000002454013',
    '00000000-0000-0000-0000-000002454014',
    '00000000-0000-0000-0000-000002454015'
  ]::uuid[] THEN
    RAISE EXCEPTION 'FAIL the club admin got the wrong shows: %', ids;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 the club admin gets the club''s money shows, not the desk-only or other club''s show';

  SELECT * INTO r FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f
   WHERE f.show_id = '00000000-0000-0000-0000-000002454011';
  IF (r.collected_cents, r.refunded_cents, r.owed_cents) IS DISTINCT FROM (5000::bigint, 2000::bigint, 3000::bigint) THEN
    RAISE EXCEPTION 'FAIL partial refund: collected %, refunded %, owed %',
      r.collected_cents, r.refunded_cents, r.owed_cents;
  END IF;
  IF r.payout_id IS DISTINCT FROM '00000000-0000-0000-0000-000002454302'::uuid
     OR r.payout_status IS DISTINCT FROM 'pending'
     OR r.payout_failure_reason IS NOT NULL
     OR r.paid_cents IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'FAIL failed then pending: picked % (%), paid %', r.payout_id, r.payout_status, r.paid_cents;
  END IF;
  IF r.show_name IS DISTINCT FROM 'MYK9-2454 Partial' OR r.show_deleted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL partial refund show identity: % deleted %', r.show_name, r.show_deleted;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 a partial refund reads 5000 / 2000 / 3000 and the pending retry row is canonical';

  SELECT * INTO r FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f
   WHERE f.show_id = '00000000-0000-0000-0000-000002454012';
  IF (r.collected_cents, r.refunded_cents, r.owed_cents) IS DISTINCT FROM (2500::bigint, 3000::bigint, 0::bigint)
     OR r.payout_id IS NOT NULL OR r.payout_status IS NOT NULL OR r.payout_amount_cents IS NOT NULL
     OR r.paid_cents IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'FAIL refund above the fee: collected %, refunded %, owed %, payout %',
      r.collected_cents, r.refunded_cents, r.owed_cents, r.payout_id;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 a refund above the fee floors owed at 0, and no payout row reads all NULL';

  SELECT * INTO r FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f
   WHERE f.show_id = '00000000-0000-0000-0000-000002454013';
  IF (r.collected_cents, r.refunded_cents, r.owed_cents) IS DISTINCT FROM (4000::bigint, 4000::bigint, 0::bigint)
     OR r.payout_status IS DISTINCT FROM 'completed'
     OR r.payout_amount_cents IS DISTINCT FROM 0::bigint
     OR r.paid_cents IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'FAIL fully refunded show: owed %, status %, amount %, paid %',
      r.owed_cents, r.payout_status, r.payout_amount_cents, r.paid_cents;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 a fully refunded show closed at $0 reads paid_cents 0';

  SELECT * INTO r FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f
   WHERE f.show_id = '00000000-0000-0000-0000-000002454014';
  IF (r.collected_cents, r.refunded_cents, r.owed_cents) IS DISTINCT FROM (5000::bigint, 0::bigint, 5000::bigint) THEN
    RAISE EXCEPTION 'FAIL desk money counted: collected %, refunded %, owed %',
      r.collected_cents, r.refunded_cents, r.owed_cents;
  END IF;
  IF r.payout_status IS DISTINCT FROM 'completed' OR r.paid_cents IS DISTINCT FROM 5000::bigint
     OR r.payout_completed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL completed $50: status %, paid %', r.payout_status, r.paid_cents;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 cash and check are left out, and a completed $50 row reads paid_cents 5000';

  SELECT * INTO r FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f
   WHERE f.show_id = '00000000-0000-0000-0000-000002454015';
  IF r.show_deleted IS DISTINCT FROM true
     OR (r.collected_cents, r.refunded_cents, r.owed_cents) IS DISTINCT FROM (3000::bigint, 0::bigint, 3000::bigint) THEN
    RAISE EXCEPTION 'FAIL soft-deleted show: deleted %, collected %, owed %',
      r.show_deleted, r.collected_cents, r.owed_cents;
  END IF;
  IF r.payout_id IS DISTINCT FROM '00000000-0000-0000-0000-000002454305'::uuid THEN
    RAISE EXCEPTION 'FAIL a newer failed row beat the pending row: picked %', r.payout_id;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 a soft-deleted show is returned with its money, and pending beats a newer failed row';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002454155', true);
DO $$
DECLARE
  n integer;
  owed bigint;
BEGIN
  SELECT count(*), sum(f.owed_cents) INTO n, owed
    FROM public.club_show_payout_figures('00000000-0000-0000-0000-000002454001') f;
  IF n <> 5 OR owed IS DISTINCT FROM 11000::bigint THEN
    RAISE EXCEPTION 'FAIL a site admin got % rows owing %', n, owed;
  END IF;
  RAISE NOTICE 'PASS MYK9-2454 a site admin gets the same rows';
END;
$$;

ROLLBACK;
