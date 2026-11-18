-- MYK9-1930: a day-of entry with no entry form gets one from the server.
-- Behavioural contract for 20261119173700_myk9_1930_late_entry_gets_form.sql.
--
-- The live path, as the secretary's replicated INSERT (no registration_id):
--   (a) an unpaid pay-at-show entry gets a new form that owes its fee;
--   (b) an unpaid entry joins the exhibitor's fully paid form, which reopens to owing;
--   (c) a desk-paid cash entry: one form-parented ledger row keyed on the entry id, form paid,
--       no entry-parented row; a replayed INSERT and a replayed payment write nothing more;
--   (d) a desk-paid entry joining a form that still owes: the $30 is on the form, it still owes;
--   (e) a waived entry: a new 'waived' form that owes nothing;
--   (f) a refunded entry: a new 'refunded' form that owes and holds nothing;
--   (g) secretary_paid: paid_amount on the form, no ledger row;
--   card entries (method 'online', a Stripe intent) stay formless; submit_show_entries'
--   entries keep the form they name and their money is recorded once; the seed's session (no
--   person) and a dog with no owner stay formless.
-- Who and what (review round 1): a manual waitlist offer ('pending-payment', paid by card later)
-- stays formless, in the live path and the backfill; a paid entry with another method or none
-- records nothing (the form owes); submit_show_entries with no form gives its desk entries a
-- form and records secretary_paid once; a club admin without the secretary role gets the form
-- owing the fee and no money, resolved by a later Paid in Full: Cash; a signed-in person who
-- cannot manage the show gets only the RLS refusal and takes no confirmation number; a client's
-- NULL registration_id keeps the form while service_role and owner-run code can change it.
-- The backfill (private.backfill_entry_forms), replayed on legacy formless fixtures: pending,
-- paid with a ledger row, paid with no method, refunded with and without a ledger row, a mixed
-- form, joining an existing paid form; soft-deleted, seed-range and card entries untouched; the
-- ledger's rows and totals equal before and after; a second run attaches nothing.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.
-- Runs in CI (scripts/qa/run-behavioral-sql-tests.sh) or locally with `pnpm qa:sql-local`.

BEGIN;

ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

