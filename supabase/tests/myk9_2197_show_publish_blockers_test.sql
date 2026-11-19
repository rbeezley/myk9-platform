-- MYK9-2197: one list of what blocks a show from publishing, read by the RPCs
-- and enforced by the publish triggers
-- (20261119223100_myk9_2197_show_publish_blockers.sql).
--
--   0. Wiring: the RPCs exist and are open to `authenticated` only; the two
--      private helpers are closed to every API role.
--   1. List == refusal, for EVERY combination of the five keys (club approved
--      x payouts x premium x entry dates {ok, missing, out of order} = 24
--      shows): as a club admin through the API role, public.show_publish_
--      blockers lists a key iff the publish UPDATE is refused; an empty list
--      publishes; otherwise the refusal is the FIRST listed key's code and
--      text (MK004 / MK003 / MK005, the existing messages, and the new premium
--      message). The refusal leaves the row a draft.
--   2. The list's other fields: waiting_on and eta per key (a club with a bank
--      account under review waits on stripe).
--   3. Premium: a club that publishes its own is exempt; a stale premium
--      (updated after publishing) counts as published; a blank url or a missing
--      timestamp does not.
--   4. Demo clubs stay payouts-exempt but are not exempt from approval or the
--      premium line.
--   5. The INSERT arm (create_show_with_children, published) reads the same
--      list (also an unapproved club, MK004); an already-public show is never
--      re-gated on the premium and its list is empty. Half the combinations in 1
--      publish to 'upcoming' instead of 'published'.
--   6. The club-level RPC returns only the club lines, to a club admin.
--   7. Authorization: an outsider and anon are refused on both RPCs; a missing
--      show is refused with 42501 as well (nobody can manage it), not described.
--   8. The bypass is unchanged: service_role publishes a show with every
--      blocker, and so does a direct superuser session.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- Fixture identities follow myk9_2163_publish_needs_payouts_test.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Wiring
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.show_publish_blockers(uuid)') IS NULL
     OR to_regprocedure('public.club_publish_blockers(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0 a blockers RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.show_publish_blockers(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.club_publish_blockers(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 authenticated cannot execute a blockers RPC';
  END IF;
  IF has_function_privilege('anon', 'public.show_publish_blockers(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.club_publish_blockers(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 anon can execute a blockers RPC';
  END IF;
  IF has_function_privilege('authenticated', 'private.club_publish_blockers_for(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.club_publish_blockers_for(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.show_publish_blockers_for(public.shows)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.show_publish_blockers_for(public.shows)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 an API role can execute a private blockers helper';
  END IF;
  RAISE NOTICE 'PASS 0 RPCs open to authenticated only; helpers closed to API roles';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (plain postgres session; the gates carve it out)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

-- Four clubs, one per (approved, payouts) pair, plus a demo club and a club
-- whose bank account is submitted and under review:
--   001 approved,   payouts      002 approved,   no payouts
--   003 unapproved, payouts      004 unapproved, no payouts
--   005 demo (approved, no payout account)
--   006 approved, account submitted (onboarding_complete) but payouts not enabled
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000002197001', 'MYK9-2197 Approved Payouts', now()),
  ('00000000-0000-0000-0000-000002197002', 'MYK9-2197 Approved No Payouts', now()),
  ('00000000-0000-0000-0000-000002197003', 'MYK9-2197 Unapproved Payouts', NULL),
  ('00000000-0000-0000-0000-000002197004', 'MYK9-2197 Unapproved No Payouts', NULL),
  ('00000000-0000-0000-0000-000002197005', 'MYK9-2197 Demo Club', now()),
  ('00000000-0000-0000-0000-000002197006', 'MYK9-2197 Under Stripe Review', now());

UPDATE public.clubs SET is_demo = true WHERE id = '00000000-0000-0000-0000-000002197005';

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000002197001', 'acct_myk92197_a', true, true, false),
  ('00000000-0000-0000-0000-000002197003', 'acct_myk92197_c', true, true, false),
  ('00000000-0000-0000-0000-000002197006', 'acct_myk92197_f', true, false, false);

-- 24 draft shows, one per combination, spelled in the name as well as the id:
--   a: club approved (1) / not (0)      p: payouts (1) / not (0)
--   r: premium published (1) / not (0)  d: dates 0 ok, 1 missing, 2 out of order
-- The id suffix is 2197 followed by the four digits a p r d (e.g. ...21971110).
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          published_premium_url, published_premium_at)
SELECT ('00000000-0000-0000-0000-00002197' || a || p || r || d)::uuid,
       'MYK9-2197 combo a' || a || ' p' || p || ' r' || r || ' d' || d,
       'UKC', current_date + 5, current_date + 6,
       CASE (a * 2 + p)
         WHEN 3 THEN '00000000-0000-0000-0000-000002197001'::uuid
         WHEN 2 THEN '00000000-0000-0000-0000-000002197002'::uuid
         WHEN 1 THEN '00000000-0000-0000-0000-000002197003'::uuid
         ELSE '00000000-0000-0000-0000-000002197004'::uuid
       END,
       'draft',
       CASE d WHEN 0 THEN (current_date - 10)::timestamptz
              WHEN 1 THEN NULL
              ELSE (current_date + 4)::timestamptz END,
       CASE d WHEN 0 THEN (current_date + 4)::timestamptz
              WHEN 1 THEN NULL
              ELSE (current_date - 10)::timestamptz END,
       true,
       CASE r WHEN 1 THEN 'premium-published/2197/premium.pdf' ELSE NULL END,
       CASE r WHEN 1 THEN now() ELSE NULL END
  FROM generate_series(0, 1) AS a,
       generate_series(0, 1) AS p,
       generate_series(0, 1) AS r,
       generate_series(0, 2) AS d;

-- One-off shows for the premium, demo and insert sections (all draft, window
-- fine, club approved with payouts unless noted).
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          publishes_own_premium, published_premium_url, published_premium_at)
VALUES
  -- 201 own premium, nothing published
  ('00000000-0000-0000-0000-000002197201', 'MYK9-2197 Own Premium', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   true, NULL, NULL),
  -- 202 stale premium: published a day before the row's updated_at
  ('00000000-0000-0000-0000-000002197202', 'MYK9-2197 Stale Premium', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, 'premium-published/2197/stale.pdf', now() - interval '1 day'),
  -- 203 blank url with a timestamp
  ('00000000-0000-0000-0000-000002197203', 'MYK9-2197 Blank Url', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, '   ', now()),
  -- 204 url with no timestamp
  ('00000000-0000-0000-0000-000002197204', 'MYK9-2197 No Timestamp', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, 'premium-published/2197/nots.pdf', NULL),
  -- 205 demo club, no payout account, premium published
  ('00000000-0000-0000-0000-000002197205', 'MYK9-2197 Demo Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197005', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, 'premium-published/2197/demo.pdf', now()),
  -- 206 demo club, no premium
  ('00000000-0000-0000-0000-000002197206', 'MYK9-2197 Demo No Premium', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197005', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, NULL, NULL),
  -- 207 under Stripe review, premium published
  ('00000000-0000-0000-0000-000002197207', 'MYK9-2197 Under Review', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197006', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, 'premium-published/2197/review.pdf', now()),
  -- 208 already public, no premium (published before this rule), club fine
  ('00000000-0000-0000-0000-000002197208', 'MYK9-2197 Already Public', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197001', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
   false, NULL, NULL),
  -- 209 bypass: every blocker at once (unapproved, no payouts, no premium, no dates)
  ('00000000-0000-0000-0000-000002197209', 'MYK9-2197 Bypass A', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197004', 'draft',
   NULL, NULL, true, false, NULL, NULL),
  ('00000000-0000-0000-0000-000002197210', 'MYK9-2197 Bypass B', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002197004', 'draft',
   NULL, NULL, true, false, NULL, NULL);

INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-000002197011', 'MYK9-2197', 'ClubAdmin', 'myk9-2197-admin@example.test'),
  ('00000000-0000-0000-0000-000002197012', 'MYK9-2197', 'Outsider', 'myk9-2197-outsider@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002197021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2197-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002197022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2197-outsider@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002197021'
 WHERE id = '00000000-0000-0000-0000-000002197011';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002197022'
 WHERE id = '00000000-0000-0000-0000-000002197012';

-- One club admin for every club (so every refusal is the gate's, never RLS
-- hiding the row); the outsider holds no role anywhere.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002197011', roles.id, club.id, true,
       '00000000-0000-0000-0000-000002197021'
FROM public.roles
CROSS JOIN (SELECT id FROM public.clubs WHERE name LIKE 'MYK9-2197 %') AS club(id)
WHERE roles.name = 'club_admin';

-- ---------------------------------------------------------------------------
-- 1-6 as the club admin through the API role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002197021';
  c_unapproved CONSTANT text := 'This club hasn''t been authorized by myK9 yet. Shows can be built now and published once the club is approved.';
  c_payouts    CONSTANT text := 'This club''s payouts aren''t enabled yet, so the show can''t be published. A club admin connects the bank account on the club''s Payments tab. If Stripe is reviewing the account, that usually takes a day or two.';
  c_premium    CONSTANT text := 'Publish the premium list before publishing the show, or turn on "We publish our own premium list" in the show''s settings. Exhibitors need the premium to enter.';
  c_missing    CONSTANT text := 'Set the entry window before publishing. Exhibitors need to know when entries open and close.';
  c_order      CONSTANT text := 'The entry window can''t close before it opens. Fix the entry dates, then publish.';
  c_published  CONSTANT text := 'A published show has to keep its entry window: both dates set, and the close on or after the open. Discard this change or fix the dates.';
  a int; p int; r int; d int;
  v_id uuid;
  v_list jsonb;
  v_keys text[];
  v_first text;
  v_expected_state text;
  v_expected_message text;
  v_state text;
  v_message text;
  v_status text;
  v_combos int := 0;
  v_target text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  -- 1. Every combination: the list and the refusal agree.
  FOR a IN 0..1 LOOP FOR p IN 0..1 LOOP FOR r IN 0..1 LOOP FOR d IN 0..2 LOOP
    v_id := ('00000000-0000-0000-0000-00002197' || a || p || r || d)::uuid;
    v_list := public.show_publish_blockers(v_id);

    SELECT coalesce(array_agg(e->>'key' ORDER BY ord), ARRAY[]::text[])
      INTO v_keys
      FROM jsonb_array_elements(v_list) WITH ORDINALITY AS t(e, ord);

    -- The list holds exactly the keys the combination calls for, in refusal order.
    IF v_keys IS DISTINCT FROM (
         SELECT coalesce(array_agg(k ORDER BY pos), ARRAY[]::text[]) FROM (VALUES
           (1, CASE WHEN a = 0 THEN 'club_not_approved' END),
           (2, CASE WHEN p = 0 THEN 'payouts_not_enabled' END),
           (3, CASE WHEN r = 0 THEN 'premium_not_published' END),
           (4, CASE WHEN d = 1 THEN 'entry_dates_missing' END),
           (5, CASE WHEN d = 2 THEN 'entry_dates_out_of_order' END)
         ) AS x(pos, k) WHERE k IS NOT NULL) THEN
      RAISE EXCEPTION 'FAIL 1 combo a% p% r% d%: wrong list %', a, p, r, d, v_keys;
    END IF;

    v_first := v_keys[1];
    v_expected_state := CASE v_first
      WHEN 'club_not_approved' THEN 'MK004'
      WHEN 'payouts_not_enabled' THEN 'MK003'
      WHEN 'premium_not_published' THEN 'MK003'
      WHEN 'entry_dates_missing' THEN 'MK005'
      WHEN 'entry_dates_out_of_order' THEN 'MK005'
      ELSE NULL END;
    v_expected_message := CASE v_first
      WHEN 'club_not_approved' THEN c_unapproved
      WHEN 'payouts_not_enabled' THEN c_payouts
      WHEN 'premium_not_published' THEN c_premium
      WHEN 'entry_dates_missing' THEN c_missing
      WHEN 'entry_dates_out_of_order' THEN c_order
      ELSE NULL END;

    v_target := CASE WHEN (a + p + r + d) % 2 = 0 THEN 'published' ELSE 'upcoming' END;
    v_state := NULL;
    v_message := NULL;
    BEGIN
      -- Two public targets: 'published' and 'upcoming' (both become public).
      UPDATE public.shows SET status = v_target
       WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
      v_message := SQLERRM;
    END;

    IF cardinality(v_keys) = 0 THEN
      IF v_state IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL 1 combo a% p% r% d%: empty list but the publish was refused (% %)', a, p, r, d, v_state, v_message;
      END IF;
      SELECT status INTO v_status FROM public.shows WHERE id = v_id;
      IF v_status IS DISTINCT FROM v_target THEN
        RAISE EXCEPTION 'FAIL 1 combo a% p% r% d%: empty list but the show is %', a, p, r, d, v_status;
      END IF;
    ELSE
      IF v_state IS DISTINCT FROM v_expected_state OR v_message IS DISTINCT FROM v_expected_message THEN
        RAISE EXCEPTION 'FAIL 1 combo a% p% r% d%: listed % but the refusal was % %', a, p, r, d, v_keys, v_state, v_message;
      END IF;
      SELECT status INTO v_status FROM public.shows WHERE id = v_id;
      IF v_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'FAIL 1 combo a% p% r% d%: a refused publish changed the row (%)', a, p, r, d, v_status;
      END IF;
    END IF;
    v_combos := v_combos + 1;
  END LOOP; END LOOP; END LOOP; END LOOP;
  IF v_combos <> 24 THEN
    RAISE EXCEPTION 'FAIL 1 expected 24 combinations, ran %', v_combos;
  END IF;
  RAISE NOTICE 'PASS 1 the list matches the refusal for all 24 combinations';

  -- 2. waiting_on and eta.
  v_list := public.show_publish_blockers('00000000-0000-0000-0000-000021970000');
  -- a0 p0 r0 d0: unapproved, no payouts, no premium, dates fine.
  IF v_list->0 IS DISTINCT FROM '{"key":"club_not_approved","waiting_on":"myk9","eta":"about a day"}'::jsonb
     OR v_list->1 IS DISTINCT FROM '{"key":"payouts_not_enabled","waiting_on":"club_admin","eta":null}'::jsonb
     OR v_list->2 IS DISTINCT FROM '{"key":"premium_not_published","waiting_on":"secretary","eta":null}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 2 wrong waiting_on / eta: %', v_list;
  END IF;
  v_list := public.show_publish_blockers('00000000-0000-0000-0000-000002197207');
  IF v_list IS DISTINCT FROM '[{"key":"payouts_not_enabled","waiting_on":"stripe","eta":"a day or two"}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 2 a club under Stripe review waits on stripe: %', v_list;
  END IF;
  RAISE NOTICE 'PASS 2 waiting_on and eta per key';

  -- 3. Premium.
  IF public.show_publish_blockers('00000000-0000-0000-0000-000002197201') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 3 a club that publishes its own premium is still blocked on it';
  END IF;
  IF public.show_publish_blockers('00000000-0000-0000-0000-000002197202') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 3 a stale premium counts as published';
  END IF;
  IF (public.show_publish_blockers('00000000-0000-0000-0000-000002197203')->0->>'key') IS DISTINCT FROM 'premium_not_published'
     OR (public.show_publish_blockers('00000000-0000-0000-0000-000002197204')->0->>'key') IS DISTINCT FROM 'premium_not_published' THEN
    RAISE EXCEPTION 'FAIL 3 a blank url or a missing timestamp is not a published premium';
  END IF;
  UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197201';
  UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197202';
  RAISE NOTICE 'PASS 3 own-premium exempt; stale counts; blank url / no timestamp do not';

  -- 4. Demo clubs.
  IF public.show_publish_blockers('00000000-0000-0000-0000-000002197205') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 4 a demo club with a premium is blocked: %',
      public.show_publish_blockers('00000000-0000-0000-0000-000002197205');
  END IF;
  UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197205';
  IF (SELECT array_agg(e->>'key') FROM jsonb_array_elements(
        public.show_publish_blockers('00000000-0000-0000-0000-000002197206')) e) IS DISTINCT FROM
     ARRAY['premium_not_published'] THEN
    RAISE EXCEPTION 'FAIL 4 a demo club is exempt from payouts only';
  END IF;
  v_state := NULL;
  BEGIN
    UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197206';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_state := SQLERRM;
  END;
  IF v_state IS DISTINCT FROM c_premium THEN
    RAISE EXCEPTION 'FAIL 4 a demo club without a premium published: %', v_state;
  END IF;
  RAISE NOTICE 'PASS 4 demo clubs are payouts-exempt only';

  -- 5. INSERT arm through the Add Show RPC, and an already-public show (its list is empty).
  v_state := NULL;
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000002197301',
        'name', 'MYK9-2197 Insert Published, No Premium',
        'organization', 'UKC',
        'start_date', (current_date + 5)::text,
        'end_date', (current_date + 6)::text,
        'club_id', '00000000-0000-0000-0000-000002197001',
        'status', 'published',
        'entry_open_date', (current_date - 10)::text,
        'entry_close_date', (current_date + 4)::text,
        'accept_check_payments', true,
        'accept_cash_payments', true
      ),
      '[]'::jsonb, '[]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL 5 create_show_with_children inserted a published show without a premium';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    v_state := SQLERRM;
  END;
  IF v_state IS DISTINCT FROM c_premium THEN
    RAISE EXCEPTION 'FAIL 5 wrong MK003 text on the INSERT arm: %', v_state;
  END IF;
  IF public.show_publish_blockers('00000000-0000-0000-0000-000002197208') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5 an already-public show lists a blocker: %',
      public.show_publish_blockers('00000000-0000-0000-0000-000002197208');
  END IF;
  -- A second INSERT combination: an unapproved club is refused first (MK004).
  v_state := NULL;
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000002197302',
        'name', 'MYK9-2197 Insert Published, Unapproved Club',
        'organization', 'UKC',
        'start_date', (current_date + 5)::text,
        'end_date', (current_date + 6)::text,
        'club_id', '00000000-0000-0000-0000-000002197004',
        'status', 'published',
        'entry_open_date', (current_date - 10)::text,
        'entry_close_date', (current_date + 4)::text,
        'accept_check_payments', true,
        'accept_cash_payments', true
      ),
      '[]'::jsonb, '[]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL 5 create_show_with_children inserted a published show for an unapproved club';
  EXCEPTION WHEN SQLSTATE 'MK004' THEN
    v_state := SQLERRM;
  END;
  IF v_state IS DISTINCT FROM c_unapproved THEN
    RAISE EXCEPTION 'FAIL 5 wrong MK004 text on the INSERT arm: %', v_state;
  END IF;
  -- Never re-gated on the premium: a valid window change still saves ...
  UPDATE public.shows SET entry_close_date = (current_date + 3)::timestamptz
   WHERE id = '00000000-0000-0000-0000-000002197208';
  -- ... and a window change that clears the dates still refuses with the
  -- published-window text, read from the same list.
  v_state := NULL;
  BEGIN
    UPDATE public.shows SET entry_open_date = NULL WHERE id = '00000000-0000-0000-0000-000002197208';
  EXCEPTION WHEN SQLSTATE 'MK005' THEN
    v_state := SQLERRM;
  END;
  IF v_state IS DISTINCT FROM c_published THEN
    RAISE EXCEPTION 'FAIL 5 an already-public show cleared its window: %', v_state;
  END IF;
  RAISE NOTICE 'PASS 5 INSERT arm reads the list; a public show is not re-gated on the premium';

  -- 6. Club-level RPC: the club lines only.
  IF (SELECT array_agg(e->>'key') FROM jsonb_array_elements(
        public.club_publish_blockers('00000000-0000-0000-0000-000002197004')) e) IS DISTINCT FROM
     ARRAY['club_not_approved', 'payouts_not_enabled'] THEN
    RAISE EXCEPTION 'FAIL 6 club lines for an unapproved club without payouts: %',
      public.club_publish_blockers('00000000-0000-0000-0000-000002197004');
  END IF;
  IF public.club_publish_blockers('00000000-0000-0000-0000-000002197001') <> '[]'::jsonb
     OR public.club_publish_blockers('00000000-0000-0000-0000-000002197005') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 6 an approved club with payouts, or a demo club, lists a club line';
  END IF;
  RAISE NOTICE 'PASS 6 club_publish_blockers returns the club lines only';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Authorization
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  outsider_auth CONSTANT uuid := '00000000-0000-0000-0000-000002197022';
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', outsider_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', outsider_auth, 'role', 'authenticated')::text, true);

  v_state := NULL;
  BEGIN
    PERFORM public.show_publish_blockers('00000000-0000-0000-0000-000021970000');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7 an outsider read a show''s blockers (%)', v_state;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM public.club_publish_blockers('00000000-0000-0000-0000-000002197001');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7 an outsider read a club''s blockers (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 7a an outsider is refused on both RPCs';
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_state text;
BEGIN
  v_state := NULL;
  BEGIN
    PERFORM public.show_publish_blockers('00000000-0000-0000-0000-000021970000');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7 anon called show_publish_blockers (%)', v_state;
  END IF;
  v_state := NULL;
  BEGIN
    PERFORM public.club_publish_blockers('00000000-0000-0000-0000-000002197001');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7 anon called club_publish_blockers (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 7b anon is refused on both RPCs';
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002197021';
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);
  v_state := NULL;
  BEGIN
    PERFORM public.show_publish_blockers('00000000-0000-0000-0000-000002197999');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  -- A show that does not exist is not manageable by anyone: refused, not leaked.
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 7 a missing show answered with % instead of a refusal', v_state;
  END IF;
  RAISE NOTICE 'PASS 7c a missing show is refused, not described';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 8. The bypass is unchanged
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197209';
RESET ROLE;

-- A plain postgres session (no SET ROLE).
UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002197210';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.shows
       WHERE id IN ('00000000-0000-0000-0000-000002197209', '00000000-0000-0000-0000-000002197210')
         AND status = 'published') <> 2 THEN
    RAISE EXCEPTION 'FAIL 8 service_role or the migration role was gated';
  END IF;
  RAISE NOTICE 'PASS 8 service_role and a superuser session still bypass the gate';
END;
$$;

ROLLBACK;
