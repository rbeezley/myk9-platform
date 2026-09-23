-- MYK9-615: only an unused show with structural trials/classes may be deleted.
-- Every refusal preserves both its show and its retained child evidence.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000615001', 'MYK9-615 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000615002', 'MYK9', 'Handler', 'myk9-615-handler@example.test', NULL),
  ('00000000-0000-0000-0000-000000615009', 'MYK9', 'Admin', 'myk9-615-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000615010', 'MYK9', 'NoAdmin', 'myk9-615-noadmin@example.test', NULL),
  ('00000000-0000-0000-0000-000000615011', 'MYK9', 'ClubAdmin', 'myk9-615-club-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000615109', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-615-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000615110', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-615-noadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000615111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-615-club-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000615109'
WHERE id = '00000000-0000-0000-0000-000000615009';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000615110'
WHERE id = '00000000-0000-0000-0000-000000615010';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000615111'
WHERE id = '00000000-0000-0000-0000-000000615011';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000615009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000000615109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000615001', '00000000-0000-0000-0000-000000615011', 'active');
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000615011'::uuid, roles.id,
       '00000000-0000-0000-0000-000000615001'::uuid, true,
       '00000000-0000-0000-0000-000000615111'::uuid
FROM public.roles WHERE roles.name = 'club_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'MYK9-615 fixture ' || n, 'AKC', DATE '2026-09-01', DATE '2026-09-02',
       '00000000-0000-0000-0000-000000615001', 'draft'
FROM generate_series(615020, 615037) AS n;

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000616020', '00000000-0000-0000-0000-000000615020', 'unused trial', DATE '2026-09-01'),
  ('00000000-0000-0000-0000-000000616025', '00000000-0000-0000-0000-000000615025', 'activity evidence trial', DATE '2026-09-01'),
  ('00000000-0000-0000-0000-000000616032', '00000000-0000-0000-0000-000000615032', 'cross-entry trial', DATE '2026-09-01'),
  ('00000000-0000-0000-0000-000000616033', '00000000-0000-0000-0000-000000615033', 'cross-result trial', DATE '2026-09-01');

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000617020', '00000000-0000-0000-0000-000000616020', 'unused class'),
  ('00000000-0000-0000-0000-000000617032', '00000000-0000-0000-0000-000000616032', 'cross-entry class');

-- These two rows prove the policy is about usage, not payment status.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_reference, paid_amount)
VALUES ('00000000-0000-0000-0000-000000618021', '00000000-0000-0000-0000-000000615021',
        '00000000-0000-0000-0000-000000615002', 'pending', NULL, 0);
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000619022', '00000000-0000-0000-0000-000000615022',
        NULL, NULL, NULL, 'pending');

-- Entry status history is audit evidence too; entry ownership independently
-- refuses deletion, so neither row can disappear as a side effect.
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000619023', '00000000-0000-0000-0000-000000615023',
        NULL, NULL, NULL, 'pending');
INSERT INTO public.entry_status_history (entry_id, previous_status, new_status, reason)
VALUES ('00000000-0000-0000-0000-000000619023', NULL, 'pending', 'retained MYK9-615 status history');

INSERT INTO public.result_submissions (id, show_id, trial_id, organization, sport_type, submitted_at, status)
VALUES
  ('00000000-0000-0000-0000-000000620024', '00000000-0000-0000-0000-000000615024',
   NULL, 'AKC', 'scent_work', now(), 'pending'),
  ('00000000-0000-0000-0000-000000620033', '00000000-0000-0000-0000-000000615035',
   '00000000-0000-0000-0000-000000616033', 'AKC', 'scent_work', now(), 'pending');

INSERT INTO public.activity_log (id, trial_id, action_type, description)
VALUES ('00000000-0000-0000-0000-000000620025', '00000000-0000-0000-0000-000000616025',
        'note', 'retained MYK9-615 activity evidence');

INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000000620026', '00000000-0000-0000-0000-000000615026', 12500, 'completed');

INSERT INTO public.paperwork_prints (
  id, show_id, scope_kind, report_id, coverage, fingerprint,
  printed_by, printed_by_name, printed_at
)
VALUES ('00000000-0000-0000-0000-000000620027', '00000000-0000-0000-0000-000000615027',
        'show', 'entry-list', '{}', 'myk9-615-print-fingerprint',
        '00000000-0000-0000-0000-000000615002', 'MYK9-615 Handler', now());

