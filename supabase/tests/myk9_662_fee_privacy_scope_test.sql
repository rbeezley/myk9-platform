-- MYK9-662: handler quotes and co-owner changes must stay within the show.
-- Run after all migrations. Fixtures and assertions roll back together.
BEGIN;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000000663010', 'MYK9-662 scope club'),
  ('00000000-0000-0000-0000-000000663011', 'MYK9-662 other club');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id,
                          status, entry_open_date, entry_close_date,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
SELECT '00000000-0000-0000-0000-000000663101', 'MYK9-662 scope show', 'AKC',
       (d + 30)::timestamp AT TIME ZONE 'UTC',
       (d + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000663010', 'published',
       (d - 30)::timestamp AT TIME ZONE 'UTC',
       (d + 10)::timestamp AT TIME ZONE 'UTC', 30, 35, 45
FROM (SELECT (now() AT TIME ZONE 'UTC')::date d) x;
-- UKC measures junior age on January 1, even for an October trial.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id,
                          status, pre_entry_fee, junior_handler_fee)
SELECT '00000000-0000-0000-0000-000000663102', 'MYK9-662 UKC boundary', 'UKC',
       make_date(extract(year FROM now())::int + 1, 10, 10)::timestamp AT TIME ZONE 'UTC',
       make_date(extract(year FROM now())::int + 1, 10, 10)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000663010', 'published', 30, 15;
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
SELECT '00000000-0000-0000-0000-000000663201',
       '00000000-0000-0000-0000-000000663101', 'MYK9-662 scope trial',
       (now() AT TIME ZONE 'UTC')::date + 30, 'AKC', 'Scent Work', 'UTC';
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000000663202',
        '00000000-0000-0000-0000-000000663102', 'MYK9-662 UKC trial',
        make_date(extract(year FROM now())::int + 1, 10, 10),
        'UKC', 'Scent Work', 'UTC');
INSERT INTO public.classes (id, trial_id, name, element, level, status,
                            status_source, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663301',
        '00000000-0000-0000-0000-000000663201', 'Interior Novice A',
        'Interior', 'Novice', 'upcoming', 'manual', 30);
INSERT INTO public.classes (id, trial_id, name, element, level, status,
                            status_source, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663302',
        '00000000-0000-0000-0000-000000663201', 'Exterior Novice A',
        'Exterior', 'Novice', 'upcoming', 'manual', 30);
INSERT INTO public.classes (id, trial_id, name, element, level, status,
                            status_source, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663303',
        '00000000-0000-0000-0000-000000663202', 'UKC Interior Novice A',
        'Interior', 'Novice', 'upcoming', 'manual', 30);
INSERT INTO public.classes (id, trial_id, name, element, level, status,
                            status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000663304',
   '00000000-0000-0000-0000-000000663201', 'Mixed Adult Class',
   'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000663305',
   '00000000-0000-0000-0000-000000663201', 'Mixed Junior Class',
   'Exterior', 'Novice', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-000000663001', 'Scope', 'Owner', 'myk9-662-scope-owner@example.test'),
  ('00000000-0000-0000-0000-000000663002', 'Scope', 'Outsider', 'myk9-662-scope-outsider@example.test'),
  ('00000000-0000-0000-0000-000000663003', 'Scope', 'Secretary', 'myk9-662-scope-secretary@example.test');
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000663004', 'Scope', 'UKCBoundary',
        'myk9-662-scope-ukc@example.test');
INSERT INTO public.people_private (person_id, date_of_birth)
SELECT '00000000-0000-0000-0000-000000663002',
       ((now() AT TIME ZONE 'UTC')::date + 30 - interval '15 years')::date;
INSERT INTO public.people_private (person_id, date_of_birth)
VALUES ('00000000-0000-0000-0000-000000663004',
        make_date(extract(year FROM now())::int - 17, 6, 15));
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', v.email, '', now(), now(), now(), '{}', '{}',
       false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000663701'::uuid, 'myk9-662-scope-owner@example.test'),
  ('00000000-0000-0000-0000-000000663702'::uuid, 'myk9-662-scope-outsider@example.test'),
  ('00000000-0000-0000-0000-000000663703'::uuid, 'myk9-662-scope-secretary@example.test')
) v(id, email);
UPDATE public.people p SET auth_user_id = v.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000663001'::uuid, '00000000-0000-0000-0000-000000663701'::uuid),
  ('00000000-0000-0000-0000-000000663002'::uuid, '00000000-0000-0000-0000-000000663702'::uuid),
  ('00000000-0000-0000-0000-000000663003'::uuid, '00000000-0000-0000-0000-000000663703'::uuid)
) v(person_id, auth_id) WHERE p.id = v.person_id;
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000663003', r.id,
       '00000000-0000-0000-0000-000000663010', true,
       '00000000-0000-0000-0000-000000663703'
