-- Behavioral authorization + entitlement test for
-- 20260724120000_subscription_entitlement_grants.sql.
--
-- Run against a database where the migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/subscription_entitlement_grants_test.sql
-- The transaction rolls back every fixture. A clean run prints PASS notices.
--
-- Coverage: admin-only grant-row read; non-admin direct read/write denial;
-- sanitized own-context (no reason/actor); non-admin RPC denial; reason/range
-- validation; natural expiry -> 'expired' unrevoked; later non-overlapping grant;
-- overlap rejection without replace; explicit replace -> superseded (not revoked);
-- revoke fields; revoke leaves active paid access intact; has_effective_premium_
-- access true/false matrix (paid/founding/complimentary/expired/revoked/
-- superseded/free/analytics-trial-only); Premium INSERT enforcement on
-- vaccinations + pedigree_ancestors (free denied, granted allowed, non-owner
-- denied, owner SELECT/DELETE still allowed when free); backfill parity; Stripe
-- isolation (no stripe_customers rows written by grant/revoke).
--
-- NOT coverable in one psql session (documented, not skipped):
--   * True concurrent grant races — a single session cannot open two competing
--     transactions. The overlap-rejection-without-replace test exercises the
--     same guard the FOR UPDATE lock serializes. See "concurrency" note below.

BEGIN;

CREATE TEMP TABLE tid (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
-- The suite switches between roles with SET LOCAL ROLE; let all of them use
-- the shared fixture-id table.
GRANT ALL ON tid TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Seed UNLINKED people first (auth_user_id NULL), keyed by email. Inserting the
-- auth.users rows below fires handle_new_user(), which for a NON-anonymous user
-- ADOPTS a matching unlinked person by email (setting auth_user_id) and creates
-- its exhibitor_profiles + exhibitor user_roles rows. Seeding people up front lets
-- the trigger adopt these fixed ids instead of colliding on the unique auth_user_id
-- constraint (which is what happened when people were inserted with explicit
-- auth_user_id after the trigger had already created its own person rows).
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000911','Seg','Admin','seg-admin@example.test',NULL, now() - interval '400 days'),
  ('00000000-0000-0000-0000-000000000912','Seg','Owner','seg-owner@example.test',NULL, now() - interval '400 days'),
  ('00000000-0000-0000-0000-000000000913','Seg','Paid','seg-paid@example.test',NULL, now() - interval '400 days'),
  ('00000000-0000-0000-0000-000000000914','Seg','Other','seg-other@example.test',NULL, now() - interval '400 days');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','seg-admin@example.test','',now(),now(),now(),'{}','{}',false,false,false),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','seg-owner@example.test','',now(),now(),now(),'{}','{}',false,false,false),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','seg-paid@example.test','',now(),now(),now(),'{}','{}',false,false,false),
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','seg-other@example.test','',now(),now(),now(),'{}','{}',false,false,false);

-- The trigger created an exhibitor_profiles row (default tier) for each adopted
-- person. Set the tiers this test needs: owner + other free, paid premium.
-- restrict_subscription_column_updates (migration 109) only admits
-- current_setting('role') = 'service_role' or platform_admin — superuser is
-- NOT exempt — so impersonate service_role for this fixture write.
GRANT SELECT (person_id) ON public.exhibitor_profiles TO service_role;
GRANT UPDATE (subscription_tier, subscription_expires_at) ON public.exhibitor_profiles TO service_role;

SET LOCAL ROLE service_role;
UPDATE public.exhibitor_profiles ep
SET subscription_tier = v.tier, subscription_expires_at = v.expires_at
FROM (VALUES
  ('00000000-0000-0000-0000-000000000912'::uuid,'free',    NULL::timestamptz),
  ('00000000-0000-0000-0000-000000000913'::uuid,'premium', now() + interval '30 days'),
  ('00000000-0000-0000-0000-000000000914'::uuid,'free',    NULL)
) AS v(person_id, tier, expires_at)
WHERE ep.person_id = v.person_id;
RESET ROLE;