INSERT INTO public.show_incidents (id, show_id, incident_type, severity, summary, created_by)
VALUES ('00000000-0000-0000-0000-000000620028', '00000000-0000-0000-0000-000000615028',
        'other', 'reportable', 'retained MYK9-615 incident', '00000000-0000-0000-0000-000000615109');

INSERT INTO public.trial_packet_snapshots (
  id, snapshot_id, show_id, storage_path, generated_at, generated_by,
  sha256, page_count, byte_size, delivery_status
)
VALUES ('00000000-0000-0000-0000-000000620029', '00000000-0000-0000-0000-000000620129',
        '00000000-0000-0000-0000-000000615029',
        '00000000-0000-0000-0000-000000615029/emergency.pdf', now(),
        '00000000-0000-0000-0000-000000615109', repeat('a', 64), 1, 100, 'failed');

INSERT INTO public.trial_packet_generation_claims (id, show_id, trial_date, last_error, failed_at, attempts)
VALUES ('00000000-0000-0000-0000-000000620030', '00000000-0000-0000-0000-000000615030',
        DATE '2026-09-01', 'retained packet failure', now(), 1);

INSERT INTO public.email_log (id, recipient_email, email_type, show_id, status, created_at)
VALUES ('00000000-0000-0000-0000-000000620031', 'myk9-615@example.test',
        'show_lifecycle_email', '00000000-0000-0000-0000-000000615031', 'sent', now());

-- This entry belongs to another show but refers to the target trial and class.
INSERT INTO public.entries (id, show_id, class_id, trial_id, registration_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000619032', '00000000-0000-0000-0000-000000615034',
        '00000000-0000-0000-0000-000000617032', '00000000-0000-0000-0000-000000616032', NULL, 'pending');

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
    RAISE EXCEPTION 'FAIL MYK9-615 %: expected SQLSTATE %, got %: %',
      p_case_name, p_expected_state, v_error_state, v_error_message;
  END IF;
  IF lower(coalesce(v_error_message, '')) NOT LIKE '%' || lower(p_expected_message) || '%' THEN
    RAISE EXCEPTION 'FAIL MYK9-615 %: refusal was not readable: %', p_case_name, v_error_message;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = p_show_id) THEN
    RAISE EXCEPTION 'FAIL MYK9-615 %: refused show was removed anyway', p_case_name;
  END IF;
  RAISE NOTICE 'PASS MYK9-615 %: %', p_case_name, v_error_message;
END;
$function$;