-- --- catalog ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.entries'::regclass
                    AND tgname = 'trg_zz_entries_attach_entry_form' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                     WHERE tgrelid = 'public.entries'::regclass
                       AND tgname = 'trg_entries_settle_attached_form_money' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                     WHERE tgrelid = 'public.entries'::regclass
                       AND tgname = 'trg_zz_entries_keep_entry_form' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FAIL the MYK9-1930 triggers are missing';
  END IF;
  IF has_function_privilege('authenticated', 'private.backfill_entry_forms()', 'EXECUTE')
     OR has_function_privilege('anon', 'private.backfill_entry_forms()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.entry_form_for(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.entries_attach_entry_form()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.entries_settle_attached_form_money()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL a MYK9-1930 function is executable by a client role';
  END IF;
  RAISE NOTICE 'PASS triggers present; no MYK9-1930 function is callable by clients';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000001930801', 'secretary', 'MYK9-1930 fixture', true),
  ('00000000-0000-0000-0000-000001930802', 'club_admin', 'MYK9-1930 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001930c10', 'MYK9-1930 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
SELECT '00000000-0000-0000-0000-000001930c11', 'MYK9-1930 Show', 'UKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC', (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000001930c10', 'published',
       (today - 30)::timestamp AT TIME ZONE 'UTC', (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor;

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001930c21', '00000000-0000-0000-0000-000001930c11',
        'MYK9-1930 Trial', (now() AT TIME ZONE 'UTC')::date + 30, 'UKC', 'Nosework', 'UTC');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001930c31', '00000000-0000-0000-0000-000001930c21',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001930c32', '00000000-0000-0000-0000-000001930c21',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001930c02', 'MYK9-1930', 'Secretary',
        'myk9-1930-secretary@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000001930b02', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-1930-secretary@example.test', '', now(), now(),
        now(), '{}', '{}', false, false, false);
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001930b02'
 WHERE id = '00000000-0000-0000-0000-000001930c02';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001930c02', roles.id, '00000000-0000-0000-0000-000001930c10',
       true, '00000000-0000-0000-0000-000001930b02'
  FROM public.roles WHERE roles.name = 'secretary';

-- The club's admin without the secretary role (...c03): may insert entries on the show
-- (can_manage_show) but may not record money (can_record_show_payment). And a signed-in
-- person with no role at all (...c04).
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001930c03', 'MYK9-1930', 'Club Admin',
        'myk9-1930-club-admin@example.test'),
       ('00000000-0000-0000-0000-000001930c04', 'MYK9-1930', 'Outsider',
        'myk9-1930-outsider@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001930b03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1930-club-admin@example.test', '', now(), now(),
   now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001930b04', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1930-outsider@example.test', '', now(), now(),
   now(), '{}', '{}', false, false, false);
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001930b03'
 WHERE id = '00000000-0000-0000-0000-000001930c03';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001930b04'
 WHERE id = '00000000-0000-0000-0000-000001930c04';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001930c03', roles.id, '00000000-0000-0000-0000-000001930c10',
       true, '00000000-0000-0000-0000-000001930b03'
  FROM public.roles WHERE roles.name = 'club_admin';

-- One exhibitor and one dog per case: people ...e<nn>, dogs ...d<nn>. Dog 10 has no owner.
CREATE FUNCTION pg_temp.e(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-000001930e' || lpad(p_n::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.d(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-000001930d' || lpad(p_n::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.en(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-000001930a' || lpad(p_n::text, 2, '0'))::uuid $$;
GRANT EXECUTE ON FUNCTION pg_temp.e(int), pg_temp.d(int), pg_temp.en(int) TO authenticated, service_role;

INSERT INTO public.people (id, first_name, last_name, email)
SELECT pg_temp.e(n), 'MYK9-1930', 'Exhibitor ' || n, 'myk9-1930-exhibitor-' || n || '@example.test'
  FROM generate_series(1, 40) AS n;
-- Exhibitor 12 signs in (the waitlist case needs a real account). Her person row comes
-- first, as for the secretary above: a sign-up whose email has no person yet makes one,
-- and that row would collide with the person just inserted (people_email_unique).
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001930b12', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1930-exhibitor-12@example.test', '', now(), now(),
   now(), '{}', '{}', false, false, false);
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.d(n), 'MYK9-1930 Dog ' || n, 'Cap', 'Beagle', 'active',
       CASE WHEN n = 10 THEN NULL ELSE pg_temp.e(n) END
  FROM generate_series(1, 40) AS n;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT pg_temp.d(n), 'UKC', 'UKC1930' || lpad(n::text, 2, '0'), true
  FROM generate_series(1, 40) AS n;
-- Dog 35 belongs to exhibitor 34 (two dogs of one exhibitor in one statement, below).
UPDATE public.dogs SET owner_id = pg_temp.e(34) WHERE id = pg_temp.d(35);

-- One exhibitor's form on the show as a comparable line, or 'none'.
CREATE FUNCTION pg_temp.form1930(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE((
    SELECT format('status=%s total=%s paid=%s refund=%s method=%s payments=%s',
                  en.payment_status, en.total_amount, COALESCE(en.paid_amount, 0)::numeric(10, 2),
                  COALESCE(en.refund_amount, 0)::numeric(10, 2), COALESCE(en.payment_method, 'null'),
                  COALESCE((SELECT string_agg(sp.amount::numeric(10, 2)::text, ',' ORDER BY sp.amount)
                              FROM public.show_payments sp
                             WHERE sp.enrollment_id = en.id AND sp.kind = 'payment'), 'none'))
      FROM public.enrollments en
     WHERE en.show_id = '00000000-0000-0000-0000-000001930c11' AND en.handler_id = pg_temp.e(p_n)),
    'none') $$;

-- The form id an exhibitor's entry points at, compared to the exhibitor's form.
CREATE FUNCTION pg_temp.on_own_form(p_entry int, p_n int) RETURNS boolean LANGUAGE sql AS $$
  SELECT e.registration_id IS NOT DISTINCT FROM (
           SELECT en.id FROM public.enrollments en
            WHERE en.show_id = '00000000-0000-0000-0000-000001930c11'
              AND en.handler_id = pg_temp.e(p_n))
         AND e.registration_id IS NOT NULL
    FROM public.entries e WHERE e.id = pg_temp.en(p_entry) $$;

-- A desk INSERT shaped like submitOfflineLateEntry's replicated row.
CREATE FUNCTION pg_temp.desk_insert(
  p_entry int, p_n int, p_class text, p_status text, p_method text, p_fee numeric,
  p_received date DEFAULT NULL, p_reference text DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, handler,
                              entry_status, payment_status, payment_method, entry_fee,
                              payment_received_on, payment_reference, is_day_of_show, submitted_at)
  VALUES (pg_temp.en(p_entry), '00000000-0000-0000-0000-000001930c11',
          '00000000-0000-0000-0000-000001930c21',
          ('00000000-0000-0000-0000-000001930c' || p_class)::uuid, pg_temp.d(p_n),
          CASE WHEN p_n = 10 THEN NULL ELSE pg_temp.e(p_n) END, 'MYK9-1930 Handler',
          'confirmed', p_status, p_method, p_fee, p_received, p_reference, true, now()) $$;
GRANT EXECUTE ON FUNCTION pg_temp.desk_insert(int, int, text, text, text, numeric, date, text)
  TO authenticated, service_role;

-- Forms that exist before the desk entries: (b) e2 paid by cash, (d) e4 still owing.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000001930f02', '00000000-0000-0000-0000-000001930c11',
        pg_temp.e(2), 'pending'),
       ('00000000-0000-0000-0000-000001930f04', '00000000-0000-0000-0000-000001930c11',
        pg_temp.e(4), 'pending');

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);
  -- e2: $30 class paid in cash at submission. e4: $30 class, nothing paid yet.
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930f02',
    jsonb_build_array(jsonb_build_object('dog_id', pg_temp.d(2),
      'class_id', '00000000-0000-0000-0000-000001930c31',
      'handler_name', 'MYK9-1930 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001930c62', 'cash', jsonb_build_object('method', 'cash'));
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930f04',
    jsonb_build_array(jsonb_build_object('dog_id', pg_temp.d(4),
      'class_id', '00000000-0000-0000-0000-000001930c31',
      'handler_name', 'MYK9-1930 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001930c64', 'cash');
END;
$$;
RESET ROLE;

-- submit_show_entries is untouched: its entries keep the form they name, the cash is recorded
-- once (not again by the new AFTER trigger), and no second form appears.
DO $$
BEGIN
  IF pg_temp.form1930(2) IS DISTINCT FROM
       'status=paid_by_cash total=3000 paid=30.00 refund=0.00 method=cash payments=30.00'
     OR pg_temp.form1930(4) IS DISTINCT FROM
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'
     OR (SELECT count(*) FROM public.enrollments
          WHERE handler_id IN (pg_temp.e(2), pg_temp.e(4))) <> 2
     OR EXISTS (SELECT 1 FROM public.entries e
                 WHERE e.dog_id IN (pg_temp.d(2), pg_temp.d(4))
                   AND e.registration_id NOT IN ('00000000-0000-0000-0000-000001930f02',
                                                 '00000000-0000-0000-0000-000001930f04')) THEN
    RAISE EXCEPTION 'FAIL submit_show_entries setup: [%] [%]', pg_temp.form1930(2), pg_temp.form1930(4);
  END IF;
  RAISE NOTICE 'PASS submit_show_entries keeps its form and records its money once';
END;
$$;

-- --- the live path: the secretary's replicated INSERTs ---------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);

SELECT pg_temp.desk_insert(1, 1, '31', 'pending', 'cash', 30);                       -- (a)
SELECT pg_temp.desk_insert(2, 2, '32', 'pending', 'check', 30);                      -- (b)
SELECT pg_temp.desk_insert(3, 3, '31', 'paid', 'cash', 30,
                           (now() AT TIME ZONE 'UTC')::date - 1, 'R-1930');           -- (c)
SELECT pg_temp.desk_insert(4, 4, '32', 'paid', 'cash', 30);                          -- (d)
SELECT pg_temp.desk_insert(5, 5, '31', 'waived', 'waived', 0);                       -- (e)
SELECT pg_temp.desk_insert(6, 6, '31', 'refunded', 'cash', 30);                      -- (f)
SELECT pg_temp.desk_insert(7, 7, '31', 'paid', 'secretary_paid', 30);                -- (g)
SELECT pg_temp.desk_insert(8, 8, '31', 'pending', 'online', 30);                     -- card
SELECT pg_temp.desk_insert(10, 10, '31', 'pending', 'cash', 30);                     -- no owner

-- (c) replayed: the replication retry of the same INSERT dies on the primary key and writes
-- nothing (mutation-execute.ts treats its 23505 as success).
DO $$
BEGIN
  PERFORM pg_temp.desk_insert(3, 3, '31', 'paid', 'cash', 30,
                              (now() AT TIME ZONE 'UTC')::date - 1, 'R-1930');
  RAISE EXCEPTION 'FAIL a replayed desk INSERT succeeded';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS a replayed desk INSERT is a duplicate';
END;
$$;

-- (c) the payment itself replayed with the same key (the entry id): nothing more is recorded.
SELECT public.record_enrollment_payment(
  (SELECT registration_id FROM public.entries WHERE id = pg_temp.en(3)),
  'payment', 30, 'cash', NULL, 'R-1930', NULL, pg_temp.en(3));

-- A Stripe card entry, written by the payment service: no person, an intent.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, entry_status,
                            payment_status, payment_method, entry_fee, stripe_payment_intent_id)
VALUES (pg_temp.en(9), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
        '00000000-0000-0000-0000-000001930c32', pg_temp.d(8), pg_temp.e(8), 'paid', 'paid', 'online',
        30, 'pi_myk9_1930_card');
RESET ROLE;

-- The seed's session: postgres, no person.
SELECT pg_temp.desk_insert(11, 9, '31', 'pending', 'cash', 30);

DO $$
DECLARE
  v_case record;
  v_row public.show_payments%ROWTYPE;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      (1, '(a) unpaid pay-at-show entry: a new form that owes its fee',
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'),
      (2, '(b) unpaid entry joins a fully paid form, which reopens to owing',
       'status=pending total=6000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (3, '(c) desk-paid cash: one form-parented payment, form paid',
       'status=paid_by_cash total=3000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (4, '(d) desk-paid cash joins a form that still owes: money on the form, it still owes',
       'status=pending total=6000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (5, '(e) waived: a new waived form that owes nothing',
       'status=waived total=0 paid=0.00 refund=0.00 method=waived payments=none'),
      (6, '(f) refunded: a new refunded form that owes and holds nothing',
       'status=refunded total=0 paid=0.00 refund=0.00 method=cash payments=none'),
      (7, '(g) secretary_paid: paid on the form, no ledger row',
       'status=paid total=3000 paid=30.00 refund=0.00 method=secretary_paid payments=none'),
      (8, 'card entries (online method, Stripe intent): no form', 'none'),
      (9, 'the seed session (no person): no form', 'none')
    ) AS t(n, label, want)
  LOOP
    IF pg_temp.form1930(v_case.n) IS DISTINCT FROM v_case.want THEN
      RAISE EXCEPTION 'FAIL %: got [%], want [%]', v_case.label, pg_temp.form1930(v_case.n), v_case.want;
    END IF;
    RAISE NOTICE 'PASS %', v_case.label;
  END LOOP;

  IF NOT (pg_temp.on_own_form(1, 1) AND pg_temp.on_own_form(2, 2) AND pg_temp.on_own_form(3, 3)
          AND pg_temp.on_own_form(4, 4) AND pg_temp.on_own_form(5, 5) AND pg_temp.on_own_form(6, 6)
          AND pg_temp.on_own_form(7, 7)) THEN
    RAISE EXCEPTION 'FAIL a desk entry does not point at its exhibitor''s form';
  END IF;
  IF (SELECT registration_id FROM public.entries WHERE id = pg_temp.en(2))
       IS DISTINCT FROM '00000000-0000-0000-0000-000001930f02'
     OR (SELECT registration_id FROM public.entries WHERE id = pg_temp.en(4))
       IS DISTINCT FROM '00000000-0000-0000-0000-000001930f04' THEN
    RAISE EXCEPTION 'FAIL a desk entry did not join the exhibitor''s existing form';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entries
              WHERE id IN (pg_temp.en(8), pg_temp.en(9), pg_temp.en(10), pg_temp.en(11))
                AND registration_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a card, no-owner or seed-session entry was given a form';
  END IF;
  RAISE NOTICE 'PASS each desk entry is on its exhibitor''s form; card, owner-less and seed entries are not';

  -- (c) exactly one ledger row, form-parented, keyed on the entry, on the entry's date.
  IF (SELECT count(*) FROM public.show_payments sp
       WHERE sp.client_payment_id = pg_temp.en(3)) <> 1
     OR EXISTS (SELECT 1 FROM public.show_payments sp
                 WHERE sp.entry_id IN (pg_temp.en(1), pg_temp.en(2), pg_temp.en(3), pg_temp.en(4),
                                       pg_temp.en(5), pg_temp.en(6), pg_temp.en(7))) THEN
    RAISE EXCEPTION 'FAIL desk money left an entry-parented row or was recorded more than once';
  END IF;
  SELECT * INTO v_row FROM public.show_payments sp WHERE sp.client_payment_id = pg_temp.en(3);
  IF v_row.enrollment_id IS DISTINCT FROM (SELECT registration_id FROM public.entries
                                             WHERE id = pg_temp.en(3))
     OR v_row.entry_id IS NOT NULL OR v_row.amount <> 30 OR v_row.method <> 'cash'
     OR v_row.received_on <> (now() AT TIME ZONE 'UTC')::date - 1
     OR v_row.reference IS DISTINCT FROM 'R-1930'
     OR v_row.recorded_by IS DISTINCT FROM '00000000-0000-0000-0000-000001930b02' THEN
    RAISE EXCEPTION 'FAIL (c) ledger row: %', row_to_json(v_row);
  END IF;
  RAISE NOTICE 'PASS (c) one form-parented row, keyed on the entry, dated as received, retry-safe';

  -- (c) and (g): the entry itself still reads paid.
  IF (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(3)) IS DISTINCT FROM 'paid'
     OR (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(7)) IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'FAIL a desk-paid entry no longer reads paid';
  END IF;
  RAISE NOTICE 'PASS desk-paid entries stay paid';
END;
$$;

-- --- several entries in ONE statement (review round 3) ---------------------------
-- Every BEFORE row trigger runs before any AFTER row trigger, so each attached row must find
-- itself in the transaction's set, not only the last one.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);
-- M1: two paid cash entries of one exhibitor (dogs 34 and 35, both exhibitor 34).
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, handler,
                            entry_status, payment_status, payment_method, entry_fee,
                            is_day_of_show, submitted_at)
VALUES
  (pg_temp.en(61), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(34), pg_temp.e(34), 'MYK9-1930 Handler',
   'confirmed', 'paid', 'cash', 30, true, now()),
  (pg_temp.en(62), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(35), pg_temp.e(34), 'MYK9-1930 Handler',
   'confirmed', 'paid', 'cash', 30, true, now());
-- M2: two exhibitors, cash and check.
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, handler,
                            entry_status, payment_status, payment_method, entry_fee,
                            is_day_of_show, submitted_at)
VALUES
  (pg_temp.en(63), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(36), pg_temp.e(36), 'MYK9-1930 Handler',
   'confirmed', 'paid', 'cash', 30, true, now()),
  (pg_temp.en(64), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(37), pg_temp.e(37), 'MYK9-1930 Handler',
   'confirmed', 'paid', 'check', 30, true, now());
-- M3: one paid cash, one unpaid, one card (online method), in one statement.
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, handler,
                            entry_status, payment_status, payment_method, entry_fee,
                            is_day_of_show, submitted_at)