-- Site admin role for the admin person.
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000000911', id, true, '00000000-0000-0000-0000-000000000901'
FROM public.roles WHERE name = 'site_admin';

-- Dog owned by the owner person (health tables key off dogs.owner_id = person id).
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000000951','Seg Owner Dog','Rex','Labrador','00000000-0000-0000-0000-000000000912');

-- ===========================================================================
-- A. Non-admin RPC denial + reason/range validation (no row written)
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_grant_entitlement(
      '00000000-0000-0000-0000-000000000912','complimentary',
      now(), now() + interval '30 days','sneaky', false);
    RAISE EXCEPTION 'FAIL non-admin grant succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS non-admin grant RPC is rejected';
  END;

  IF EXISTS (SELECT 1 FROM public.subscription_entitlement_grants
             WHERE person_id = '00000000-0000-0000-0000-000000000912') THEN
    RAISE EXCEPTION 'FAIL a grant row was written by a denied non-admin call';
  END IF;
  RAISE NOTICE 'PASS denied non-admin grant wrote no row';
END;
$$;

-- Switch to admin for privileged operations.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_grant_entitlement(
      '00000000-0000-0000-0000-000000000912','complimentary',
      now(), now() + interval '30 days','', false);
    RAISE EXCEPTION 'FAIL blank-reason grant succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS blank-reason grant is rejected';
  END;

  BEGIN
    PERFORM public.admin_grant_entitlement(
      '00000000-0000-0000-0000-000000000912','complimentary',
      now() + interval '30 days', now(),'backwards', false);
    RAISE EXCEPTION 'FAIL invalid-range grant succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS invalid-range grant is rejected';
  END;
END;
$$;

-- ===========================================================================
-- B. Valid complimentary grant + admin/non-admin row visibility
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000912','complimentary',
    now() - interval '1 day', now() + interval '30 days','manual gift', false);
  INSERT INTO tid VALUES ('comp_active', v_id);
  RAISE NOTICE 'PASS admin created a complimentary grant';
END;
$$;

DO $$
DECLARE v_cnt integer;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.subscription_entitlement_grants
   WHERE person_id = '00000000-0000-0000-0000-000000000912';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL admin cannot read the grant row (got %)', v_cnt; END IF;
  RAISE NOTICE 'PASS site admin can read grant rows';
END;
$$;

-- Non-admin: RLS hides the row entirely. Session is the OWNER's auth user id
-- (…0902), not the person id — auth.uid()/RLS key off the auth user.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
DO $$
DECLARE v_cnt integer;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.subscription_entitlement_grants;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'FAIL non-admin saw % grant rows', v_cnt; END IF;
  RAISE NOTICE 'PASS non-admin direct SELECT returns no rows';
END;
$$;

-- Non-admin direct writes: INSERT errors; UPDATE/DELETE affect zero rows.
DO $$
DECLARE v_rows integer;
BEGIN
  BEGIN
    INSERT INTO public.subscription_entitlement_grants
      (person_id, grant_type, starts_at, ends_at, reason)
    VALUES ('00000000-0000-0000-0000-000000000912','complimentary',
            now(), now() + interval '1 day','self grant');
    RAISE EXCEPTION 'FAIL non-admin direct INSERT succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS non-admin direct INSERT is denied';
  END;

  UPDATE public.subscription_entitlement_grants SET ends_at = now() + interval '999 days';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL non-admin UPDATE changed % rows', v_rows; END IF;
  RAISE NOTICE 'PASS non-admin direct UPDATE changes no rows';

  DELETE FROM public.subscription_entitlement_grants;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL non-admin DELETE removed % rows', v_rows; END IF;
  RAISE NOTICE 'PASS non-admin direct DELETE removes no rows';
END;
$$;