FROM public.roles r WHERE r.name = 'secretary';
-- The owner is also staff, but only at another club.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000663001', r.id,
       '00000000-0000-0000-0000-000000663011', true,
       '00000000-0000-0000-0000-000000663701'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000663401', 'Scope Dog', 'Scope',
        'Beagle', 'active', '00000000-0000-0000-0000-000000663001');
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000663402', 'Unowned Dog', 'Unowned',
        'Beagle', 'active', NULL);
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000663403', 'Junior Dog', 'Junior',
        'Beagle', 'active', '00000000-0000-0000-0000-000000663002');
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000663404', 'UKC Boundary Dog', 'Boundary',
        'Beagle', 'active', '00000000-0000-0000-0000-000000663004');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000663401', 'AKC', 'AKC66300001', true),
  ('00000000-0000-0000-0000-000000663402', 'AKC', 'AKC66300002', true),
  ('00000000-0000-0000-0000-000000663403', 'AKC', 'AKC66300003', true),
  ('00000000-0000-0000-0000-000000663404', 'UKC', 'UKC66300004', true);
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000663501',
        '00000000-0000-0000-0000-000000663101',
        '00000000-0000-0000-0000-000000663001', 'pending');
INSERT INTO public.entries (id, show_id, class_id, trial_id, dog_id, handler_id,
                            entry_status, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663901',
        '00000000-0000-0000-0000-000000663101',
        '00000000-0000-0000-0000-000000663301',
        '00000000-0000-0000-0000-000000663201',
        '00000000-0000-0000-0000-000000663401',
        '00000000-0000-0000-0000-000000663001', 'confirmed', 'pending', 30);
INSERT INTO public.entries (id, show_id, class_id, trial_id, dog_id, handler_id,
                            entry_status, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663902',
        '00000000-0000-0000-0000-000000663101',
        '00000000-0000-0000-0000-000000663301',
        '00000000-0000-0000-0000-000000663201',
        '00000000-0000-0000-0000-000000663402',
        NULL, 'confirmed', 'pending', NULL);
-- Junior fee deliberately exceeds both regular and day-of-show rates. A
-- configured junior tier still wins; the adult keeps the day-of-show rate.
INSERT INTO public.entries (id, show_id, class_id, trial_id, dog_id, handler_id,
                            entry_source, entry_status, payment_status,
                            entry_fee, is_day_of_show)
VALUES
  ('00000000-0000-0000-0000-000000663903',
   '00000000-0000-0000-0000-000000663101',
   '00000000-0000-0000-0000-000000663301',
   '00000000-0000-0000-0000-000000663201',
   '00000000-0000-0000-0000-000000663403',
   '00000000-0000-0000-0000-000000663002',
   'myk9', 'confirmed', 'pending', NULL, true),
  ('00000000-0000-0000-0000-000000663904',
   '00000000-0000-0000-0000-000000663101',
   '00000000-0000-0000-0000-000000663302',
   '00000000-0000-0000-0000-000000663201',
   '00000000-0000-0000-0000-000000663401',
   '00000000-0000-0000-0000-000000663001',
   'myk9', 'confirmed', 'pending', NULL, true);
INSERT INTO public.entries (id, show_id, class_id, trial_id, dog_id, handler_id,
                            entry_source, entry_status, payment_status, entry_fee)
VALUES ('00000000-0000-0000-0000-000000663905',
        '00000000-0000-0000-0000-000000663102',
        '00000000-0000-0000-0000-000000663303',
        '00000000-0000-0000-0000-000000663202',
        '00000000-0000-0000-0000-000000663404',
        '00000000-0000-0000-0000-000000663004',
        'myk9', 'confirmed', 'pending', NULL);
