-- Behavioral test for 20260925004700_myk9_705_656_class_entry_availability.sql.
--
-- MYK9-705: an exhibitor's class availability must count every entry in the
-- class, not the rows their own RLS returns. MYK9-656: a recovered cart's lines
-- in a class self-service can no longer buy are dropped atomically, with the
-- reason, and nothing else is touched.
--
-- Fixture values are the real ones: classes_status_check's 'completed' and
-- 'cancelled', and a max_entries = 1 / allow_waitlist = false class filled by
-- one entry (the live "Handler Discrimination Advanced" shape).
--
-- Why each case earns its place:
--   1. The RLS proof: Ann reads 0 entries in the full class directly, so any
--      count of 1 below came from the server rule, not her own rows.
--   2. A class full of Otto's entries reads full for Ann and blocks self-service.
--   3. The same fullness in a wait-list class does NOT block: checkout routes it
--      to the list. Without this, "full" could be blocking everything.
--   4. Judge-day fullness, from get_judge_day_capacity_live, blocks too.
--   5. completed -> finished, cancelled -> cancelled, a dog in the ring on an
--      'upcoming' class -> started; an open class is the positive control.
--   6. A draft show returns no rows to an exhibitor; its manager is not tested
--      here (the visibility arms are the reused policy helpers).
--   7. Grants: anon cannot call the wizard read; authenticated cannot call the
--      unscoped rule.
--   8. While the cart still links a Checkout Session nothing is dropped (a
--      Stripe page may still take payment). Once the link is cleared, reconcile
--      drops exactly the blocked lines and keeps the wait-list line, the open
--      line and the Finish Payment line (entry_id set) in a closed class.
--   9. A second reconcile drops nothing; another exhibitor is refused 42501; a
--      submitted cart is left alone.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000705010', 'MYK9-705 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES
  ('00000000-0000-0000-0000-000000705100', 'MYK9-705 Capacity Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000705010', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30, 125),
  ('00000000-0000-0000-0000-000000705101', 'MYK9-705 Draft Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000705010', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  ('00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705100',
   'MYK9-705 Saturday Trial', current_date + 5, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000705201', '00000000-0000-0000-0000-000000705101',
   'MYK9-705 Draft Trial', current_date + 5, 'AKC', 'Scent Work');

-- status_source = 'manual' so the auto-derivation trigger cannot rewrite these
-- when the fixture entries below land.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source,
                            entry_fee, max_entries, allow_waitlist)
VALUES
  ('00000000-0000-0000-0000-000000705301', '00000000-0000-0000-0000-000000705200',
   'Handler Discrimination Advanced', 'Handler Discrimination', 'Advanced', 'upcoming', 'manual', 30, 1, false),
  ('00000000-0000-0000-0000-000000705302', '00000000-0000-0000-0000-000000705200',
   'Interior Advanced', 'Interior', 'Advanced', 'upcoming', 'manual', 30, 1, true),
  ('00000000-0000-0000-0000-000000705303', '00000000-0000-0000-0000-000000705200',
   'Container Novice A', 'Container', 'Novice', 'completed', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000705304', '00000000-0000-0000-0000-000000705200',
   'Exterior Master', 'Exterior', 'Master', 'cancelled', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000705305', '00000000-0000-0000-0000-000000705200',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000705306', '00000000-0000-0000-0000-000000705200',
   'Vehicle Novice', 'Vehicle', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000705307', '00000000-0000-0000-0000-000000705200',
   'Buried Novice', 'Buried', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000705308', '00000000-0000-0000-0000-000000705201',
   'Draft Interior Novice', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000705001', 'Ann', 'Exhibitor', 'myk9-705-ann@example.test'),
  ('00000000-0000-0000-0000-000000705002', 'Otto', 'Other', 'myk9-705-otto@example.test'),
  ('00000000-0000-0000-0000-000000705003', 'Jude', 'Judge', 'myk9-705-jude@example.test');

-- People first, so handle_new_user adopts each one by email and creates the
-- exhibitor_profiles row itself.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000705101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-705-ann@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000705102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-705-otto@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.exhibitor_profiles
      WHERE auth_user_id IN ('00000000-0000-0000-0000-000000705101',
                             '00000000-0000-0000-0000-000000705102')) <> 2 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not create both exhibitor profiles';
  END IF;