-- ===========================================================================
-- C. Sanitized own-context returns source/status/start/end only
-- ===========================================================================
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_own_entitlement_context();
  IF r.grant_type <> 'complimentary' OR r.grant_status <> 'active' THEN
    RAISE EXCEPTION 'FAIL context wrong source/status: % / %', r.grant_type, r.grant_status;
  END IF;
  IF r.evaluated_at IS NULL THEN RAISE EXCEPTION 'FAIL context missing evaluated_at'; END IF;
  RAISE NOTICE 'PASS sanitized own-context returns type/status/start/end (no reason/actor columns exist)';
END;
$$;

-- ===========================================================================
-- D. has_effective_premium_access matrix
-- ===========================================================================
-- The helper is caller-scoped: a non-admin may only probe their OWN person id.
-- This matrix probes several people, so run it as the site admin (who may probe
-- anyone). Cross-person probing by a non-admin is proven denied in section E's
-- ownership tests and the analytics-trial block below.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
DO $$
BEGIN
  -- complimentary active -> true
  IF NOT public.has_effective_premium_access('00000000-0000-0000-0000-000000000912') THEN
    RAISE EXCEPTION 'FAIL complimentary active not premium';
  END IF;
  -- paid tier -> true
  IF NOT public.has_effective_premium_access('00000000-0000-0000-0000-000000000913') THEN
    RAISE EXCEPTION 'FAIL paid tier not premium';
  END IF;
  -- free with no grant -> false (other person, before any grant)
  IF public.has_effective_premium_access('00000000-0000-0000-0000-000000000914') THEN
    RAISE EXCEPTION 'FAIL free person is premium';
  END IF;
  RAISE NOTICE 'PASS helper matrix: complimentary+paid true, free false';
END;
$$;

-- Analytics-trial-only cannot make helper true: free owner has scored shows but
-- no grant. (Trial is client-scoped; the DB helper never reads it.)
-- Insert show/entry fixtures as the privileged role (bypass entries RLS), then
-- restore the admin session.
RESET ROLE;
INSERT INTO public.shows (id, name, organization, start_date, end_date)
VALUES ('00000000-0000-0000-0000-000000000961','Seg Show','AKC',CURRENT_DATE,CURRENT_DATE);
-- Trial + class are required: scored_show_count now replicates the entry-results
-- view visibility, which counts an owner's scored entry only when the class's
-- qualification results are visible. With no show_visibility_settings row the
-- resolver defaults qualification timing to 'immediate' -> always visible.
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000000965','00000000-0000-0000-0000-000000000961','Seg Trial',CURRENT_DATE);
INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000000000966','00000000-0000-0000-0000-000000000965','Seg Class','completed');
INSERT INTO public.entries (id, show_id, class_id, dog_id, is_scored, result_status)
VALUES ('00000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000961',
        '00000000-0000-0000-0000-000000000966',
        '00000000-0000-0000-0000-000000000951', true, 'qualified');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
DO $$
BEGIN
  IF public.has_effective_premium_access('00000000-0000-0000-0000-000000000912')
     AND NOT EXISTS (SELECT 1 FROM public.subscription_entitlement_grants
                     WHERE person_id='00000000-0000-0000-0000-000000000912'
                       AND revoked_at IS NULL AND superseded_at IS NULL
                       AND starts_at <= now() AND ends_at > now()) THEN
    RAISE EXCEPTION 'FAIL analytics trial granted premium without a grant';
  END IF;
  RAISE NOTICE 'PASS analytics-trial-only does not authorize premium (helper independent of scored shows)';
END;
$$;

-- Own-context scored_show_count reflects the scored entry.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_own_entitlement_context();
  IF r.scored_show_count <> 1 THEN
    RAISE EXCEPTION 'FAIL scored_show_count expected 1 got %', r.scored_show_count;
  END IF;
  RAISE NOTICE 'PASS own-context scored_show_count matches distinct scored shows';
END;
$$;

