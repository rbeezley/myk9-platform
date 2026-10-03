-- MYK9-979: per-show online-entries switch (shows.online_entries_enabled).
--
--   0. private.show_status_is_public agrees with the APPLIED shows_anon_select
--      status list for every status the CHECK constraint permits, and the
--      publish-gate trigger also fires on UPDATE OF online_entries_enabled.
--   1. Online entries OFF, authorized club, NO Stripe account: publishing
--      succeeds (the Oct 10 check-and-cash show).
--   2. Online entries ON, no Stripe payouts: publishing is refused, MK003,
--      PUBLISH_BLOCKED_MESSAGE.
--   3. Turning online entries ON for a published show without Stripe payouts
--      is refused, MK003, ONLINE_ENTRIES_BLOCKED_MESSAGE; with payouts it is
--      allowed (positive control).
--   4. An UNAUTHORIZED club cannot make a show public through ANY public
--      status: published, upcoming, in_progress, completed all refuse MK004,
--      by UPDATE and by INSERT.
--   5. Draft -> upcoming / in_progress run the entry-window check (MK005) and,
--      with online entries on, the Stripe check (MK003) -- the bypass closed.
--   6. Moving between two public statuses is not re-gated; back to draft
--      always passes.
--   7. service_role stays exempt (an unauthorized, windowless, online-on show
--      goes upcoming).
--   8. submit_show_entries with online entries OFF: an exhibitor (self-
--      service) is refused 42501; a club admin keying a mail-in entry for that
--      exhibitor's dog still succeeds; turning the switch on lets the same
--      exhibitor call succeed (positive control proving the refusal came from
--      the switch).
--   9. The migration's backfill, replayed verbatim, writes every show with a
--      fresh updated_at (the replica's sync key) and the right value.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- Fixture identities follow myk9_841_staff_on_behalf_entries_accepted_test.sql
-- (people first, auth.users second with the same email, then auth_user_id).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Wiring and the one status list
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policy text;
  v_policy_statuses text[];
  v_status text;
  v_columns text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_policy
    FROM pg_policy p
   WHERE p.polrelid = 'public.shows'::regclass AND p.polname = 'shows_anon_select';
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'FAIL wiring: shows_anon_select not found';
  END IF;
  SELECT array_agg(m[1]) INTO v_policy_statuses
    FROM regexp_matches(v_policy, '''([a-z_]+)''::text', 'g') AS m;
  IF coalesce(array_length(v_policy_statuses, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FAIL wiring: could not read a status list from shows_anon_select: %', v_policy;
  END IF;

  FOREACH v_status IN ARRAY ARRAY['draft', 'published', 'upcoming', 'in_progress', 'completed', 'cancelled'] LOOP
    IF private.show_status_is_public(v_status) IS DISTINCT FROM (v_status = ANY (v_policy_statuses)) THEN
      RAISE EXCEPTION 'FAIL status list: show_status_is_public(%) = %, shows_anon_select statuses = %',
        v_status, private.show_status_is_public(v_status), v_policy_statuses;
    END IF;
  END LOOP;
  IF private.show_status_is_public(NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL status list: a NULL status must not be public';
  END IF;

  SELECT string_agg(a.attname, ',' ORDER BY a.attname) INTO v_columns
    FROM pg_trigger t
    CROSS JOIN LATERAL unnest(t.tgattr::int2[]) AS col(attnum)
    JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = col.attnum
   WHERE t.tgrelid = 'public.shows'::regclass AND t.tgname = 'trg_enforce_show_publish_gate';
  IF v_columns IS DISTINCT FROM 'entry_close_date,entry_open_date,online_entries_enabled,status' THEN
    RAISE EXCEPTION 'FAIL wiring: trg_enforce_show_publish_gate fires on UPDATE OF %', v_columns;
  END IF;

  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shows'
         AND column_name = 'online_entries_enabled') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FAIL wiring: shows.online_entries_enabled must DEFAULT false';
  END IF;

  RAISE NOTICE 'PASS 0 status list matches shows_anon_select %; trigger and default wired', v_policy_statuses;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (plain postgres session; the gates carve it out)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000000979001', 'MYK9-979 Check And Cash Club', now()),
  ('00000000-0000-0000-0000-000000979002', 'MYK9-979 Stripe Ready Club', now()),
  ('00000000-0000-0000-0000-000000979003', 'MYK9-979 Unauthorized Club', NULL);

-- Club 001 has NO club_stripe_accounts row at all. 002 and 003 are ready in
-- the platform's (test) mode, so 003's refusals can only be MK004.
INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES
  ('00000000-0000-0000-0000-000000979002', 'acct_myk9979_ready', true, true, false),
  ('00000000-0000-0000-0000-000000979003', 'acct_myk9979_unauth', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000979101', 'MYK9-979 Mail-In Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false, true, true, 30),
  ('00000000-0000-0000-0000-000000979102', 'MYK9-979 Online No Stripe', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true, true, true, 30),
  ('00000000-0000-0000-0000-000000979103', 'MYK9-979 Published Off No Stripe', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979001', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false, true, true, 30),
  ('00000000-0000-0000-0000-000000979104', 'MYK9-979 Published Off Stripe Ready', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979002', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false, true, true, 30),
  ('00000000-0000-0000-0000-000000979105', 'MYK9-979 Unauthorized Draft', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979003', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, false, true, true, 30),
  ('00000000-0000-0000-0000-000000979106', 'MYK9-979 Windowless Draft', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979001', 'draft',
   NULL, NULL, false, true, true, 30),
  ('00000000-0000-0000-0000-000000979107', 'MYK9-979 Online Draft No Stripe', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979001', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true, true, true, 30),
  ('00000000-0000-0000-0000-000000979108', 'MYK9-979 Service Role Draft', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979003', 'draft',
   NULL, NULL, true, true, true, 30);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (
  '00000000-0000-0000-0000-000000979200', '00000000-0000-0000-0000-000000979101',
  'MYK9-979 Saturday Trial', current_date + 5, 'UKC', 'Nosework'
);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000979301', '00000000-0000-0000-0000-000000979200',
   'Novice B Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000979302', '00000000-0000-0000-0000-000000979200',
   'Novice B Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000979303', '00000000-0000-0000-0000-000000979200',
   'Novice B Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000979011', 'MYK9-979', 'ClubAdmin', 'myk9-979-admin@example.test'),
  ('00000000-0000-0000-0000-000000979012', 'MYK9-979', 'Exhibitor', 'myk9-979-exhibitor@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000979021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-979-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000979022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-979-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000979011'::uuid, '00000000-0000-0000-0000-000000979021'::uuid),
  ('00000000-0000-0000-0000-000000979012'::uuid, '00000000-0000-0000-0000-000000979022'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

-- One club admin for all three clubs, so every refusal below is the gate's,
-- never RLS hiding the row.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000979011', roles.id, club.id, true,
       '00000000-0000-0000-0000-000000979021'
FROM public.roles
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000000979001'::uuid),
  ('00000000-0000-0000-0000-000000979002'::uuid),
  ('00000000-0000-0000-0000-000000979003'::uuid)
) AS club(id)
WHERE roles.name = 'club_admin';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id, co_owner_id)
VALUES ('00000000-0000-0000-0000-000000979401', 'MYK9-979 Exhibitor Dog', 'Mailie', 'Beagle',
        'active', '00000000-0000-0000-0000-000000979012', NULL);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000000979401', 'UKC', 'SR97900001', true);

-- The exhibitor's own registration on the mail-in show.
INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000979501', '00000000-0000-0000-0000-000000979101',
        '00000000-0000-0000-0000-000000979012');

-- ---------------------------------------------------------------------------
-- 1-6. Publish gates, as the club admin through the API role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000000979021';
  v_status text;
  v_online boolean;
  v_target text;
  v_seq int := 0;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  -- 1. Online off, authorized club, no Stripe account: publishes.
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000979101';
  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979101';
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL 1 online-off show did not publish (status %)', v_status;
  END IF;
  RAISE NOTICE 'PASS 1 online entries off + no Stripe account publishes';

  -- 2. Online on, no Stripe: MK003 with the publish copy.
  BEGIN
    UPDATE public.shows SET status = 'published'
     WHERE id = '00000000-0000-0000-0000-000000979102';
    RAISE EXCEPTION 'FAIL 2 online-on show published without Stripe payouts';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    IF SQLERRM IS DISTINCT FROM 'Connect your club''s payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.' THEN
      RAISE EXCEPTION 'FAIL 2 wrong MK003 text: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'PASS 2 online entries on + no Stripe payouts refused MK003';

  -- 3. Turning online entries on for a PUBLISHED show without Stripe: MK003.
  BEGIN
    UPDATE public.shows SET online_entries_enabled = true
     WHERE id = '00000000-0000-0000-0000-000000979103';
    RAISE EXCEPTION 'FAIL 3 online entries turned on for a published show without Stripe payouts';
  EXCEPTION WHEN SQLSTATE 'MK003' THEN
    IF SQLERRM IS DISTINCT FROM 'Connect your club''s payment account before turning on online entries — online entry fees need somewhere to go. Find it under My Club → Payments.' THEN
      RAISE EXCEPTION 'FAIL 3 wrong MK003 text: %', SQLERRM;
    END IF;
  END;
  SELECT online_entries_enabled INTO v_online FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000979103';
  IF v_online IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 3 refused toggle still changed the row';
  END IF;
  -- Positive control: a Stripe-ready club may turn it on after publishing.
  UPDATE public.shows SET online_entries_enabled = true
   WHERE id = '00000000-0000-0000-0000-000000979104';
  SELECT online_entries_enabled INTO v_online FROM public.shows
   WHERE id = '00000000-0000-0000-0000-000000979104';
  IF v_online IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3 positive control: Stripe-ready published show could not turn online entries on';
  END IF;
  -- Turning it back off is never gated.
  UPDATE public.shows SET online_entries_enabled = false
   WHERE id = '00000000-0000-0000-0000-000000979104';
  RAISE NOTICE 'PASS 3 false -> true on a public show needs Stripe payouts; off is free';

  -- 4. Unauthorized club: every public status refuses MK004, by UPDATE ...
  FOREACH v_target IN ARRAY ARRAY['published', 'upcoming', 'in_progress', 'completed'] LOOP
    BEGIN
      UPDATE public.shows SET status = v_target
       WHERE id = '00000000-0000-0000-0000-000000979105';
      RAISE EXCEPTION 'FAIL 4 unauthorized club made a show public via %', v_target;
    EXCEPTION WHEN SQLSTATE 'MK004' THEN
      NULL;
    END;
  END LOOP;
  -- ... and by INSERT of an already-public row.
  FOREACH v_target IN ARRAY ARRAY['published', 'upcoming', 'in_progress', 'completed'] LOOP
    v_seq := v_seq + 1;
    BEGIN
      INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                                entry_open_date, entry_close_date)
      VALUES (('00000000-0000-0000-0000-00000097911' || v_seq)::uuid, 'MYK9-979 Insert ' || v_target,
              'UKC', current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000979003',
              v_target, (current_date - 10)::timestamptz, (current_date + 4)::timestamptz);
      RAISE EXCEPTION 'FAIL 4 unauthorized club inserted a % show', v_target;
    EXCEPTION WHEN SQLSTATE 'MK004' THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 4 unauthorized club cannot make a show public through any status (UPDATE and INSERT)';

  -- 5. The Upcoming / In Progress bypass is closed: window and Stripe checks run.
  FOREACH v_target IN ARRAY ARRAY['upcoming', 'in_progress'] LOOP
    BEGIN
      UPDATE public.shows SET status = v_target
       WHERE id = '00000000-0000-0000-0000-000000979106';
      RAISE EXCEPTION 'FAIL 5 windowless draft went % with no entry window', v_target;
    EXCEPTION WHEN SQLSTATE 'MK005' THEN
      NULL;
    END;
    BEGIN
      UPDATE public.shows SET status = v_target
       WHERE id = '00000000-0000-0000-0000-000000979107';
      RAISE EXCEPTION 'FAIL 5 online-on draft went % without Stripe payouts', v_target;
    EXCEPTION WHEN SQLSTATE 'MK003' THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 5 draft -> upcoming / in_progress runs the window (MK005) and Stripe (MK003) checks';

  -- 6. Between two public statuses: not re-gated. Back to draft: always passes.
  UPDATE public.shows SET status = 'upcoming'
   WHERE id = '00000000-0000-0000-0000-000000979101';
  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000000979101';
  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979101';
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL 6 public -> public move was refused (status %)', v_status;
  END IF;
  UPDATE public.shows SET status = 'draft'
   WHERE id = '00000000-0000-0000-0000-000000979103';
  SELECT status INTO v_status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979103';
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'FAIL 6 back to draft was refused (status %)', v_status;
  END IF;
  RAISE NOTICE 'PASS 6 public -> public is not re-gated; back to draft passes';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 7. service_role stays exempt
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.shows SET status = 'upcoming'
 WHERE id = '00000000-0000-0000-0000-000000979108';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT status FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979108')
     IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION 'FAIL 7 service_role was gated';
  END IF;
  RAISE NOTICE 'PASS 7 service_role bypasses the gates (unauthorized, windowless, online on)';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. submit_show_entries on the published, online-OFF show 979101
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth     CONSTANT uuid := '00000000-0000-0000-0000-000000979021';
  exhibitor_auth CONSTANT uuid := '00000000-0000-0000-0000-000000979022';
  show_id        CONSTANT uuid := '00000000-0000-0000-0000-000000979101';
  reg_id         CONSTANT uuid := '00000000-0000-0000-0000-000000979501';
  dog_id         CONSTANT uuid := '00000000-0000-0000-0000-000000979401';
  result         jsonb;
  v_count        int;
BEGIN
  -- 8a. Staff mail-in entry still works with online entries off.
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);
  result := public.submit_show_entries(
    show_id, reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', dog_id, 'class_id', '00000000-0000-0000-0000-000000979301'::uuid,
      'handler_name', 'MYK9-979 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000979901'::uuid, 'check');
  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL 8a staff mail-in entry was not created with online entries off: %', result;
  END IF;
  RAISE NOTICE 'PASS 8a staff mail-in entry works with online entries off';

  -- 8b. The exhibitor is refused, and nothing is written.
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);
  BEGIN
    result := public.submit_show_entries(
      show_id, reg_id,
      jsonb_build_array(jsonb_build_object(
        'dog_id', dog_id, 'class_id', '00000000-0000-0000-0000-000000979302'::uuid,
        'handler_name', 'MYK9-979 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000979902'::uuid, 'check');
    RAISE EXCEPTION 'FAIL 8b exhibitor entered a show with online entries off: %', result;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'online entries are not open for show %' THEN
      RAISE EXCEPTION 'FAIL 8b refused for the wrong reason: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.entries
   WHERE show_id = '00000000-0000-0000-0000-000000979101'
     AND class_id = '00000000-0000-0000-0000-000000979302';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 8b a refused exhibitor submission wrote % entries', v_count;
  END IF;
  RAISE NOTICE 'PASS 8b exhibitor submit_show_entries refused 42501 with online entries off';

  -- 8c. Positive control: the same call succeeds once online entries are on
  --     (switched by the superuser session, which the gate carves out).
  UPDATE public.shows SET online_entries_enabled = true
   WHERE id = '00000000-0000-0000-0000-000000979101';
  SET LOCAL ROLE authenticated;
  result := public.submit_show_entries(
    show_id, reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', dog_id, 'class_id', '00000000-0000-0000-0000-000000979303'::uuid,
      'handler_name', 'MYK9-979 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000979903'::uuid, 'check');
  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL 8c exhibitor entry was not created with online entries on: %', result;
  END IF;
  RAISE NOTICE 'PASS 8c exhibitor entry succeeds once online entries are on';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 9. The migration's backfill, replayed verbatim (publishGateMigrationContract
--    pins this text to the migration). It must write EVERY show and bump
--    updated_at, the column replicas pull on (Codex P2 on #2707): a row left
--    at the DEFAULT would never re-sync to a cached replica.
-- ---------------------------------------------------------------------------
UPDATE public.shows s
   SET online_entries_enabled = (
         s.club_id IS NOT NULL
         AND public.can_accept_online_entry_payment(
               s.club_id,
               (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true)
             )
       ),
       updated_at = now();

DO $$
DECLARE
  v_total int;
  v_stale int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE updated_at IS DISTINCT FROM now())
    INTO v_total, v_stale
    FROM public.shows;
  IF v_total = 0 OR v_stale <> 0 THEN
    RAISE EXCEPTION 'FAIL 9 backfill left % of % shows without a fresh updated_at', v_stale, v_total;
  END IF;
  IF (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979104') IS DISTINCT FROM true
     OR (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979105') IS DISTINCT FROM true
     OR (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979101') IS DISTINCT FROM false
     OR (SELECT online_entries_enabled FROM public.shows WHERE id = '00000000-0000-0000-0000-000000979107') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 9 backfill value: true exactly for Stripe-ready clubs';
  END IF;
  RAISE NOTICE 'PASS 9 backfill writes every show (% rows) with a fresh updated_at; true only for Stripe-ready clubs', v_total;
END;
$$;

ROLLBACK;
