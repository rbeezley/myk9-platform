-- MYK9-1472: hard_delete_show permanently deletes only an unused show.
-- A show with trials, classes and the configuration the creation wizard
-- writes (judges, passcodes, officials and their show roles, lifecycle email
-- steps, visibility settings) is deletable; one row of participant, money,
-- delivery or audit evidence refuses with MK615 and keeps the show AND the row.
-- Migration: 20261029014300_myk9_1472_hard_delete_show_money_guards.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001472001', 'MYK9-1472 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001472002', 'MYK9', 'Handler', 'myk9-1472-handler@example.test', NULL),
  ('00000000-0000-0000-0000-000001472009', 'MYK9', 'Admin', 'myk9-1472-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001472010', 'MYK9', 'NoAdmin', 'myk9-1472-noadmin@example.test', NULL),
  ('00000000-0000-0000-0000-000001472011', 'MYK9', 'ClubAdmin', 'myk9-1472-club-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001472012', 'MYK9', 'Judge', 'myk9-1472-judge@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001472109', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1472-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001472110', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1472-noadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001472111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1472-club-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001472109'
WHERE id = '00000000-0000-0000-0000-000001472009';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001472110'
WHERE id = '00000000-0000-0000-0000-000001472010';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001472111'
WHERE id = '00000000-0000-0000-0000-000001472011';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001472009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000001472109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000001472001', '00000000-0000-0000-0000-000001472011', 'active');
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001472011'::uuid, roles.id,
       '00000000-0000-0000-0000-000001472001'::uuid, true,
       '00000000-0000-0000-0000-000001472111'::uuid
FROM public.roles WHERE roles.name = 'club_admin';

-- Shows 1472020..1472059. Inserting them fires trg_ensure_show_lifecycle_email_steps,
-- so every fixture already carries its six lifecycle step rows: the success
-- case below proves those do not count as "use".
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-1472 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000001472001', 'draft'
FROM generate_series(1472020, 1472059) AS n;

-- One trial and one class per show, so every refusal is about the evidence
-- row and not about an empty structure.
INSERT INTO public.trials (id, show_id, name, date)
SELECT ('00000000-0000-0000-0000-' || lpad((n + 1000)::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'trial ' || n, DATE '2026-09-01'
FROM generate_series(1472020, 1472059) AS n;
INSERT INTO public.classes (id, trial_id, name)
SELECT ('00000000-0000-0000-0000-' || lpad((n + 2000)::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0000-' || lpad((n + 1000)::text, 12, '0'))::uuid,
       'class ' || n
FROM generate_series(1472020, 1472059) AS n;

-- Show 1472020: unused, but configured the way the creation wizard leaves it.
INSERT INTO public.judge_assignments (show_id, trial_id, class_id, person_id)
VALUES ('00000000-0000-0000-0000-000001472020', '00000000-0000-0000-0000-000001473020',
        '00000000-0000-0000-0000-000001474020', '00000000-0000-0000-0000-000001472012');
INSERT INTO public.show_passcodes (id, show_id, role, passcode_hash)
VALUES ('00000000-0000-0000-0000-000001475020', '00000000-0000-0000-0000-000001472020',
        'judge', 'myk9-1472-passcode-hash-020');
INSERT INTO public.show_officials (show_id, person_id, role)
VALUES ('00000000-0000-0000-0000-000001472020', '00000000-0000-0000-0000-000001472012', 'steward');
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active)
SELECT '00000000-0000-0000-0000-000001472012'::uuid, roles.id,
       '00000000-0000-0000-0000-000001472001'::uuid,
       '00000000-0000-0000-0000-000001472020'::uuid, true
FROM public.roles WHERE roles.name = 'steward';
INSERT INTO public.show_visibility_settings (show_id)
VALUES ('00000000-0000-0000-0000-000001472020');

-- Participants (refused whatever their payment status).
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, paid_amount)
VALUES ('00000000-0000-0000-0000-000001476021', '00000000-0000-0000-0000-000001472021',
        '00000000-0000-0000-0000-000001472002', 'pending', 0);
INSERT INTO public.entries (id, show_id, payment_status)
VALUES
  ('00000000-0000-0000-0000-000001477022', '00000000-0000-0000-0000-000001472022', 'pending'),
  -- Belongs to show 1472059 but names show 1472023's class: a cross-show link.
  ('00000000-0000-0000-0000-000001477023', '00000000-0000-0000-0000-000001472059', 'pending');
UPDATE public.entries SET class_id = '00000000-0000-0000-0000-000001474023'
WHERE id = '00000000-0000-0000-0000-000001477023';

-- Money. Carts and fulfillments name an exhibitor profile; linking a person
-- to an auth user already created one.
INSERT INTO public.stripe_orders (id, show_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000001478024', '00000000-0000-0000-0000-000001472024', 2500, 'succeeded');
INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000001478025', '00000000-0000-0000-0000-000001472025', 12500, 'completed');
INSERT INTO public.refund_requests (
  id, show_id, kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, reason
)
VALUES ('00000000-0000-0000-0000-000001478026', '00000000-0000-0000-0000-000001472026',
        'abandoned_cart', 'cs_myk9_1472_026', 'pi_myk9_1472_026', 2500, 'MYK9-1472 fixture');
INSERT INTO public.entry_carts (id, show_id, exhibitor_id)
VALUES ('00000000-0000-0000-0000-000001478027', '00000000-0000-0000-0000-000001472027',
        (SELECT p.id FROM public.exhibitor_profiles AS p WHERE p.auth_user_id = '00000000-0000-0000-0000-000001472110'));
INSERT INTO public.entry_payment_links (id, show_id, entry_ids, stripe_checkout_session_id, amount_cents)
VALUES ('00000000-0000-0000-0000-000001478028', '00000000-0000-0000-0000-000001472028',
        ARRAY['00000000-0000-0000-0000-000001477022']::uuid[], 'cs_myk9_1472_028', 2500);
INSERT INTO public.cart_fulfillments (
  stripe_checkout_session_id, show_id, stripe_payment_intent_id, exhibitor_id
)
VALUES ('cs_myk9_1472_029', '00000000-0000-0000-0000-000001472029', 'pi_myk9_1472_029',
        (SELECT p.id FROM public.exhibitor_profiles AS p WHERE p.auth_user_id = '00000000-0000-0000-0000-000001472110'));
-- A ledger row whose enrollment lives in another show still names this show.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, paid_amount)
VALUES ('00000000-0000-0000-0000-000001476030', '00000000-0000-0000-0000-000001472059',
        '00000000-0000-0000-0000-000001472002', 'pending', 0);
INSERT INTO public.show_payments (id, show_id, enrollment_id, kind, method, amount, received_on)
VALUES ('00000000-0000-0000-0000-000001478030', '00000000-0000-0000-0000-000001472030',
        '00000000-0000-0000-0000-000001476030', 'payment', 'cash', 25, DATE '2026-09-01');
INSERT INTO public.show_money_locks (show_id, lock_id, holder, expires_at)
VALUES ('00000000-0000-0000-0000-000001472031', gen_random_uuid(), 'myk9-1472-fixture',
        now() + interval '1 minute');

-- Delivery, paperwork, results and audit evidence.
INSERT INTO public.email_log (id, recipient_email, email_type, show_id, status)
VALUES ('00000000-0000-0000-0000-000001479032', 'myk9-1472@example.test',
        'show_lifecycle_email', '00000000-0000-0000-0000-000001472032', 'sent');
INSERT INTO public.paperwork_prints (
  id, show_id, scope_kind, report_id, coverage, fingerprint, printed_by, printed_by_name, printed_at
)
VALUES ('00000000-0000-0000-0000-000001479033', '00000000-0000-0000-0000-000001472033',
        'show', 'entry-list', '{}', 'myk9-1472-print', '00000000-0000-0000-0000-000001472002',
        'MYK9-1472 Handler', now());
INSERT INTO public.result_submissions (id, show_id, organization, sport_type, status)
VALUES ('00000000-0000-0000-0000-000001479034', '00000000-0000-0000-0000-000001472034',
        'AKC', 'scent_work', 'pending');
-- Filed under show 1472059 but naming show 1472035's trial.
INSERT INTO public.result_submissions (id, show_id, trial_id, organization, sport_type, status)
VALUES ('00000000-0000-0000-0000-000001479035', '00000000-0000-0000-0000-000001472059',
        '00000000-0000-0000-0000-000001473035', 'AKC', 'scent_work', 'pending');
INSERT INTO public.activity_log (id, trial_id, action_type, description)
VALUES ('00000000-0000-0000-0000-000001479036', '00000000-0000-0000-0000-000001473036',
        'note', 'MYK9-1472 activity evidence');
INSERT INTO public.show_incidents (id, show_id, incident_type, severity, summary, created_by)
VALUES ('00000000-0000-0000-0000-000001479037', '00000000-0000-0000-0000-000001472037',
        'other', 'reportable', 'MYK9-1472 incident', '00000000-0000-0000-0000-000001472109');
INSERT INTO public.trial_packet_snapshots (
  id, snapshot_id, show_id, storage_path, generated_at, generated_by,
  sha256, page_count, byte_size, delivery_status
)
VALUES ('00000000-0000-0000-0000-000001479038', '00000000-0000-0000-0000-000001479138',
        '00000000-0000-0000-0000-000001472038', '00000000-0000-0000-0000-000001472038/packet.pdf',
        now(), '00000000-0000-0000-0000-000001472109', repeat('a', 64), 1, 100, 'failed');
-- Delivery jobs hang off a show's lifecycle steps: the steps are swept, so
-- their own children are evidence the manifest must see (show 1472040). The
-- request ledger names its show without a foreign key (show 1472039).
INSERT INTO public.show_lifecycle_email_jobs (
  show_id, step_id, step_type, recipient_scope, idempotency_key
)
SELECT s.show_id, s.id, s.step_type, 'show_recipient', 'myk9-1472-job-' || right(s.show_id::text, 3)
FROM public.show_lifecycle_email_steps AS s
WHERE s.show_id IN ('00000000-0000-0000-0000-000001472039', '00000000-0000-0000-0000-000001472040')
  AND s.step_type = 'accepted';
INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
SELECT j.show_id, 'myk9-1472-request', j.id
FROM public.show_lifecycle_email_jobs AS j
WHERE j.idempotency_key = 'myk9-1472-job-039';
-- "Results Posted" push state names its class without a foreign key (show 1472043).
INSERT INTO private.class_results_push (class_id)
VALUES ('00000000-0000-0000-0000-000001474043');

CREATE FUNCTION pg_temp.assert_hard_delete_refused(
  p_show_id uuid, p_expected_state text, p_expected_message text, p_case_name text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_error_message text;
  v_error_state text;
BEGIN
  BEGIN
    PERFORM public.hard_delete_show(p_show_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_error_message = MESSAGE_TEXT,
      v_error_state = RETURNED_SQLSTATE;
  END;
  IF v_error_state IS DISTINCT FROM p_expected_state THEN
    RAISE EXCEPTION 'FAIL MYK9-1472 %: expected SQLSTATE %, got %: %',
      p_case_name, p_expected_state, v_error_state, v_error_message;
  END IF;
  IF lower(coalesce(v_error_message, '')) NOT LIKE '%' || lower(p_expected_message) || '%' THEN
    RAISE EXCEPTION 'FAIL MYK9-1472 %: refusal did not name %: %',
      p_case_name, p_expected_message, v_error_message;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = p_show_id) THEN
    RAISE EXCEPTION 'FAIL MYK9-1472 %: refused show was removed anyway', p_case_name;
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 %: %', p_case_name, v_error_message;
END;
$function$;

DO $$
DECLARE
  test_case record;
BEGIN
  -- The bypass is closed: no client role may DELETE a show row directly.
  IF pg_catalog.has_table_privilege('authenticated', 'public.shows', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.shows', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: a client role still has direct DELETE on shows';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy
             WHERE polrelid = 'public.shows'::regclass AND polname = 'shows_delete') THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: policy shows_delete still exists';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.hard_delete_show(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: anon can execute hard_delete_show';
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 direct DELETE on shows is closed to client roles';

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001472110', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000001472110","role":"authenticated"}', true);
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000001472020', '42501', 'Permission denied', 'non-site admin'
  );

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001472109', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000001472109","role":"authenticated"}', true);
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: the site_admin fixture is not recognized';
  END IF;

  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001472999');
    RAISE EXCEPTION 'FAIL MYK9-1472 missing show: no refusal';
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'PASS MYK9-1472 missing show: %', SQLERRM;
  END;

  FOR test_case IN
    SELECT * FROM (VALUES
      ('unpaid enrollment', 1472021, 'entries or enrollments'),
      ('unpaid entry', 1472022, 'entries or enrollments'),
      ('cross-show entry on a class', 1472023, 'entry in another show'),
      ('stripe order', 1472024, 'Stripe order(s)'),
      ('show payout', 1472025, 'public.show_payouts'),
      ('refund request (ON DELETE SET NULL)', 1472026, 'public.refund_requests'),
      ('entry cart', 1472027, 'public.entry_carts'),
      ('entry payment link', 1472028, 'public.entry_payment_links'),
      ('cart fulfillment (no FK)', 1472029, 'public.cart_fulfillments'),
      ('show payments ledger row', 1472030, 'public.show_payments'),
      ('money lock held', 1472031, 'public.show_money_locks'),
      ('email log', 1472032, 'public.email_log'),
      ('paperwork print', 1472033, 'public.paperwork_prints'),
      ('result submission', 1472034, 'public.result_submissions'),
      ('cross-show result submission on a trial', 1472035, 'public.result_submissions'),
      ('activity log', 1472036, 'public.activity_log'),
      ('show incident', 1472037, 'public.show_incidents'),
      ('trial packet snapshot', 1472038, 'public.trial_packet_snapshots'),
      ('email job request (no FK)', 1472039, 'public.show_lifecycle_email_job_requests'),
      ('lifecycle email job', 1472040, 'public.show_lifecycle_email_jobs'),
      ('class results push (no FK)', 1472043, 'private.class_results_push')
    ) AS cases(case_name, show_n, expected_message)
  LOOP
    PERFORM pg_temp.assert_hard_delete_refused(
      ('00000000-0000-0000-0000-' || lpad(test_case.show_n::text, 12, '0'))::uuid,
      'MK615', test_case.expected_message, test_case.case_name
    );
  END LOOP;

  -- The success boundary, called under the real authenticated role so the
  -- EXECUTE grant is proven, not just the owner's ability to run it.
  SET LOCAL ROLE authenticated;
  PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001472020');
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.trials WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000001474020')
     OR EXISTS (SELECT 1 FROM public.judge_assignments WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.show_passcodes WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.show_officials WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.show_lifecycle_email_steps WHERE show_id = '00000000-0000-0000-0000-000001472020')
     OR EXISTS (SELECT 1 FROM public.show_visibility_settings WHERE show_id = '00000000-0000-0000-0000-000001472020') THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: the unused, configured show was not deleted with its configuration';
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 unused show with trials, classes and wizard configuration deletes';

  -- Every refused fixture still holds its evidence row, not only its show.
  IF (SELECT count(*) FROM public.enrollments WHERE id IN (
        '00000000-0000-0000-0000-000001476021', '00000000-0000-0000-0000-000001476030')) <> 2
     OR (SELECT count(*) FROM public.entries WHERE id IN (
        '00000000-0000-0000-0000-000001477022', '00000000-0000-0000-0000-000001477023')) <> 2
     OR (SELECT count(*) FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000001478024') <> 1
     OR (SELECT count(*) FROM public.show_payouts WHERE id = '00000000-0000-0000-0000-000001478025') <> 1
     OR (SELECT count(*) FROM public.refund_requests
         WHERE id = '00000000-0000-0000-0000-000001478026'
           AND show_id = '00000000-0000-0000-0000-000001472026') <> 1
     OR (SELECT count(*) FROM public.entry_carts WHERE id = '00000000-0000-0000-0000-000001478027') <> 1
     OR (SELECT count(*) FROM public.entry_payment_links WHERE id = '00000000-0000-0000-0000-000001478028') <> 1
     OR (SELECT count(*) FROM public.cart_fulfillments WHERE stripe_checkout_session_id = 'cs_myk9_1472_029') <> 1
     OR (SELECT count(*) FROM public.show_payments WHERE id = '00000000-0000-0000-0000-000001478030') <> 1
     OR (SELECT count(*) FROM public.show_money_locks WHERE show_id = '00000000-0000-0000-0000-000001472031') <> 1
     OR (SELECT count(*) FROM public.email_log WHERE id = '00000000-0000-0000-0000-000001479032') <> 1
     OR (SELECT count(*) FROM public.paperwork_prints WHERE id = '00000000-0000-0000-0000-000001479033') <> 1
     OR (SELECT count(*) FROM public.result_submissions WHERE id IN (
        '00000000-0000-0000-0000-000001479034', '00000000-0000-0000-0000-000001479035')) <> 2
     OR (SELECT count(*) FROM public.activity_log WHERE id = '00000000-0000-0000-0000-000001479036') <> 1
     OR (SELECT count(*) FROM public.show_incidents WHERE id = '00000000-0000-0000-0000-000001479037') <> 1
     OR (SELECT count(*) FROM public.trial_packet_snapshots WHERE id = '00000000-0000-0000-0000-000001479038') <> 1
     OR (SELECT count(*) FROM public.show_lifecycle_email_job_requests
         WHERE show_id = '00000000-0000-0000-0000-000001472039') <> 1
     OR (SELECT count(*) FROM public.show_lifecycle_email_jobs
         WHERE idempotency_key = 'myk9-1472-job-040') <> 1
     OR (SELECT count(*) FROM private.class_results_push
         WHERE class_id = '00000000-0000-0000-0000-000001474043') <> 1 THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: a refused delete lost an evidence row';
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 every refused show keeps its evidence row';

  -- Fail closed on schema drift: an EMPTY new child of shows, and a new child
  -- of a swept configuration table, both refuse until the manifest says what
  -- their rows are.
  CREATE TABLE public.qa_myk9_1472_unknown_show_child (
    id uuid PRIMARY KEY,
    show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE
  );
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000001472041', 'MK615',
    'public.qa_myk9_1472_unknown_show_child_show_id_fkey', 'unclassified FK into shows'
  );
  DROP TABLE public.qa_myk9_1472_unknown_show_child;

  CREATE TABLE public.qa_myk9_1472_unknown_passcode_child (
    id uuid PRIMARY KEY,
    passcode_id uuid REFERENCES public.show_passcodes(id) ON DELETE CASCADE
  );
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000001472041', 'MK615',
    'public.qa_myk9_1472_unknown_passcode_child_passcode_id_fkey', 'unclassified FK into a swept table'
  );
  DROP TABLE public.qa_myk9_1472_unknown_passcode_child;

  -- An existing edge whose delete action changes is drift too.
  ALTER TABLE public.refund_requests DROP CONSTRAINT refund_requests_show_id_fkey;
  ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_show_id_fkey
    FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE CASCADE;
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000001472041', 'MK615',
    'public.refund_requests_show_id_fkey', 'changed delete action'
  );
  ALTER TABLE public.refund_requests DROP CONSTRAINT refund_requests_show_id_fkey;
  ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_show_id_fkey
    FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE SET NULL;

  -- Positive control for the three drift cases: with the graph restored, the
  -- same show (trial + class + lifecycle steps only) deletes.
  PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001472041');
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001472041') THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: drift control show did not delete once the graph matched';
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 schema drift refuses, and the restored graph deletes';

  -- Club admins keep the soft delete; only the permanent path is closed.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001472111', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000001472111","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.soft_delete_show('00000000-0000-0000-0000-000001472042');
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = '00000000-0000-0000-0000-000001472042' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL MYK9-1472: club admin could not soft-delete their own show';
  END IF;
  RAISE NOTICE 'PASS MYK9-1472 club admin can still soft-delete their own show';

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

ROLLBACK;