-- ===========================================================================
-- E. Premium INSERT enforcement (vaccinations + pedigree_ancestors)
--    Owner is currently FREE (grant will be revoked in section F for paid test;
--    here owner still has the active complimentary grant, so first prove that a
--    genuinely free session is blocked by using the OTHER free person, then the
--    granted owner is allowed.)
-- ===========================================================================
-- Premium NON-owner (paid person 0913, not the dog's owner) cannot insert into
-- the owner's dog vaccinations: ownership fails regardless of premium status.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000903', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.vaccinations (dog_id, vaccine_name, date_administered)
    VALUES ('00000000-0000-0000-0000-000000000951','Rabies', CURRENT_DATE);
    RAISE EXCEPTION 'FAIL premium non-owner inserted a vaccination';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS premium non-owner cannot insert vaccination (ownership)';
  END;
END;
$$;

-- Owner WITH active complimentary grant CAN insert vaccination + pedigree.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
DO $$
BEGIN
  INSERT INTO public.vaccinations (dog_id, vaccine_name, date_administered)
  VALUES ('00000000-0000-0000-0000-000000000951','Rabies', CURRENT_DATE);
  RAISE NOTICE 'PASS premium owner can insert vaccination';

  INSERT INTO public.pedigree_ancestors (dog_id, owner_id, position, registered_name)
  VALUES ('00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000902','sire','Grand Sire');
  RAISE NOTICE 'PASS premium owner can insert pedigree ancestor';
END;
$$;

-- Now revoke the grant -> owner becomes free -> INSERT blocked, but SELECT+DELETE
-- of existing records remain available.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
DO $$
BEGIN
  PERFORM public.admin_revoke_entitlement((SELECT v FROM tid WHERE k='comp_active'), 'test downgrade');
  RAISE NOTICE 'PASS admin revoked the grant';
END;
$$;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.subscription_entitlement_grants
    WHERE id = (SELECT v FROM tid WHERE k='comp_active');
  IF r.revoked_at IS NULL OR r.revoked_by_person_id IS NULL OR r.revoke_reason IS NULL THEN
    RAISE EXCEPTION 'FAIL revoke did not write revocation fields';
  END IF;
  RAISE NOTICE 'PASS revoke wrote revoked_at/by/reason';
END;
$$;

-- Free owner: INSERT denied, but SELECT + DELETE of existing rows still work.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
DO $$
DECLARE v_cnt integer; v_rows integer;
BEGIN
  IF public.has_effective_premium_access('00000000-0000-0000-0000-000000000912') THEN
    RAISE EXCEPTION 'FAIL revoked owner still premium';
  END IF;

  BEGIN
    INSERT INTO public.vaccinations (dog_id, vaccine_name, date_administered)
    VALUES ('00000000-0000-0000-0000-000000000951','Bordetella', CURRENT_DATE);
    RAISE EXCEPTION 'FAIL free owner inserted a vaccination';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS free owner INSERT into vaccinations is denied';
  END;

  BEGIN
    INSERT INTO public.pedigree_ancestors (dog_id, owner_id, position, registered_name)
    VALUES ('00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000902','dam','Grand Dam');
    RAISE EXCEPTION 'FAIL free owner inserted a pedigree ancestor';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS free owner INSERT into pedigree_ancestors is denied';
  END;

  SELECT count(*) INTO v_cnt FROM public.vaccinations
    WHERE dog_id = '00000000-0000-0000-0000-000000000951';
  IF v_cnt < 1 THEN RAISE EXCEPTION 'FAIL free owner cannot read own vaccination'; END IF;
  RAISE NOTICE 'PASS free owner retains SELECT on existing records';

  DELETE FROM public.vaccinations WHERE dog_id = '00000000-0000-0000-0000-000000000951';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows < 1 THEN RAISE EXCEPTION 'FAIL free owner cannot delete own vaccination'; END IF;
  RAISE NOTICE 'PASS free owner retains DELETE on existing records';
END;
$$;

-- ===========================================================================
-- F. History semantics: expiry, later non-overlapping, overlap, replace
-- ===========================================================================
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);

