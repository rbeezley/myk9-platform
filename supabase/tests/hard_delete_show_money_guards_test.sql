-- MYK9-615: hard_delete_show refuses scoped payment/evidence rows, permanent
-- show-day audit history, and cross-show entries. Each refusal gets an isolated
-- show fixture; the successful zero-evidence case proves ordinary transient
-- children are disposable. Everything rolls back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000615001', 'MYK9-615 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000615002', 'MYK9', 'Handler', 'myk9-615-handler@example.test', NULL),
  ('00000000-0000-0000-0000-000000615009', 'MYK9', 'Admin', 'myk9-615-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000615109', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-615-admin@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false
);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000615109'
WHERE id = '00000000-0000-0000-0000-000000615009';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000615009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000000615109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000615003', 'MYK9-615 direct order', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615004', 'MYK9-615 enrollment order', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615005', 'MYK9-615 refund', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615006', 'MYK9-615 payment link', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615007', 'MYK9-615 enrollment reference', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615008', 'MYK9-615 entry reference', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615010', 'MYK9-615 paid enrollment status', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615011', 'MYK9-615 refunded enrollment status', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615012', 'MYK9-615 enrollment paid amount', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615013', 'MYK9-615 enrollment refund amount', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615014', 'MYK9-615 paid entry status', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615015', 'MYK9-615 refunded entry status', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615016', 'MYK9-615 entry refund amount', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615017', 'MYK9-615 money lock', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615018', 'MYK9-615 promo code', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615019', 'MYK9-615 trial packet', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615020', 'MYK9-615 cross-show target', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615021', 'MYK9-615 other show', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615022', 'MYK9-615 zero evidence', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615023', 'MYK9-615 payout', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615024', 'MYK9-615 print confirmation', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615025', 'MYK9-615 incident', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft'),
  ('00000000-0000-0000-0000-000000615026', 'MYK9-615 packet generation failure', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000615001', 'draft');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000616020', '00000000-0000-0000-0000-000000615020',
   'MYK9-615 cross-show trial', DATE '2026-09-01'),
  ('00000000-0000-0000-0000-000000616022', '00000000-0000-0000-0000-000000615022',
   'MYK9-615 zero-evidence trial', DATE '2026-09-01');

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000617020', '00000000-0000-0000-0000-000000616020',
   'MYK9-615 cross-show class'),
  ('00000000-0000-0000-0000-000000617022', '00000000-0000-0000-0000-000000616022',
   'MYK9-615 zero-evidence class');

INSERT INTO public.enrollments (
  id, show_id, handler_id, payment_status, payment_reference, paid_amount, refund_amount
)
VALUES
  ('00000000-0000-0000-0000-000000618004', '00000000-0000-0000-0000-000000615004',
   '00000000-0000-0000-0000-000000615002', 'pending', NULL, 0, NULL),
  ('00000000-0000-0000-0000-000000618007', '00000000-0000-0000-0000-000000615007',
   '00000000-0000-0000-0000-000000615002', 'pending', 'CHECK-615', 0, NULL),
  ('00000000-0000-0000-0000-000000618010', '00000000-0000-0000-0000-000000615010',
   '00000000-0000-0000-0000-000000615002', 'paid_by_check', NULL, 0, NULL),
  ('00000000-0000-0000-0000-000000618011', '00000000-0000-0000-0000-000000615011',
   '00000000-0000-0000-0000-000000615002', 'partial_refund', NULL, 0, NULL),
  ('00000000-0000-0000-0000-000000618012', '00000000-0000-0000-0000-000000615012',
   '00000000-0000-0000-0000-000000615002', 'pending', NULL, 12.50, NULL),
  ('00000000-0000-0000-0000-000000618013', '00000000-0000-0000-0000-000000615013',
   '00000000-0000-0000-0000-000000615002', 'pending', NULL, 0, 4.25),
  ('00000000-0000-0000-0000-000000618020', '00000000-0000-0000-0000-000000615020',
   '00000000-0000-0000-0000-000000615002', 'pending', NULL, 0, NULL),
  ('00000000-0000-0000-0000-000000618022', '00000000-0000-0000-0000-000000615022',
   '00000000-0000-0000-0000-000000615002', 'pending', '   ', 0, NULL);