VALUES
  (pg_temp.en(65), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(38), pg_temp.e(38), 'MYK9-1930 Handler',
   'confirmed', 'paid', 'cash', 30, true, now()),
  (pg_temp.en(66), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(39), pg_temp.e(39), 'MYK9-1930 Handler',
   'confirmed', 'pending', 'cash', 30, true, now()),
  (pg_temp.en(67), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(40), pg_temp.e(40), 'MYK9-1930 Handler',
   'confirmed', 'pending', 'online', 30, true, now());
RESET ROLE;

DO $$
DECLARE
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      (34, 'M1 two paid cash entries of one exhibitor in one statement: both recorded',
       'status=paid_by_cash total=6000 paid=60.00 refund=0.00 method=cash payments=30.00,30.00'),
      (36, 'M2 two exhibitors in one statement: the cash one recorded',
       'status=paid_by_cash total=3000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (37, 'M2 two exhibitors in one statement: the check one recorded',
       'status=paid_by_check total=3000 paid=30.00 refund=0.00 method=check payments=30.00'),
      (38, 'M3 mixed statement: the paid cash entry recorded',
       'status=paid_by_cash total=3000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (39, 'M3 mixed statement: the unpaid entry owes',
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'),
      (40, 'M3 mixed statement: the card entry gets no form', 'none')
    ) AS t(n, label, want)
  LOOP
    IF pg_temp.form1930(v_case.n) IS DISTINCT FROM v_case.want THEN
      RAISE EXCEPTION 'FAIL %: got [%], want [%]', v_case.label, pg_temp.form1930(v_case.n), v_case.want;
    END IF;
    RAISE NOTICE 'PASS %', v_case.label;
  END LOOP;

  -- One ledger row per paid entry, each keyed on its own entry; none for the others.
  IF (SELECT count(*) FROM public.show_payments
       WHERE client_payment_id IN (pg_temp.en(61), pg_temp.en(62), pg_temp.en(63),
                                   pg_temp.en(64), pg_temp.en(65))) <> 5
     OR EXISTS (SELECT 1 FROM public.show_payments
                 WHERE client_payment_id IN (pg_temp.en(66), pg_temp.en(67))
                    OR entry_id IN (pg_temp.en(61), pg_temp.en(62), pg_temp.en(63), pg_temp.en(64),
                                    pg_temp.en(65), pg_temp.en(66), pg_temp.en(67)))
     OR (SELECT registration_id FROM public.entries WHERE id = pg_temp.en(67)) IS NOT NULL
     OR (SELECT count(DISTINCT payment_status) || ':' || min(payment_status) FROM public.entries
          WHERE id IN (pg_temp.en(61), pg_temp.en(62))) <> '1:paid' THEN
    RAISE EXCEPTION 'FAIL multi-row statements: ledger rows or entry statuses are wrong';
  END IF;
  RAISE NOTICE 'PASS every attached row of a multi-row statement settles its own money, once';