DO $$
BEGIN
  IF (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000663903') <> 45
     OR (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000663904') <> 35
     OR (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000663905') <> 15 THEN
    RAISE EXCEPTION 'FAIL junior/day-of-show fee precedence';
  END IF;
END;
$$;
-- An older paid line on this enrollment must stay paid when the new mixed
-- receipt leaves the enrollment partly due.
UPDATE public.entries
   SET registration_id = '00000000-0000-0000-0000-000000663501',
       payment_status = 'paid', payment_method = 'check'
 WHERE id = '00000000-0000-0000-0000-000000663904';
SET LOCAL ROLE service_role;
UPDATE public.enrollments
   SET total_amount = 3500, paid_amount = 35, payment_status = 'paid_by_check'
 WHERE id = '00000000-0000-0000-0000-000000663501';
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663799', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663799","role":"authenticated"}', true);
  BEGIN
    PERFORM public.freeze_pending_entry_fee('00000000-0000-0000-0000-000000663902');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'Not authorized to price this entry';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL NULL owner and caller bypassed fee authorization'; END IF;
END;
$$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663701', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663701","role":"authenticated"}', true);
  BEGIN
    PERFORM public.staff_entries_need_junior_fee(
      '00000000-0000-0000-0000-000000663101',
      '[{"dog_id":"00000000-0000-0000-0000-000000663403", "class_id":"00000000-0000-0000-0000-000000663301"}]');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'Not authorized to quote show entries';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL self-service caller reached staff quote'; END IF;
END;
$$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663703', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663703","role":"authenticated"}', true);
  BEGIN
    PERFORM public.staff_entries_need_junior_fee(
      '00000000-0000-0000-0000-000000663101',
      '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663301", "handler_id":"00000000-0000-0000-0000-000000663002"}]');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'Handler has no relationship to this dog or show';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL unrelated handler quote was allowed'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.staff_entries_junior_fee_decisions(
      '00000000-0000-0000-0000-000000663101',
      '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663301", "handler_id":"00000000-0000-0000-0000-000000663002"}]');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'Handler has no relationship to this dog or show';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL unrelated handler decisions were allowed'; END IF;
  IF public.staff_entries_junior_fee_decisions(
    '00000000-0000-0000-0000-000000663101',
    '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663301"}, {"dog_id":"00000000-0000-0000-0000-000000663403", "class_id":"00000000-0000-0000-0000-000000663301"}, {"dog_id":"00000000-0000-0000-0000-000000663403", "class_id":"00000000-0000-0000-0000-000000663302", "handler_name":"Unknown Handler"}]'
  ) IS DISTINCT FROM ARRAY[false, true, false] THEN
    RAISE EXCEPTION 'FAIL ordered adult/junior/unknown quote decisions';
  END IF;
  IF public.staff_entries_need_junior_fee(
    '00000000-0000-0000-0000-000000663101',
    '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663301"}]'
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL related owner quote';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000663101', null,
      '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663301", "handler_id":"00000000-0000-0000-0000-000000663002", "client_fee_cents":3000}]',
      '00000000-0000-0000-0000-000000663801', 'secretary_paid');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'Handler has no relationship to this dog or show';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL unrelated staff submit fee oracle was allowed'; END IF;
END;
$$;