INSERT INTO public.entries (
  id, show_id, class_id, trial_id, registration_id, payment_status,
  payment_reference, payment_method, refund_amount, stripe_payment_intent_id
)
VALUES
  ('00000000-0000-0000-0000-000000619005', '00000000-0000-0000-0000-000000615005',
   NULL, NULL, NULL, 'pending', NULL, NULL, NULL, 'pi_myk9_615_refund'),
  ('00000000-0000-0000-0000-000000619006', '00000000-0000-0000-0000-000000615006',
   NULL, NULL, NULL, 'pending', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000619008', '00000000-0000-0000-0000-000000615008',
   NULL, NULL, NULL, 'pending', 'RCPT-615', NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000619014', '00000000-0000-0000-0000-000000615014',
   NULL, NULL, NULL, 'paid', '   ', 'cash', NULL, NULL),
  ('00000000-0000-0000-0000-000000619015', '00000000-0000-0000-0000-000000615015',
   NULL, NULL, NULL, 'refunded', NULL, 'cash', NULL, NULL),
  ('00000000-0000-0000-0000-000000619016', '00000000-0000-0000-0000-000000615016',
   NULL, NULL, NULL, 'pending', NULL, NULL, 2.00, NULL),
  ('00000000-0000-0000-0000-000000619020', '00000000-0000-0000-0000-000000615021',
   '00000000-0000-0000-0000-000000617020',
   '00000000-0000-0000-0000-000000616020',
   '00000000-0000-0000-0000-000000618020', 'pending', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000619022', '00000000-0000-0000-0000-000000615022',
   '00000000-0000-0000-0000-000000617022',
   '00000000-0000-0000-0000-000000616022',
   '00000000-0000-0000-0000-000000618022', 'pending', '   ', NULL, NULL, NULL);

INSERT INTO public.entry_status_history (entry_id, previous_status, new_status, reason)
VALUES ('00000000-0000-0000-0000-000000619022', NULL, 'pending', 'MYK9-615 disposable entry history');

INSERT INTO public.trial_packet_print_reminders (show_id, trial_date, reminder_kind)
VALUES ('00000000-0000-0000-0000-000000615022', DATE '2026-09-01', 'evening-before');

INSERT INTO public.stripe_orders (id, amount_cents, status, show_id)
VALUES
  ('00000000-0000-0000-0000-000000620003', 5000, 'succeeded',
   '00000000-0000-0000-0000-000000615003');