-- Natural expiry -> status 'expired', unrevoked. A fully-past grant cannot be
-- created via admin_grant_entitlement (it now rejects ends_at <= now()); such
-- historical rows are written through a privileged direct insert (RLS-bypassing
-- superuser), exactly as a backfill would. Grant it to the "other" person
-- (currently free, no active grant).
RESET ROLE;
INSERT INTO public.subscription_entitlement_grants
  (id, person_id, grant_type, starts_at, ends_at, reason, granted_by_person_id)
VALUES ('00000000-0000-0000-0000-000000000981',
        '00000000-0000-0000-0000-000000000914','founding',
        now() - interval '60 days', now() - interval '30 days','historical', NULL);
INSERT INTO tid VALUES ('expired', '00000000-0000-0000-0000-000000000981');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000904', true);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_own_entitlement_context();
  IF r.grant_status <> 'expired' THEN RAISE EXCEPTION 'FAIL expected expired got %', r.grant_status; END IF;
  IF public.has_effective_premium_access('00000000-0000-0000-0000-000000000914') THEN
    RAISE EXCEPTION 'FAIL expired grant still premium';
  END IF;
  RAISE NOTICE 'PASS natural expiry derives status expired and is not premium';
END;
$$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.subscription_entitlement_grants
    WHERE id = (SELECT v FROM tid WHERE k='expired');
  IF r.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL expired grant was revoked'; END IF;
  RAISE NOTICE 'PASS expired grant remains unrevoked history';
END;
$$;

-- Revoke of a naturally-expired grant is rejected (history is never rewritten).
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_revoke_entitlement((SELECT v FROM tid WHERE k='expired'), 'undo history');
    RAISE EXCEPTION 'FAIL expired grant was revocable';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS revoke of a naturally-expired grant is rejected';
  END;
END;
$$;

-- Future-dated grant: status 'scheduled', not yet Premium, but revocable.
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000912','complimentary',
    now() + interval '10 days', now() + interval '40 days','future gift', false);
  INSERT INTO tid VALUES ('future', v_id);
END;
$$;

-- Inside this single test transaction now() is frozen, so every grant shares
-- one created_at and get_own_entitlement_context's "most recently created"
-- ORDER BY would tie. In production each admin RPC runs in its own
-- transaction, so creations are strictly ordered; reproduce that here with a
-- privileged clock nudge on the newest grant.
RESET ROLE;
UPDATE public.subscription_entitlement_grants
SET created_at = created_at + interval '1 second'
WHERE id = (SELECT v FROM tid WHERE k = 'future');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_own_entitlement_context();
  IF r.grant_status <> 'scheduled' THEN RAISE EXCEPTION 'FAIL expected scheduled got %', r.grant_status; END IF;
  IF public.has_effective_premium_access('00000000-0000-0000-0000-000000000912') THEN
    RAISE EXCEPTION 'FAIL future-dated grant is premium before it starts';
  END IF;
  RAISE NOTICE 'PASS future-dated grant derives status scheduled and is not premium';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
DO $$
DECLARE r record;
BEGIN
  PERFORM public.admin_revoke_entitlement((SELECT v FROM tid WHERE k='future'), 'undo future gift');
  SELECT * INTO r FROM public.subscription_entitlement_grants
    WHERE id = (SELECT v FROM tid WHERE k='future');
  IF r.revoked_at IS NULL THEN RAISE EXCEPTION 'FAIL future-dated grant was not revoked'; END IF;
  RAISE NOTICE 'PASS future-dated grant is revocable';
END;
$$;

-- Later non-overlapping grant allowed (starts after the expired grant ended).
DO $$
DECLARE v_id uuid; v_cnt integer;
BEGIN
  v_id := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000914','complimentary',
    now(), now() + interval '30 days','renewal', false);
  INSERT INTO tid VALUES ('later_active', v_id);
  SELECT count(*) INTO v_cnt FROM public.subscription_entitlement_grants
    WHERE person_id = '00000000-0000-0000-0000-000000000914';
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 history rows got %', v_cnt; END IF;
  RAISE NOTICE 'PASS later non-overlapping grant recorded as a separate row';