DO $$
DECLARE
  test_case record;
  v_delete_refused boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FAIL MYK9-615: the site_admin fixture is not recognized';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated', 'public.shows', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL MYK9-615: authenticated still has direct DELETE on shows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000615110', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000615110","role":"authenticated"}', true);
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000000615020', '42501', 'Permission denied', 'non-site admin'
  );

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000615109', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000615109","role":"authenticated"}', true);

  FOR test_case IN
    SELECT * FROM (VALUES
      ('unpaid enrollment', '00000000-0000-0000-0000-000000615021'::uuid,
       '23503', 'entries or enrollments'),
      ('unpaid entry', '00000000-0000-0000-0000-000000615022'::uuid,
       '23503', 'entries or enrollments'),
      ('entry status history', '00000000-0000-0000-0000-000000615023'::uuid,
       '23503', 'entries or enrollments'),
      ('result submission', '00000000-0000-0000-0000-000000615024'::uuid,
       '23503', 'public.result_submissions'),
      ('activity log', '00000000-0000-0000-0000-000000615025'::uuid,
       '23503', 'public.activity_log'),
      ('show payout', '00000000-0000-0000-0000-000000615026'::uuid,
       '23503', 'public.show_payouts'),
      ('paperwork print', '00000000-0000-0000-0000-000000615027'::uuid,
       '23503', 'public.paperwork_prints'),
      ('show incident', '00000000-0000-0000-0000-000000615028'::uuid,
       '23503', 'public.show_incidents'),
      ('trial packet snapshot', '00000000-0000-0000-0000-000000615029'::uuid,
       '23503', 'public.trial_packet_snapshots'),
      ('packet generation claim', '00000000-0000-0000-0000-000000615030'::uuid,
       '23503', 'public.trial_packet_generation_claims'),
      ('email log', '00000000-0000-0000-0000-000000615031'::uuid,
       '23503', 'public.email_log'),
      ('cross-show entry', '00000000-0000-0000-0000-000000615032'::uuid,
       '23503', 'Cross-show entry association'),
      ('cross-show result submission', '00000000-0000-0000-0000-000000615033'::uuid,
       '23503', 'public.result_submissions')
    ) AS cases(case_name, show_id, expected_state, expected_message)
  LOOP
    PERFORM pg_temp.assert_hard_delete_refused(
      test_case.show_id, test_case.expected_state, test_case.expected_message, test_case.case_name
    );
  END LOOP;

  -- The only successful boundary is a show containing no enrollments, entries,
  -- or retained evidence; trials and classes alone are structural children.
  -- Calling under the actual authenticated role proves the RPC execute grant,
  -- not merely the function owner's ability to invoke it.
  SET LOCAL ROLE authenticated;
  PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000615020');
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000000615020')
     OR EXISTS (SELECT 1 FROM public.trials WHERE id = '00000000-0000-0000-0000-000000616020')
     OR EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000000617020') THEN
    RAISE EXCEPTION 'FAIL MYK9-615: unused show with trials and classes did not delete';
  END IF;
  RAISE NOTICE 'PASS MYK9-615 unused show with trials and classes';

  -- Every refused fixture retains its specific evidence row, not only the show.
  IF NOT EXISTS (SELECT 1 FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000618021')
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000619022')
     OR NOT EXISTS (SELECT 1 FROM public.entry_status_history WHERE entry_id = '00000000-0000-0000-0000-000000619023')
     OR NOT EXISTS (SELECT 1 FROM public.result_submissions WHERE id = '00000000-0000-0000-0000-000000620024')
     OR NOT EXISTS (SELECT 1 FROM public.activity_log WHERE id = '00000000-0000-0000-0000-000000620025')
     OR NOT EXISTS (SELECT 1 FROM public.show_payouts WHERE id = '00000000-0000-0000-0000-000000620026')
     OR NOT EXISTS (SELECT 1 FROM public.paperwork_prints WHERE id = '00000000-0000-0000-0000-000000620027')
     OR NOT EXISTS (SELECT 1 FROM public.show_incidents WHERE id = '00000000-0000-0000-0000-000000620028')
     OR NOT EXISTS (SELECT 1 FROM public.trial_packet_snapshots WHERE id = '00000000-0000-0000-0000-000000620029')
     OR NOT EXISTS (SELECT 1 FROM public.trial_packet_generation_claims WHERE id = '00000000-0000-0000-0000-000000620030')
     OR NOT EXISTS (SELECT 1 FROM public.email_log WHERE id = '00000000-0000-0000-0000-000000620031')
     OR NOT EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000619032')
     OR NOT EXISTS (SELECT 1 FROM public.result_submissions WHERE id = '00000000-0000-0000-0000-000000620033') THEN
    RAISE EXCEPTION 'FAIL MYK9-615: retained evidence row was deleted';
  END IF;

  CREATE TABLE public.qa_unknown_show_child (
    id uuid PRIMARY KEY,
    show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE
  );
  PERFORM pg_temp.assert_hard_delete_refused(
    '00000000-0000-0000-0000-000000615036', '23503',
    'Unclassified or changed show/trial/class foreign-key edge', 'unclassified empty FK'
  );
  IF EXISTS (SELECT 1 FROM public.qa_unknown_show_child) THEN
    RAISE EXCEPTION 'FAIL MYK9-615: empty unclassified child table unexpectedly had evidence rows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000615111', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000615111","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.soft_delete_show('00000000-0000-0000-0000-000000615037');
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = '00000000-0000-0000-0000-000000615037' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL MYK9-615: club admin could not soft-delete their own show';
  END IF;
  RAISE NOTICE 'PASS MYK9-615 club admin can use soft_delete_show on their own show';

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

ROLLBACK;