-- The refund's order is deliberately detached: only its payment-intent
-- association to the target entry protects the refund from show deletion.
INSERT INTO public.stripe_orders (id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000000620005', 3000, 'refunded');

INSERT INTO public.stripe_orders (id, amount_cents, status, enrollment_id)
VALUES ('00000000-0000-0000-0000-000000620004', 2500, 'succeeded',
        '00000000-0000-0000-0000-000000618004');

INSERT INTO public.stripe_order_refunds (
  order_id, stripe_refund_id, stripe_payment_intent_id, amount_cents, kind
)
VALUES ('00000000-0000-0000-0000-000000620005',
        're_myk9_615_refund', 'pi_myk9_615_refund', 1000, 'post_hoc');

INSERT INTO public.entry_payment_links (
  id, show_id, entry_ids, stripe_checkout_session_id, amount_cents
)
VALUES ('00000000-0000-0000-0000-000000620006',
        '00000000-0000-0000-0000-000000615006',
        ARRAY['00000000-0000-0000-0000-000000619006'::uuid],
        'cs_myk9_615_payment_link', 1500);

INSERT INTO public.show_money_locks (show_id, lock_id, holder, expires_at)
VALUES ('00000000-0000-0000-0000-000000615017',
        '00000000-0000-0000-0000-000000620017', 'stripe-refund-entry',
        now() + interval '5 minutes');

INSERT INTO public.promo_codes (
  id, show_id, trial_id, code, discount_type, discount_value, created_by
)
VALUES ('00000000-0000-0000-0000-000000620018',
        '00000000-0000-0000-0000-000000615018', NULL, 'MYK9615', 'flat', 5.00,
        '00000000-0000-0000-0000-000000615109');

INSERT INTO public.trial_packet_snapshots (
  id, snapshot_id, show_id, storage_path, generated_at, generated_by,
  sha256, page_count, byte_size, delivery_status
)
VALUES ('00000000-0000-0000-0000-000000620019',
        '00000000-0000-0000-0000-000000620119',
        '00000000-0000-0000-0000-000000615019',
        '00000000-0000-0000-0000-000000615019/emergency.pdf',
        now(), '00000000-0000-0000-0000-000000615109',
        repeat('a', 64), 1, 100, 'failed');

INSERT INTO public.show_payouts (id, show_id, amount_cents, status)
VALUES ('00000000-0000-0000-0000-000000620023',
        '00000000-0000-0000-0000-000000615023', 12500, 'completed');

-- Voided is still durable print evidence; it is intentionally counted too.
INSERT INTO public.paperwork_prints (
  id, show_id, scope_kind, report_id, coverage, fingerprint,
  printed_by, printed_by_name, printed_at, voided_at, voided_by, void_reason
)
VALUES (
  '00000000-0000-0000-0000-000000620024',
  '00000000-0000-0000-0000-000000615024', 'show', 'entry-list', '{}',
  'myk9-615-print-fingerprint', '00000000-0000-0000-0000-000000615109',
  'MYK9-615 Admin', now() - interval '1 minute', now(),
  '00000000-0000-0000-0000-000000615109', 'Fixture correction'
);

INSERT INTO public.show_incidents (
  id, show_id, incident_type, severity, summary, created_by
)
VALUES (
  '00000000-0000-0000-0000-000000620025',
  '00000000-0000-0000-0000-000000615025', 'complaint', 'reportable',
  'MYK9-615 retained incident evidence', '00000000-0000-0000-0000-000000615109'
);

INSERT INTO public.trial_packet_generation_claims (
  id, show_id, trial_date, last_error, failed_at, attempts
)
VALUES (
  '00000000-0000-0000-0000-000000620026',
  '00000000-0000-0000-0000-000000615026', DATE '2026-09-01',
  'MYK9-615 preserved failed packet-generation evidence', now(), 1
);

CREATE FUNCTION pg_temp.assert_hard_delete_refused(
  p_show_id uuid,
  p_expected_message text,
  p_case_name text
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

  IF v_error_state IS DISTINCT FROM '23503' THEN
    RAISE EXCEPTION 'FAIL MYK9-615 %: expected a readable refusal, got state % message %',
      p_case_name, v_error_state, v_error_message;
  END IF;

  IF lower(coalesce(v_error_message, '')) NOT LIKE '%' || lower(p_expected_message) || '%' THEN
    RAISE EXCEPTION 'FAIL MYK9-615 %: unreadable refusal: %', p_case_name, v_error_message;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = p_show_id) THEN
    RAISE EXCEPTION 'FAIL MYK9-615 %: refused show was removed anyway', p_case_name;
  END IF;

  RAISE NOTICE 'PASS MYK9-615 %: %', p_case_name, v_error_message;
END;
$function$;

DO $$
DECLARE
  admin_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000615109';
  test_case record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_auth_id, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FAIL MYK9-615: the site_admin fixture is not recognized by is_platform_admin()';
  END IF;

  FOR test_case IN
    SELECT * FROM (VALUES
      ('direct Stripe order', '00000000-0000-0000-0000-000000615003'::uuid, 'payment evidence'),
      ('enrollment-scoped Stripe order', '00000000-0000-0000-0000-000000615004'::uuid, 'payment evidence'),
      ('Stripe refund with detached order', '00000000-0000-0000-0000-000000615005'::uuid, 'refunds 1'),
      ('entry payment link', '00000000-0000-0000-0000-000000615006'::uuid, 'payment evidence'),
      ('nonblank enrollment payment reference', '00000000-0000-0000-0000-000000615007'::uuid, 'payment evidence'),
      ('nonblank entry payment reference', '00000000-0000-0000-0000-000000615008'::uuid, 'payment evidence'),
      ('paid enrollment status', '00000000-0000-0000-0000-000000615010'::uuid, 'payment evidence'),
      ('refunded enrollment status', '00000000-0000-0000-0000-000000615011'::uuid, 'payment evidence'),
      ('paid enrollment amount', '00000000-0000-0000-0000-000000615012'::uuid, 'payment evidence'),
      ('refunded enrollment amount', '00000000-0000-0000-0000-000000615013'::uuid, 'payment evidence'),
      ('paid entry status', '00000000-0000-0000-0000-000000615014'::uuid, 'payment evidence'),
      ('refunded entry status', '00000000-0000-0000-0000-000000615015'::uuid, 'payment evidence'),
      ('entry refund amount', '00000000-0000-0000-0000-000000615016'::uuid, 'payment evidence'),
      ('show money lock', '00000000-0000-0000-0000-000000615017'::uuid, 'money lock'),
      ('show promo code', '00000000-0000-0000-0000-000000615018'::uuid, 'promo code'),
      ('trial packet snapshot', '00000000-0000-0000-0000-000000615019'::uuid, 'trial packet'),
      ('cross-show entry association', '00000000-0000-0000-0000-000000615020'::uuid, 'cross-show entry association'),
      ('show payout', '00000000-0000-0000-0000-000000615023'::uuid, 'show payouts 1'),
      ('voided paperwork print confirmation', '00000000-0000-0000-0000-000000615024'::uuid, 'paperwork print confirmations 1'),
      ('permanent show incident', '00000000-0000-0000-0000-000000615025'::uuid, 'show incidents 1'),
      ('failed packet generation claim', '00000000-0000-0000-0000-000000615026'::uuid, 'packet generation claims 1')
    ) AS cases(case_name, show_id, expected_message)
  LOOP
    PERFORM pg_temp.assert_hard_delete_refused(
      test_case.show_id,
      test_case.expected_message,
      test_case.case_name
    );
  END LOOP;

  PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000615022');

  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000000615022')
     OR EXISTS (SELECT 1 FROM public.trials WHERE id = '00000000-0000-0000-0000-000000616022')
     OR EXISTS (SELECT 1 FROM public.classes WHERE id = '00000000-0000-0000-0000-000000617022')
     OR EXISTS (SELECT 1 FROM public.entries WHERE id = '00000000-0000-0000-0000-000000619022')
     OR EXISTS (SELECT 1 FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000618022')
     OR EXISTS (SELECT 1 FROM public.trial_packet_print_reminders WHERE show_id = '00000000-0000-0000-0000-000000615022')
     OR EXISTS (SELECT 1 FROM public.entry_status_history WHERE entry_id = '00000000-0000-0000-0000-000000619022') THEN
    RAISE EXCEPTION 'FAIL MYK9-615: zero-evidence show or its ordinary children survived deletion';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE 'PASS MYK9-615 zero-evidence show, whitespace references, and ordinary children delete';
END;
$$;

ROLLBACK;