END;
$$;

-- Jude judges Buried Novice with a one-dog day, so one entry fills the day.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status,
                                      day_capacity_override)
VALUES ('00000000-0000-0000-0000-000000705003', '00000000-0000-0000-0000-000000705100',
        '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705307',
        'confirmed', 1);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000705401', 'MYK9-705 Ann Dog', 'Annie', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000705001'),
  ('00000000-0000-0000-0000-000000705402', 'MYK9-705 Otto Dog One', 'Oone', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000705002'),
  ('00000000-0000-0000-0000-000000705403', 'MYK9-705 Otto Dog Two', 'Otwo', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000705002'),
  ('00000000-0000-0000-0000-000000705404', 'MYK9-705 Ann Dog Two', 'Bea', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000705001');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000705401', 'AKC', 'SR70500001', true),
  ('00000000-0000-0000-0000-000000705402', 'AKC', 'SR70500002', true),
  ('00000000-0000-0000-0000-000000705403', 'AKC', 'SR70500003', true),
  ('00000000-0000-0000-0000-000000705404', 'AKC', 'SR70500004', true);

-- Otto's entries fill the two limited classes and the judge's day; one of his
-- dogs is in the ring in an 'upcoming' class. Ann has one real entry, in the
-- completed class, which her Finish Payment line below settles.
INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, entry_status, is_in_ring)
VALUES
  ('00000000-0000-0000-0000-000000705501', '00000000-0000-0000-0000-000000705100',
   '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705301',
   '00000000-0000-0000-0000-000000705402', 'confirmed', false),
  ('00000000-0000-0000-0000-000000705502', '00000000-0000-0000-0000-000000705100',
   '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705302',
   '00000000-0000-0000-0000-000000705402', 'paid', false),
  ('00000000-0000-0000-0000-000000705503', '00000000-0000-0000-0000-000000705100',
   '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705307',
   '00000000-0000-0000-0000-000000705403', 'submitted', false),
  ('00000000-0000-0000-0000-000000705504', '00000000-0000-0000-0000-000000705100',
   '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705306',
   '00000000-0000-0000-0000-000000705403', 'checked-in', true),
  ('00000000-0000-0000-0000-000000705505', '00000000-0000-0000-0000-000000705100',
   '00000000-0000-0000-0000-000000705200', '00000000-0000-0000-0000-000000705303',
   '00000000-0000-0000-0000-000000705401', 'pending-payment', false);

-- Inserting Ann's entry re-derives Container Novice A's status (and flips it to
-- status_source 'derived'), so the finished state is set after the entries.
UPDATE public.classes
SET status = 'completed', status_source = 'manual'
WHERE id = '00000000-0000-0000-0000-000000705303';

DO $$
BEGIN
  IF (SELECT status FROM public.classes
      WHERE id = '00000000-0000-0000-0000-000000705303') <> 'completed' THEN
    RAISE EXCEPTION 'FIXTURE Container Novice A is not completed';
  END IF;
END;
$$;

-- Ann's recovered cart: one line per class, plus a Finish Payment line and a
-- NEW line in that same finished class, so "leave Finish Payment lines alone"
-- is tested per line, not per class.
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT '00000000-0000-0000-0000-000000705600', ep.id, '00000000-0000-0000-0000-000000705100',
       'expired', now() - interval '90 days'
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000705101';

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents, entry_id)
VALUES
  ('00000000-0000-0000-0000-000000705701', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705301', 3000, NULL),
  ('00000000-0000-0000-0000-000000705702', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705302', 3000, NULL),
  ('00000000-0000-0000-0000-000000705703', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705304', 3000, NULL),
  ('00000000-0000-0000-0000-000000705704', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705305', 3000, NULL),
  ('00000000-0000-0000-0000-000000705705', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705307', 3000, NULL),
  ('00000000-0000-0000-0000-000000705706', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705306', 3000, NULL),
  ('00000000-0000-0000-0000-000000705707', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705303', 3000,
   '00000000-0000-0000-0000-000000705505'),
  ('00000000-0000-0000-0000-000000705708', '00000000-0000-0000-0000-000000705600',
   '00000000-0000-0000-0000-000000705404', '00000000-0000-0000-0000-000000705303', 3000, NULL);

-- The session id goes on AFTER the lines: every line insert severs it
-- (trg_cart_item_insert_sever_session), and only the checkout service may set
-- one (trg_entry_carts_protect_session_id).
SET LOCAL ROLE service_role;
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_myk9_705'
WHERE id = '00000000-0000-0000-0000-000000705600';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT stripe_checkout_session_id FROM public.entry_carts
      WHERE id = '00000000-0000-0000-0000-000000705600') IS DISTINCT FROM 'cs_test_myk9_705' THEN
    RAISE EXCEPTION 'FIXTURE the cart has no checkout session, so the linked-session case below proves nothing';
  END IF;
END;
$$;

-- A submitted cart that also holds a closed-class line.
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status)
SELECT '00000000-0000-0000-0000-000000705601', ep.id, '00000000-0000-0000-0000-000000705100',
       'submitted'
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000705101';

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES ('00000000-0000-0000-0000-000000705711', '00000000-0000-0000-0000-000000705601',
        '00000000-0000-0000-0000-000000705401', '00000000-0000-0000-0000-000000705304', 3000);

-- ============================================================================
-- 1-6. The wizard read, as Ann.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000705101', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000705101","role":"authenticated"}', true);

DO $$
DECLARE
  v_visible int;
  r record;
BEGIN
  SELECT count(*) INTO v_visible FROM public.entries
  WHERE class_id = '00000000-0000-0000-0000-000000705301';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FIXTURE Ann reads % of Otto''s entries directly; the RLS premise is gone', v_visible;
  END IF;
  RAISE NOTICE 'PASS Ann''s own RLS returns 0 entries in the full class';

  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705301';
  IF r.entry_count <> 1 OR NOT r.class_full OR r.self_service_block IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'FAIL full class read as count %, full %, block %',
      r.entry_count, r.class_full, r.self_service_block;
  END IF;
  RAISE NOTICE 'PASS a class full of another exhibitor''s entries reads full and blocks';

  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705302';
  IF NOT r.class_full OR r.self_service_block IS NOT NULL OR NOT r.allow_waitlist THEN
    RAISE EXCEPTION 'FAIL full wait-list class read as full %, block %', r.class_full, r.self_service_block;
  END IF;
  RAISE NOTICE 'PASS a full class that takes a wait list is full but not blocked';

  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705307';
  IF NOT r.judge_day_full OR r.judge_day_available <> 0
     OR r.judge_id IS DISTINCT FROM '00000000-0000-0000-0000-000000705003'::uuid
     OR r.class_full OR r.self_service_block IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'FAIL judge-day class read as day full %, available %, judge %, block %',
      r.judge_day_full, r.judge_day_available, r.judge_id, r.self_service_block;
  END IF;
  RAISE NOTICE 'PASS a full judge day blocks self-service';

  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705303';
  IF r.self_service_block IS DISTINCT FROM 'finished' THEN
    RAISE EXCEPTION 'FAIL completed class block is %', r.self_service_block;
  END IF;
  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705304';
  IF r.self_service_block IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'FAIL cancelled class block is %', r.self_service_block;
  END IF;
  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705306';
  IF NOT r.has_started OR r.self_service_block IS DISTINCT FROM 'started' THEN
    RAISE EXCEPTION 'FAIL in-ring class read as started %, block %', r.has_started, r.self_service_block;
  END IF;
  SELECT * INTO r FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705100')
  WHERE class_id = '00000000-0000-0000-0000-000000705305';
  IF r.entry_count <> 0 OR r.class_full OR r.judge_day_full OR r.has_started
     OR r.self_service_block IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL open control class read as count %, block %', r.entry_count, r.self_service_block;
  END IF;
  RAISE NOTICE 'PASS finished, cancelled and started classes block; the open class does not';

  SELECT count(*) INTO v_visible
  FROM public.get_show_class_availability('00000000-0000-0000-0000-000000705101');
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL an exhibitor read % availability rows for a draft show', v_visible;
  END IF;
  RAISE NOTICE 'PASS a draft show returns no availability to an exhibitor';

  BEGIN
    PERFORM public.class_entry_availability(ARRAY['00000000-0000-0000-0000-000000705301'::uuid]);
    RAISE EXCEPTION 'FAIL authenticated executed the unscoped class_entry_availability';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot call class_entry_availability';
  END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
BEGIN
  PERFORM public.get_show_class_availability('00000000-0000-0000-0000-000000705100');
  RAISE EXCEPTION 'FAIL anon executed get_show_class_availability';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS anon cannot call get_show_class_availability';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 8-9. Reconcile.
-- ============================================================================

SET LOCAL ROLE authenticated;

-- Otto first: someone else's cart is refused and nothing moves.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000705102', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000705102","role":"authenticated"}', true);

DO $$
BEGIN
  PERFORM public.reconcile_cart_closed_classes('00000000-0000-0000-0000-000000705600');
  RAISE EXCEPTION 'FAIL another exhibitor reconciled Ann''s cart';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS another exhibitor is refused 42501';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000705101', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000705101","role":"authenticated"}', true);

-- While the cart still links a Checkout Session, a Stripe page may still take
-- payment, so nothing is deleted (Codex P1 on PR #2438).
DO $$
DECLARE
  v_dropped int;
  v_lines int;
BEGIN
  SELECT count(*) INTO v_dropped
  FROM public.reconcile_cart_closed_classes('00000000-0000-0000-0000-000000705600');
  SELECT count(*) INTO v_lines
  FROM public.entry_cart_items WHERE cart_id = '00000000-0000-0000-0000-000000705600';
  IF v_dropped <> 0 OR v_lines <> 8 THEN
    RAISE EXCEPTION 'FAIL a session-linked cart was reconciled: % dropped, % lines left',
      v_dropped, v_lines;
  END IF;
  RAISE NOTICE 'PASS a cart still linked to a Checkout Session is left alone';
END;
$$;

-- stripe-checkout's class gate retires the session and clears the link.
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.entry_carts SET stripe_checkout_session_id = NULL
WHERE id = '00000000-0000-0000-0000-000000705600';
RESET ROLE;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_dropped text;
  v_kept text;
  v_again int;
BEGIN
  SELECT string_agg(r.item_id::text || '=' || r.reason, ',' ORDER BY r.item_id)
  INTO v_dropped
  FROM public.reconcile_cart_closed_classes('00000000-0000-0000-0000-000000705600') r;

  IF v_dropped IS DISTINCT FROM
     '00000000-0000-0000-0000-000000705701=full,'
     '00000000-0000-0000-0000-000000705703=cancelled,'
     '00000000-0000-0000-0000-000000705705=full,'
     '00000000-0000-0000-0000-000000705706=started,'
     '00000000-0000-0000-0000-000000705708=finished' THEN
    RAISE EXCEPTION 'FAIL reconcile dropped %', v_dropped;
  END IF;
  RAISE NOTICE 'PASS reconcile drops exactly the blocked lines, each with its reason';

  SELECT string_agg(id::text, ',' ORDER BY id) INTO v_kept
  FROM public.entry_cart_items WHERE cart_id = '00000000-0000-0000-0000-000000705600';
  IF v_kept IS DISTINCT FROM
     '00000000-0000-0000-0000-000000705702,'
     '00000000-0000-0000-0000-000000705704,'
     '00000000-0000-0000-0000-000000705707' THEN
    RAISE EXCEPTION 'FAIL reconcile left lines %', v_kept;
  END IF;
  RAISE NOTICE 'PASS the wait-list, open and Finish Payment lines stay';

  SELECT count(*) INTO v_again
  FROM public.reconcile_cart_closed_classes('00000000-0000-0000-0000-000000705600');
  IF v_again <> 0 THEN
    RAISE EXCEPTION 'FAIL a second reconcile dropped % more lines', v_again;
  END IF;

  SELECT count(*) INTO v_again
  FROM public.reconcile_cart_closed_classes('00000000-0000-0000-0000-000000705601');
  IF v_again <> 0 OR NOT EXISTS (
    SELECT 1 FROM public.entry_cart_items WHERE id = '00000000-0000-0000-0000-000000705711'
  ) THEN
    RAISE EXCEPTION 'FAIL a submitted cart was reconciled';
  END IF;
  RAISE NOTICE 'PASS reconcile is idempotent and leaves a submitted cart alone';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 10. A paid line for a class that closed after checkout is refused, not
--     entered (Codex P1 on PR #2438). The webhook calls this as service_role;
--     'denied' is the outcome it already routes to the no-service refund, the
--     same as a full class with no wait list.
-- ============================================================================

SET LOCAL ROLE service_role;

DO $$
DECLARE
  show_id CONSTANT uuid := '00000000-0000-0000-0000-000000705100';
  trial_id CONSTANT uuid := '00000000-0000-0000-0000-000000705200';
  dog CONSTANT uuid := '00000000-0000-0000-0000-000000705404';
  exhibitor uuid;
  closed_cls uuid;
  r record;
  v_entries int;
  v_waitlist int;
BEGIN
  SELECT id INTO exhibitor FROM public.exhibitor_profiles
  WHERE auth_user_id = '00000000-0000-0000-0000-000000705101';

  -- Exterior Master (cancelled), Container Novice A (completed), Vehicle
  -- Novice ('upcoming' with a dog in the ring).
  FOREACH closed_cls IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000705304'::uuid,
    '00000000-0000-0000-0000-000000705303'::uuid,
    '00000000-0000-0000-0000-000000705306'::uuid
  ] LOOP
    SELECT * INTO r FROM public.create_online_paid_entry(
      dog, closed_cls, NULL, 30, NULL, NULL, 'pi_test_myk9_656', now(),
      show_id, trial_id, exhibitor);
    IF r.outcome IS DISTINCT FROM 'denied' OR r.entry_id IS NOT NULL
       OR r.waitlist_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL paid line for closed class % returned %', closed_cls, r;
    END IF;

    SELECT count(*) INTO v_entries FROM public.entries
    WHERE class_id = closed_cls AND dog_id = dog;
    SELECT count(*) INTO v_waitlist FROM public.waitlist_entries
    WHERE class_id = closed_cls AND dog_id = dog;
    IF v_entries <> 0 OR v_waitlist <> 0 THEN
      RAISE EXCEPTION 'FAIL closed class % got % entries and % wait-list rows',
        closed_cls, v_entries, v_waitlist;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS a paid line for a cancelled, finished or started class is denied, not entered';

  -- Positive control: the same call into the open class creates the entry.
  SELECT * INTO r FROM public.create_online_paid_entry(
    dog, '00000000-0000-0000-0000-000000705305', NULL, 30, NULL, NULL,
    'pi_test_myk9_656', now(), show_id, trial_id, exhibitor);
  IF r.outcome IS DISTINCT FROM 'created_entry' OR r.entry_id IS NULL THEN
    RAISE EXCEPTION 'FAIL paid line for the open class returned %', r;
  END IF;
  RAISE NOTICE 'PASS the same paid line for an open class is entered';
END;
$$;

RESET ROLE;

ROLLBACK;