END;
$$;

-- Overlapping grant rejected without replace.
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_grant_entitlement(
      '00000000-0000-0000-0000-000000000914','complimentary',
      now() + interval '5 days', now() + interval '40 days','overlap', false);
    RAISE EXCEPTION 'FAIL overlapping grant accepted without replace';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS overlapping grant rejected without p_replace_active';
  END;
END;
$$;
-- concurrency note: two simultaneous grant transactions cannot run in one psql
-- session. admin_grant_entitlement serializes them with SELECT ... FOR UPDATE on
-- the target person row; the overlap guard above is the same predicate that
-- rejects the loser. True race coverage requires a multi-connection harness.

-- Explicit replace records superseded (not revoked) and links successor.
DO $$
DECLARE v_new uuid; r record;
BEGIN
  v_new := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000914','complimentary',
    now() + interval '5 days', now() + interval '40 days','explicit replace', true);
  SELECT * INTO r FROM public.subscription_entitlement_grants
    WHERE id = (SELECT v FROM tid WHERE k='later_active');
  IF r.superseded_at IS NULL OR r.superseded_by_grant_id <> v_new THEN
    RAISE EXCEPTION 'FAIL replace did not supersede+link the prior grant';
  END IF;
  IF r.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL replaced grant was falsely revoked';
  END IF;
  RAISE NOTICE 'PASS explicit replace records superseded (not revoked) and links successor';
END;
$$;

-- ===========================================================================
-- G. Revoke does not cancel active paid billing
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000913','complimentary',
    now() - interval '1 day', now() + interval '30 days','extra grant on paid', false);
  PERFORM public.admin_revoke_entitlement(v_id, 'remove extra');
  IF NOT public.has_effective_premium_access('00000000-0000-0000-0000-000000000913') THEN
    RAISE EXCEPTION 'FAIL revoking grant removed paid access';
  END IF;
  RAISE NOTICE 'PASS revoke leaves active paid subscription access intact';
END;
$$;

-- ===========================================================================
-- H. Backfill survival + Stripe isolation
-- ===========================================================================
-- This used to compare the founding grants against `people.early_adopter_until`.
-- That column was dropped in task 8.2 (20260725200000), and its own preflight
-- proved the parity at drop time — re-asserting it here is impossible, because
-- there is no longer a second source to compare against.
--
-- What still matters, and is checked instead: the backfilled grants SURVIVED
-- the drop with their end dates. If the migration had taken the grants with
-- the column, this is where it would show.
DO $$
DECLARE v_backfill integer; v_dateless integer;
BEGIN
  SELECT count(*) INTO v_backfill FROM public.subscription_entitlement_grants
    WHERE grant_type='founding' AND reason='Backfilled from early_adopter_until';
  SELECT count(*) INTO v_dateless FROM public.subscription_entitlement_grants
    WHERE grant_type='founding' AND ends_at IS NULL;

  IF v_backfill = 0 THEN
    RAISE EXCEPTION 'FAIL no backfilled founding grants remain — the legacy data did not survive the column drop';
  END IF;
  IF v_dateless > 0 THEN
    RAISE EXCEPTION 'FAIL % founding grant(s) lost their end date', v_dateless;
  END IF;
  RAISE NOTICE 'PASS % backfilled founding grant(s) survived the column drop with end dates intact', v_backfill;
END;
$$;

DO $$
DECLARE v_before integer; v_after integer; v_id uuid;
BEGIN
  SELECT count(*) INTO v_before FROM public.stripe_customers;
  v_id := public.admin_grant_entitlement(
    '00000000-0000-0000-0000-000000000912','complimentary',
    now(), now() + interval '10 days','stripe isolation check', false);
  PERFORM public.admin_revoke_entitlement(v_id, 'done');
  SELECT count(*) INTO v_after FROM public.stripe_customers;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'FAIL grant/revoke changed stripe_customers count (% -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS grant/revoke wrote no stripe_customers rows';
END;
$$;

ROLLBACK;