-- One received payment must cover only the adult line, while both exact fees
-- enter the enrollment total. A retry returns the stored result untouched.
DO $$
DECLARE
  result jsonb;
  replay jsonb;
  adult_id uuid;
  junior_id uuid;
  total integer;
  paid numeric;
  ledger_count integer;
  ledger_amount numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663703', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663703","role":"authenticated"}', true);
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000663101',
    '00000000-0000-0000-0000-000000663501',
    '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663304"}, {"dog_id":"00000000-0000-0000-0000-000000663403", "class_id":"00000000-0000-0000-0000-000000663305"}]',
    '00000000-0000-0000-0000-000000663802', 'check',
    '{"method":"check", "reference":"MIXED-662"}');
  IF jsonb_array_length(result->'entries') <> 2
     OR result->'outcomes'->0->>'payment_deferred' <> 'false'
     OR result->'outcomes'->1->>'payment_deferred' <> 'true' THEN
    RAISE EXCEPTION 'FAIL mixed payment outcome flags: %', result;
  END IF;
  adult_id := (result->'entries'->0->>'entry_id')::uuid;
  junior_id := (result->'entries'->1->>'entry_id')::uuid;
  IF (SELECT payment_status FROM public.entries WHERE id = adult_id) <> 'paid'
     OR (SELECT payment_status FROM public.entries WHERE id = junior_id) <> 'pending'
     OR (SELECT payment_status FROM public.entries
         WHERE id = '00000000-0000-0000-0000-000000663904') <> 'paid'
     OR (SELECT payment_method FROM public.entries WHERE id = adult_id) <> 'check'
     OR (SELECT payment_method FROM public.entries WHERE id = junior_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL mixed payment entry states';
  END IF;
  SELECT total_amount, paid_amount INTO total, paid
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000663501';
  SELECT count(*), sum(amount) INTO ledger_count, ledger_amount
    FROM public.show_payments
   WHERE client_payment_id = '00000000-0000-0000-0000-000000663802';
  IF total <> 11000 OR paid <> 65 OR ledger_count <> 1 OR ledger_amount <> 30 THEN
    RAISE EXCEPTION 'FAIL mixed payment enrollment/ledger: total %, paid %, rows %, amount %',
      total, paid, ledger_count, ledger_amount;
  END IF;
  replay := public.submit_show_entries(
    '00000000-0000-0000-0000-000000663101',
    '00000000-0000-0000-0000-000000663501',
    '[{"dog_id":"00000000-0000-0000-0000-000000663401", "class_id":"00000000-0000-0000-0000-000000663304"}, {"dog_id":"00000000-0000-0000-0000-000000663403", "class_id":"00000000-0000-0000-0000-000000663305"}]',
    '00000000-0000-0000-0000-000000663802', 'check',
    '{"method":"check", "reference":"MIXED-662"}');
  IF replay IS DISTINCT FROM result
     OR (SELECT count(*) FROM public.show_payments
         WHERE client_payment_id = '00000000-0000-0000-0000-000000663802') <> 1
     OR (SELECT total_amount FROM public.enrollments
         WHERE id = '00000000-0000-0000-0000-000000663501') <> 11000 THEN
    RAISE EXCEPTION 'FAIL mixed payment replay';
  END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663701', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663701","role":"authenticated"}', true);
  BEGIN
    UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000663002'
      WHERE id = '00000000-0000-0000-0000-000000663401';
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'A co-owner must be verified by show staff before assignment';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL other-club staff assigned co-owner'; END IF;
  UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000663001'
    WHERE id = '00000000-0000-0000-0000-000000663401';
  IF (SELECT co_owner_id FROM public.dogs
      WHERE id = '00000000-0000-0000-0000-000000663401')
      IS DISTINCT FROM '00000000-0000-0000-0000-000000663001'::uuid THEN
    RAISE EXCEPTION 'FAIL verified self co-owner assignment';
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663703', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000663703","role":"authenticated"}', true);
  UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000663002'
    WHERE id = '00000000-0000-0000-0000-000000663401';
  IF (SELECT co_owner_id FROM public.dogs
      WHERE id = '00000000-0000-0000-0000-000000663401')
      IS DISTINCT FROM '00000000-0000-0000-0000-000000663002'::uuid THEN
    RAISE EXCEPTION 'FAIL relevant show staff co-owner assignment';
  END IF;
END;
$$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.prune_entry_checkout_fee_snapshots();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL authenticated caller reached snapshot prune'; END IF;
END;
$$;
RESET ROLE;
INSERT INTO public.entry_checkout_fee_snapshots (
  session_id, cart_id, show_id, exhibitor_id, items,
  subtotal_cents, platform_fee_cents, total_cents, created_at
)
VALUES
  ('myk9-662-old-snapshot', '00000000-0000-0000-0000-000000663801',
   '00000000-0000-0000-0000-000000663101',
   '00000000-0000-0000-0000-000000663999', '[]', 0, 0, 0,
   now() - interval '8 years'),
  ('myk9-662-recent-snapshot', '00000000-0000-0000-0000-000000663802',
   '00000000-0000-0000-0000-000000663101',
   '00000000-0000-0000-0000-000000663999', '[]', 0, 0, 0,
   now() - interval '6 years');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.prune_entry_checkout_fee_snapshots();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.entry_checkout_fee_snapshots
             WHERE session_id = 'myk9-662-old-snapshot')
     OR NOT EXISTS (SELECT 1 FROM public.entry_checkout_fee_snapshots
                    WHERE session_id = 'myk9-662-recent-snapshot') THEN
    RAISE EXCEPTION 'FAIL seven-year snapshot retention boundary';
  END IF;
END;
$$;
UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000663001'
WHERE id = '00000000-0000-0000-0000-000000663401';
DO $$
BEGIN
  IF (SELECT co_owner_id FROM public.dogs
      WHERE id = '00000000-0000-0000-0000-000000663401')
      IS DISTINCT FROM '00000000-0000-0000-0000-000000663001'::uuid THEN
    RAISE EXCEPTION 'FAIL service co-owner assignment';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