END;
$$;

-- --- who and what gets a form (review round 1) ----------------------------------
-- The confirmation-number sequence, before a refused insert.
CREATE TEMP TABLE t1930_seq (last_value bigint, is_called boolean) ON COMMIT DROP;
INSERT INTO t1930_seq
SELECT last_value, is_called FROM public.registration_confirmation_seq;

-- A waitlist offer the secretary makes by hand: 'pending-payment', paid by card later.
INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
VALUES (pg_temp.e(12), '00000000-0000-0000-0000-000001930b12')
ON CONFLICT DO NOTHING;  -- a sign-up that links an existing person may already have made it
INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, status, joined_via)
SELECT '00000000-0000-0000-0000-000001930912', '00000000-0000-0000-0000-000001930c32', ep.id,
       pg_temp.d(12), 1, 'waiting', 'online'
  FROM public.exhibitor_profiles ep WHERE ep.person_id = pg_temp.e(12);
CREATE TEMP TABLE t1930_offer (entry_id uuid) ON COMMIT DROP;
GRANT ALL ON t1930_offer TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001930b02","role":"authenticated","app_metadata":{}}', true);
INSERT INTO t1930_offer
SELECT public.promote_waitlist_entry('00000000-0000-0000-0000-000001930912');

-- Paid with no method at all (entries_payment_method_check allows no method outside its list,
-- so "none" is the only shape besides the named ones): nothing is recorded, the form owes.
SELECT pg_temp.desk_insert(13, 13, '31', 'paid', NULL, 30);
SELECT pg_temp.desk_insert(14, 14, '31', 'paid', NULL, 30);

