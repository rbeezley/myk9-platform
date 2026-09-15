-- MYK9-527 behavioral contract: the Stripe ledger foreign keys are RESTRICT, so
-- deleting a show, an enrollment or an order that a money row still references
-- fails loudly instead of silently nulling the ledger's scope columns. A show
-- with no orders still deletes. All fixtures roll back.

BEGIN;

-- --- confdeltype assertion --------------------------------------------------
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(con.conname || '=' || con.confdeltype::text, ', ' ORDER BY con.conname)
    INTO v_bad
  FROM pg_constraint con
  WHERE con.conname IN (
          'stripe_orders_show_id_fkey',
          'stripe_orders_enrollment_id_fkey',
          'stripe_order_refunds_order_id_fkey'
        )
    AND con.contype = 'f'
    AND con.confdeltype <> 'r';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL F527.0 ledger FK(s) are not ON DELETE RESTRICT: %', v_bad;
  END IF;

  IF (SELECT count(*) FROM pg_constraint
      WHERE conname IN ('stripe_orders_show_id_fkey',
                        'stripe_orders_enrollment_id_fkey',
                        'stripe_order_refunds_order_id_fkey')
        AND contype = 'f') <> 3 THEN
    RAISE EXCEPTION 'FAIL F527.0 expected all three ledger FKs to exist';
  END IF;

  RAISE NOTICE 'PASS F527.0 all three ledger FKs are ON DELETE RESTRICT';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000527001', 'F527 Club');

-- people BEFORE auth.users (harness ordering contract): the people rows are
-- inserted with a NULL auth_user_id and back-filled once auth.users exists.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000527002', 'F527', 'Handler', 'f527-handler@example.test', NULL),
  ('00000000-0000-0000-0000-000000527009', 'F527', 'Admin', 'f527-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000527109', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'f527-admin@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false
);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000527109'
WHERE id = '00000000-0000-0000-0000-000000527009';

-- is_site_admin() (which is_platform_admin() delegates to) joins user_roles on
-- auth_user_id = auth.uid(), so the row must carry BOTH ids.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000527009'::uuid, roles.id, NULL::uuid, true,
       '00000000-0000-0000-0000-000000527109'::uuid
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status
)
VALUES
  ('00000000-0000-0000-0000-000000527003', 'F527 Show With Order', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000527001', 'draft'),
  ('00000000-0000-0000-0000-000000527004', 'F527 Show Without Orders', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000527001', 'draft'),
  ('00000000-0000-0000-0000-000000527005', 'F527 Show With Enrollment Order', 'AKC',
   DATE '2026-09-01', DATE '2026-09-02', '00000000-0000-0000-0000-000000527001', 'draft');

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000527006',
        '00000000-0000-0000-0000-000000527005',
        '00000000-0000-0000-0000-000000527002');

-- Order scoped by show_id only.
INSERT INTO public.stripe_orders (id, amount_cents, status, show_id)
VALUES ('00000000-0000-0000-0000-000000527007', 5000, 'succeeded',
        '00000000-0000-0000-0000-000000527003');

-- Order scoped by enrollment_id only, on a different show.
INSERT INTO public.stripe_orders (id, amount_cents, status, enrollment_id)
VALUES ('00000000-0000-0000-0000-000000527008', 3000, 'succeeded',
        '00000000-0000-0000-0000-000000527006');

INSERT INTO public.stripe_order_refunds (
  order_id, stripe_refund_id, stripe_payment_intent_id, amount_cents, kind
)
VALUES ('00000000-0000-0000-0000-000000527007',
        're_f527test', 'pi_f527test', 1000, 'post_hoc');

-- --- F527.1 a show with an order cannot be deleted --------------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000000527003';
    RAISE EXCEPTION 'FAIL F527.1 deleting a show with a Stripe order succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS F527.1 deleting a show with a Stripe order is refused';
  END;
END;
$$;

-- --- F527.2 a show with no orders still deletes -----------------------------
DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000000527004';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shows
             WHERE id = '00000000-0000-0000-0000-000000527004') THEN
    RAISE EXCEPTION 'FAIL F527.2 deleting a show with no orders was refused';
  END IF;
  RAISE NOTICE 'PASS F527.2 deleting a show with no orders still works';
END;
$$;

-- --- F527.3 the enrollment cascade route is blocked too ---------------------
-- enrollments.show_id is ON DELETE CASCADE from shows, so deleting the show
-- tries to take the enrollment with it; RESTRICT on stripe_orders.enrollment_id
-- aborts the whole statement even though the order carries no show_id.
DO $$
BEGIN
  BEGIN
    DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000000527005';
    RAISE EXCEPTION 'FAIL F527.3 deleting a show whose enrollment has an order succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS F527.3 the shows -> enrollments cascade into an order is refused';
  END;
END;
$$;

-- --- F527.4 an order with a refund cannot be deleted ------------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM public.stripe_orders WHERE id = '00000000-0000-0000-0000-000000527007';
    RAISE EXCEPTION 'FAIL F527.4 deleting an order with a refund row succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS F527.4 deleting an order with a refund row is refused';
  END;
END;
$$;

-- --- F527.5 an already-orphaned order blocks nothing -------------------------
-- The 22 rows on staging hold NULL in both scope columns, so they reference no
-- parent. RESTRICT must not make them un-deletable-around: a show unrelated to
-- them still deletes (proved by F527.2 above, which ran with them present).
DO $$
DECLARE v_orphans integer;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.stripe_orders
  WHERE show_id IS NULL AND enrollment_id IS NULL;
  RAISE NOTICE 'NOTE F527.5 % fully-orphaned order(s) present; they reference no parent and constrain no delete', v_orphans;
END;
$$;

-- --- F527.6 hard_delete_show refuses readably, not with a raw 23503 ----------
-- The RPC is the site-admin path (DeleteShowDialog). Without its pre-check the
-- admin would see a bare foreign-key violation naming stripe_orders; assert the
-- actionable message instead. Claims are set so is_platform_admin() -> true.
DO $$
DECLARE
  admin_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000527109';
  refused boolean := false;
  err text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_auth_id, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FAIL F527.6 the site_admin fixture is not recognised by is_platform_admin()';
  END IF;

  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000000527003');
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
    refused := true;
  END;

  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL F527.6 hard_delete_show deleted a show that has a Stripe order';
  END IF;

  IF NOT (err LIKE '%Stripe order(s)%' AND err LIKE '%refused%') THEN
    RAISE EXCEPTION 'FAIL F527.6 hard_delete_show refusal is not the readable message: %', err;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shows
                 WHERE id = '00000000-0000-0000-0000-000000527003') THEN
    RAISE EXCEPTION 'FAIL F527.6 the refused show was removed anyway';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'PASS F527.6 hard_delete_show refuses a show with a Stripe order readably: %', err;
END;
$$;

ROLLBACK;