-- submit_show_entries with no form (an official calling the RPC directly): desk entries, so
-- they get the exhibitor's form, and the AFTER trigger records the secretary_paid money once
-- (submit_show_entries records none without a form).
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001930c11', NULL,
  jsonb_build_array(jsonb_build_object('dog_id', pg_temp.d(17),
    'class_id', '00000000-0000-0000-0000-000001930c31',
    'handler_name', 'MYK9-1930 Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001930c77', 'cash');
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001930c11', NULL,
  jsonb_build_array(jsonb_build_object('dog_id', pg_temp.d(18),
    'class_id', '00000000-0000-0000-0000-000001930c31',
    'handler_name', 'MYK9-1930 Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001930c78', 'secretary_paid');

-- The club admin (no secretary role) keys a cash entry as paid.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b03', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001930b03","role":"authenticated","app_metadata":{}}', true);
SELECT pg_temp.desk_insert(15, 15, '31', 'paid', 'cash', 30, NULL, 'R-1930-CA');

-- A signed-in person who cannot manage the show gets the RLS refusal, and nothing else.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b04', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001930b04","role":"authenticated","app_metadata":{}}', true);
DO $$
BEGIN
  PERFORM pg_temp.desk_insert(16, 16, '31', 'pending', 'cash', 30);
  RAISE EXCEPTION 'FAIL a person who cannot manage the show inserted an entry';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS a person who cannot manage the show gets the RLS refusal';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_offer uuid := (SELECT entry_id FROM t1930_offer);
BEGIN
  IF v_offer IS NULL
     OR (SELECT registration_id FROM public.entries WHERE id = v_offer) IS NOT NULL
     OR (SELECT entry_status FROM public.entries WHERE id = v_offer) IS DISTINCT FROM 'pending-payment'
     OR pg_temp.form1930(12) <> 'none' THEN
    RAISE EXCEPTION 'FAIL a manual waitlist offer got a form: entry %, form [%]',
      v_offer, pg_temp.form1930(12);
  END IF;
  RAISE NOTICE 'PASS a manual waitlist offer (awaiting card payment) stays formless';

  IF pg_temp.form1930(13) IS DISTINCT FROM
       'status=pending total=3000 paid=0.00 refund=0.00 method=null payments=none'
     OR pg_temp.form1930(14) IS DISTINCT FROM
       'status=pending total=3000 paid=0.00 refund=0.00 method=null payments=none' THEN
    RAISE EXCEPTION 'FAIL a paid entry with another or no method invented money: [%] [%]',
      pg_temp.form1930(13), pg_temp.form1930(14);
  END IF;
  RAISE NOTICE 'PASS paid with another or no method: nothing recorded, the form owes';

  IF pg_temp.form1930(17) IS DISTINCT FROM
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'
     OR pg_temp.form1930(18) IS DISTINCT FROM
       'status=paid total=3000 paid=30.00 refund=0.00 method=secretary_paid payments=none'
     OR (SELECT count(*) FROM public.entries
          WHERE dog_id IN (pg_temp.d(17), pg_temp.d(18)) AND registration_id IS NULL) <> 0 THEN
    RAISE EXCEPTION 'FAIL submit_show_entries with no form: [%] [%]',
      pg_temp.form1930(17), pg_temp.form1930(18);
  END IF;
  RAISE NOTICE 'PASS submit_show_entries with no form: desk entries get a form, money once';

  -- The club admin's paid cash entry: on its form, which owes; no money anywhere.
  IF pg_temp.form1930(15) IS DISTINCT FROM
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'
     OR NOT pg_temp.on_own_form(15, 15)
     OR EXISTS (SELECT 1 FROM public.show_payments sp
                 WHERE sp.entry_id = pg_temp.en(15) OR sp.client_payment_id = pg_temp.en(15)) THEN
    RAISE EXCEPTION 'FAIL the club admin''s paid entry: [%]', pg_temp.form1930(15);
  END IF;
  RAISE NOTICE 'PASS a caller who may not record money: the form owes the fee, no money invented';
END;
$$;

-- The sequence: every number taken since the snapshot belongs to a form that exists (e13,
-- e14, e15, e17, e18 are new forms; the refused insert took none).
DO $$
DECLARE
  v_taken bigint;
  v_forms bigint;
BEGIN
  SELECT (SELECT last_value FROM public.registration_confirmation_seq)
         - (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM t1930_seq)
    INTO v_taken;
  SELECT count(*) INTO v_forms FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000001930c11'
     AND handler_id IN (pg_temp.e(13), pg_temp.e(14), pg_temp.e(15), pg_temp.e(17), pg_temp.e(18));
  IF v_taken <> v_forms OR v_forms <> 5 THEN
    RAISE EXCEPTION 'FAIL confirmation numbers taken % for % new forms (want 5 and 5)', v_taken, v_forms;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entries WHERE id = pg_temp.en(16)) OR pg_temp.form1930(16) <> 'none' THEN
    RAISE EXCEPTION 'FAIL the refused insert left an entry or a form';
  END IF;
  RAISE NOTICE 'PASS the refused insert took no confirmation number and left nothing';
END;
$$;

-- Someone who may record money resolves the club admin's entry with the form's own control.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);
SELECT public.record_enrollment_payment(
  (SELECT registration_id FROM public.entries WHERE id = pg_temp.en(15)),
  'payment', NULL, 'cash', NULL, NULL, NULL);
RESET ROLE;
DO $$
BEGIN
  IF pg_temp.form1930(15) IS DISTINCT FROM
       'status=paid_by_cash total=3000 paid=30.00 refund=0.00 method=cash payments=30.00' THEN
    RAISE EXCEPTION 'FAIL Paid in Full: Cash on the club admin''s form: [%]', pg_temp.form1930(15);
  END IF;
  RAISE NOTICE 'PASS a later Paid in Full: Cash on the form records it, once';
END;
$$;

-- A form, once given, is kept against a client's NULL (a full-row upload from a device that
-- never pulled it); owner-run code and service_role may still change it; a move from one form
-- to another is untouched.
-- Every read of registration_id below is the owner's (RESET ROLE), never the caller's.
CREATE TEMP TABLE t1930_keep (step text, form uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.keep1930(p_step text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t1930_keep SELECT p_step, registration_id FROM public.entries WHERE id = pg_temp.en(1) $$;
CREATE FUNCTION pg_temp.start1930() RETURNS uuid LANGUAGE sql AS $$
  SELECT form FROM t1930_keep WHERE step = 'start' $$;
SELECT pg_temp.keep1930('start');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001930b02', true);
UPDATE public.entries SET registration_id = NULL, payment_notes = 'full-row upload'
 WHERE id = pg_temp.en(1);
RESET ROLE;
SELECT pg_temp.keep1930('client null');

SET LOCAL ROLE authenticated;
UPDATE public.entries SET registration_id = '00000000-0000-0000-0000-000001930f02'
 WHERE id = pg_temp.en(1);
RESET ROLE;
SELECT pg_temp.keep1930('client move');
UPDATE public.entries SET registration_id = pg_temp.start1930() WHERE id = pg_temp.en(1);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.entries SET registration_id = NULL WHERE id = pg_temp.en(1);
RESET ROLE;
SELECT pg_temp.keep1930('service null');
UPDATE public.entries SET registration_id = pg_temp.start1930() WHERE id = pg_temp.en(1);

UPDATE public.entries SET registration_id = NULL WHERE id = pg_temp.en(1);
SELECT pg_temp.keep1930('owner null');
UPDATE public.entries SET registration_id = pg_temp.start1930() WHERE id = pg_temp.en(1);

DO $$
DECLARE
  v_start uuid := (SELECT form FROM t1930_keep WHERE step = 'start');
BEGIN
  IF v_start IS NULL
     OR (SELECT form FROM t1930_keep WHERE step = 'client null') IS DISTINCT FROM v_start
     OR (SELECT form FROM t1930_keep WHERE step = 'client move')
          IS DISTINCT FROM '00000000-0000-0000-0000-000001930f02'
     OR (SELECT form FROM t1930_keep WHERE step = 'service null') IS NOT NULL
     OR (SELECT form FROM t1930_keep WHERE step = 'owner null') IS NOT NULL
     OR NOT pg_temp.on_own_form(1, 1)
     OR pg_temp.form1930(1) IS DISTINCT FROM
          'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'
     OR (SELECT payment_notes FROM public.entries WHERE id = pg_temp.en(1))
          IS DISTINCT FROM 'full-row upload' THEN
    RAISE EXCEPTION 'FAIL keeping the form: %',
      (SELECT string_agg(step || '=' || COALESCE(form::text, 'null'), ', ') FROM t1930_keep);
  END IF;
  RAISE NOTICE 'PASS a client NULL keeps the form (the rest of the row lands); a move, service_role and owner-run code still change it';
END;
$$;

-- --- the backfill, replayed on legacy formless fixtures -----------------------
-- Written as the seed / an old client did: postgres, no person, so nothing is attached on
-- INSERT. Ledger rows for legacy desk money are written the way the old entry trigger did.
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.desk_insert(21, 21, '31', 'pending', 'cash', 30);          -- B1 pending
SELECT pg_temp.desk_insert(22, 22, '31', 'paid', 'cash', 30);             -- B2 paid, ledger row
SELECT pg_temp.desk_insert(23, 23, '31', 'paid', NULL, 30);               -- B3 paid, no method
SELECT pg_temp.desk_insert(24, 24, '31', 'refunded', 'cash', 30);         -- B4 refunded, ledger row
SELECT pg_temp.desk_insert(25, 25, '31', 'refunded', 'check', 30);        -- B5 refunded, nothing
SELECT pg_temp.desk_insert(26, 26, '31', 'paid', 'cash', 30);             -- B6 paid, ledger row ...
SELECT pg_temp.desk_insert(27, 26, '32', 'pending', 'cash', 30);          -- ... and one owing
SELECT pg_temp.desk_insert(29, 27, '32', 'pending', 'cash', 30);          -- B7 joins a paid form
SELECT pg_temp.desk_insert(30, 28, '31', 'pending', 'cash', 30);          -- B8 soft-deleted
UPDATE public.entries SET deleted_at = now() WHERE id = pg_temp.en(30);
-- B9 a seed fixture id (the show-day fixture range the reseed deletes)
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('dededede-0000-0000-0731-000000001930', '00000000-0000-0000-0000-000001930c11',
        '00000000-0000-0000-0000-000001930c21', '00000000-0000-0000-0000-000001930c31',
        pg_temp.d(29), pg_temp.e(29), 'confirmed', 'pending', 'cash', 30);
-- B10 a legacy card entry
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, entry_status,
                            payment_status, payment_method, entry_fee, stripe_payment_intent_id)
VALUES (pg_temp.en(28), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
        '00000000-0000-0000-0000-000001930c31', pg_temp.d(30), pg_temp.e(30), 'paid', 'paid', 'online',
        30, 'pi_myk9_1930_legacy');
-- B11 $30 received at the desk, $10 handed back (refund_amount is the payment service's
-- column, so the fixture writes it as service_role). B12 the same, all $30 back. B13 a $10
-- refund recorded with no desk money on the ledger at all.
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, entry_status,
                            payment_status, payment_method, entry_fee, refund_amount)
VALUES
  (pg_temp.en(51), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(31), pg_temp.e(31), 'confirmed', 'refunded',
   'cash', 30, 10),
  (pg_temp.en(52), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(32), pg_temp.e(32), 'confirmed', 'refunded',
   'cash', 30, 30),
  (pg_temp.en(53), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
   '00000000-0000-0000-0000-000001930c31', pg_temp.d(33), pg_temp.e(33), 'confirmed', 'refunded',
   'check', 30, 10);
RESET ROLE;

INSERT INTO public.show_payments (show_id, entry_id, kind, amount, method, received_on, note)
SELECT '00000000-0000-0000-0000-000001930c11', pg_temp.en(n), 'payment', 30, 'cash',
       (now() AT TIME ZONE 'UTC')::date - 5, 'MYK9-1930 legacy desk row'
  FROM unnest(ARRAY[22, 24, 26, 51, 52]) AS n;

-- B7: an existing form paid by check, its entry on it; the legacy owing entry joins it.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, paid_amount)
VALUES ('00000000-0000-0000-0000-000001930f27', '00000000-0000-0000-0000-000001930c11',
        pg_temp.e(27), 'paid_by_check', 'check', 30);
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, handler_id, entry_status,
                            payment_status, payment_method, entry_fee, registration_id)
VALUES (pg_temp.en(31), '00000000-0000-0000-0000-000001930c11', '00000000-0000-0000-0000-000001930c21',
        '00000000-0000-0000-0000-000001930c31', pg_temp.d(27), pg_temp.e(27), 'confirmed', 'paid',
        'check', 30, '00000000-0000-0000-0000-000001930f27');

CREATE TEMP TABLE t1930_ledger (k text) ON COMMIT DROP;
INSERT INTO t1930_ledger
SELECT count(*) || ':' || COALESCE(sum(amount), 0) || ':'
       || COALESCE((SELECT string_agg(g, '|' ORDER BY g)
                      FROM (SELECT show_id || '/' || received_on || '/' || method || '/' || sum(amount) AS g
                              FROM public.show_payments GROUP BY show_id, received_on, method) x), '')
  FROM public.show_payments;

DO $$
DECLARE
  v_attached integer;
  v_case record;
  v_ledger text;
BEGIN
  IF pg_temp.form1930(27) IS DISTINCT FROM
       'status=paid_by_check total=3000 paid=30.00 refund=0.00 method=check payments=none' THEN
    RAISE EXCEPTION 'FAIL B7 setup: [%]', pg_temp.form1930(27);
  END IF;

  -- B1-B3, B5, B6 (two), B7, B11 and B12 are 9 entries, and the seed-session entry from the
  -- live section (dog 9) is a legacy formless entry too. At least those 10: an earlier test
  -- that committed a formless entry would add to the count, not take from it. B4 and B13 are
  -- left out (their refunded amount is not recorded).
  v_attached := private.backfill_entry_forms();
  IF v_attached < 10 THEN
    RAISE EXCEPTION 'FAIL the backfill attached % entries, want at least 10', v_attached;
  END IF;

  FOR v_case IN
    SELECT * FROM (VALUES
      (9, 'the seed session''s formless entry is a legacy entry: the backfill gives it a form',
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'),
      (21, 'B1 pending: a new form that owes its fee',
       'status=pending total=3000 paid=0.00 refund=0.00 method=cash payments=none'),
      (22, 'B2 paid with a desk row: the row moves to the form, form paid',
       'status=paid total=3000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (23, 'B3 paid with no method: paid on the form, no ledger row',
       'status=paid total=3000 paid=30.00 refund=0.00 method=null payments=none'),
      (24, 'B4 refunded with a desk row and no recorded refund amount: left formless', 'none'),
      (25, 'B5 refunded with no row: owes and holds nothing',
       'status=refunded total=0 paid=0.00 refund=0.00 method=check payments=none'),
      (26, 'B6 one paid, one owing: the form owes only the owing fee',
       'status=pending total=6000 paid=30.00 refund=0.00 method=cash payments=30.00'),
      (27, 'B7 joins a paid form, which reopens to owing',
       'status=pending total=6000 paid=30.00 refund=0.00 method=check payments=none'),
      (28, 'B8 soft-deleted: untouched', 'none'),
      (29, 'B9 seed fixture id: untouched', 'none'),
      (30, 'B10 card entry: untouched', 'none'),
      (31, 'B11 $30 in, $10 back: the form holds the $20 still held',
       'status=partial_refund total=0 paid=30.00 refund=10.00 method=cash payments=30.00'),
      (32, 'B12 $30 in, $30 back: the form nets to zero',
       'status=refunded total=0 paid=30.00 refund=30.00 method=cash payments=30.00'),
      (33, 'B13 a partial refund with no desk money on the ledger: left formless', 'none')
    ) AS t(n, label, want)
  LOOP
    IF pg_temp.form1930(v_case.n) IS DISTINCT FROM v_case.want THEN
      RAISE EXCEPTION 'FAIL %: got [%], want [%]', v_case.label, pg_temp.form1930(v_case.n), v_case.want;
    END IF;
    RAISE NOTICE 'PASS %', v_case.label;
  END LOOP;

  -- B6: the owing entry was not settled with its sibling's money.
  IF (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(27)) IS DISTINCT FROM 'pending'
     OR (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(26)) IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'FAIL B6 entry statuses: paid one %, owing one %',
      (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(26)),
      (SELECT payment_status FROM public.entries WHERE id = pg_temp.en(27));
  END IF;
  RAISE NOTICE 'PASS B6 the owing entry stays owing, the paid one paid';

  IF EXISTS (SELECT 1 FROM public.entries
              WHERE id IN (pg_temp.en(28), pg_temp.en(30), 'dededede-0000-0000-0731-000000001930')
                AND registration_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL the backfill attached a soft-deleted, card or seed-fixture entry';
  END IF;
  IF (SELECT registration_id FROM public.entries
       WHERE id = (SELECT entry_id FROM t1930_offer)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the backfill gave the waitlist offer (awaiting card payment) a form';
  END IF;

  -- The ledger: same rows, same totals, same totals per show, day and method; the moved rows
  -- are form-parented, keep their day, and no attached entry keeps an entry-parented row.
  SELECT count(*) || ':' || COALESCE(sum(amount), 0) || ':'
         || COALESCE((SELECT string_agg(g, '|' ORDER BY g)
                        FROM (SELECT show_id || '/' || received_on || '/' || method || '/' || sum(amount) AS g
                                FROM public.show_payments GROUP BY show_id, received_on, method) x), '')
    INTO v_ledger FROM public.show_payments;
  IF v_ledger IS DISTINCT FROM (SELECT k FROM t1930_ledger) THEN
    RAISE EXCEPTION 'FAIL the ledger moved: before [%], after [%]', (SELECT k FROM t1930_ledger), v_ledger;
  END IF;
  IF (SELECT count(*) FROM public.show_payments
       WHERE note = 'MYK9-1930 legacy desk row' AND entry_id IS NULL AND enrollment_id IS NOT NULL
         AND received_on = (now() AT TIME ZONE 'UTC')::date - 5) <> 4
     OR NOT EXISTS (SELECT 1 FROM public.show_payments
                     WHERE note = 'MYK9-1930 legacy desk row' AND entry_id = pg_temp.en(24)) THEN
    RAISE EXCEPTION 'FAIL the legacy desk rows were not moved onto their forms intact';
  END IF;
  -- The left-out entries are formless and named by the exclusion rule.
  IF EXISTS (SELECT 1 FROM public.entries
              WHERE id IN (pg_temp.en(24), pg_temp.en(53)) AND registration_id IS NOT NULL)
     OR NOT private.entry_form_backfill_refund_unknown(pg_temp.en(24))
     OR NOT private.entry_form_backfill_refund_unknown(pg_temp.en(53))
     OR private.entry_form_backfill_refund_unknown(pg_temp.en(25)) THEN
    RAISE EXCEPTION 'FAIL the refund-unknown entries were attached or not named';
  END IF;
  RAISE NOTICE 'PASS refunded entries with no recorded refunded amount are left formless';
  RAISE NOTICE 'PASS the ledger is unchanged; legacy desk rows moved onto their forms intact';

  IF private.backfill_entry_forms() <> 0 THEN
    RAISE EXCEPTION 'FAIL a second backfill run attached more entries';
  END IF;
  RAISE NOTICE 'PASS a second backfill run finds nothing to do';
END;
$$;

ROLLBACK;
