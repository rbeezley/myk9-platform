-- MYK9-607 + MYK9-608 (migration 20260924104100): what restore_dog does with a
-- stale placement snapshot, which audit row it reads, and what Admin -> Deleted
-- Items can see about a deleted dog.
--
--   1. MYK9-607 item 1. A dog is force-deleted out of a MANUAL class, the
--      secretary re-places the class by hand (the survivor moves 2 -> 1), and
--      the dog is restored. The snapshot's 1st is now held by a live entry, so
--      it must NOT be re-applied (the class would show two firsts), and the
--      restore result must name it. In the SAME restore, a second manual class
--      nobody touched gets its placement back — the skip is per placement, not
--      a blanket "stop re-applying".
--   2. MYK9-607 item 2. Force-delete, restore and force-delete the same dog in
--      ONE transaction: both audit rows carry the same deleted_at (NOW() is
--      transaction-start time). The restore must read the NEWER row.
--   3. MYK9-608. get_deleted_dogs() names the deleter for BOTH delete paths
--      and carries the force-delete audit facts (entries, paid entries, Stripe
--      payment intents) for a force-deleted dog, and nothing for an ordinary
--      soft delete. Each affected entry's money facts (intent, payment_status,
--      entry_fee, refund_amount) come back EXACTLY as recorded — including a
--      full and a PARTIAL in-app refund, which both read payment_status
--      'refunded' — and nothing derives an owed amount.
--      Non-admins get no rows.
--   4. Force-delete, restore, then an ORDINARY soft delete, in one transaction:
--      the second deletion shares the first one's deleted_at. The restored-from
--      audit row is closed, so it neither describes the second deletion in
--      Deleted Items nor feeds its stale placement to the next restore.
--   5. ACLs: anon cannot call any of it, and no API role can call the internal
--      match helper.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000607011', 'Restore', 'Owner', 'myk9-607-owner@example.test'),
  ('00000000-0000-0000-0000-000000607012', 'Restore', 'Admin', 'myk9-607-admin@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000607101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-607-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000607102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-607-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

-- user_id is the PEOPLE id, auth_user_id the auth uid; they are never equal.
INSERT INTO public.user_roles (user_id, auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000607012', '00000000-0000-0000-0000-000000607102', r.id, true
FROM public.roles r
WHERE r.name = 'site_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-000000607021', 'MYK9-607 Show', 'AKC', current_date, current_date, 'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021', 'MYK9-607 Trial', current_date
);

-- Both scored classes are MANUAL and not 'completed' (a completed class flips
-- back to derived on insert, which would make every assertion vacuous).
--   c41: the class the secretary re-places while the dog is deleted.
--   c42: the class nobody touches, so its placement must come back.
--   c43: holds the paid online entry for the MYK9-608 arm.
INSERT INTO public.classes (id, trial_id, name, status, status_source)
VALUES
  ('00000000-0000-0000-0000-000000607041', '00000000-0000-0000-0000-000000607031', 'MYK9-607 Re-placed Class', 'in_progress', 'manual'),
  ('00000000-0000-0000-0000-000000607042', '00000000-0000-0000-0000-000000607031', 'MYK9-607 Untouched Class', 'in_progress', 'manual'),
  ('00000000-0000-0000-0000-000000607043', '00000000-0000-0000-0000-000000607031', 'MYK9-607 Paid Class', 'upcoming', 'derived');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000607051', 'Restored', 'Beagle', '00000000-0000-0000-0000-000000607011'),
  ('00000000-0000-0000-0000-000000607052', 'Survivor', 'Beagle', '00000000-0000-0000-0000-000000607011'),
  ('00000000-0000-0000-0000-000000607053', 'Stranded', 'Beagle', '00000000-0000-0000-0000-000000607011'),
  ('00000000-0000-0000-0000-000000607054', 'Ordinary', 'Beagle', '00000000-0000-0000-0000-000000607011'),
  ('00000000-0000-0000-0000-000000607055', 'Cycled', 'Beagle', '00000000-0000-0000-0000-000000607011');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES
  ('00000000-0000-0000-0000-000000607051', 'AKC', 'SW607101', 'Restored Formally'),
  ('00000000-0000-0000-0000-000000607052', 'AKC', 'SW607102', 'Survivor Formally'),
  ('00000000-0000-0000-0000-000000607053', 'AKC', 'SW607103', 'Stranded Formally'),
  ('00000000-0000-0000-0000-000000607054', 'AKC', 'SW607104', 'Ordinary Formally'),
  ('00000000-0000-0000-0000-000000607055', 'AKC', 'SW607105', 'Cycled Formally');

-- Hand-set placements: d51 is 1st in both manual classes, d52 2nd.
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, entry_status,
  is_scored, result_status, total_faults, search_time_seconds, final_placement
)
VALUES
  ('00000000-0000-0000-0000-000000607081', '00000000-0000-0000-0000-000000607041', '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021', '00000000-0000-0000-0000-000000607051', 'pending', 'confirmed', true, 'qualified', 0, 30, 1),
  ('00000000-0000-0000-0000-000000607082', '00000000-0000-0000-0000-000000607041', '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021', '00000000-0000-0000-0000-000000607052', 'pending', 'confirmed', true, 'qualified', 0, 20, 2),
  ('00000000-0000-0000-0000-000000607083', '00000000-0000-0000-0000-000000607042', '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021', '00000000-0000-0000-0000-000000607051', 'pending', 'confirmed', true, 'qualified', 0, 30, 1),
  ('00000000-0000-0000-0000-000000607084', '00000000-0000-0000-0000-000000607042', '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021', '00000000-0000-0000-0000-000000607052', 'pending', 'confirmed', true, 'qualified', 0, 20, 2);

-- d55: hand-placed 4th in c42 but NOT scored and not paid, so the ORDINARY
-- delete path (MK002) accepts it in section 4.
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, entry_status, final_placement
)
VALUES (
  '00000000-0000-0000-0000-000000607086', '00000000-0000-0000-0000-000000607042',
  '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021',
  '00000000-0000-0000-0000-000000607055', 'pending', 'confirmed', 4
);

-- The paid ONLINE entry. Only service_role may write this shape
-- (trg_entries_protect_payment_fields_insert); the role is dropped at once.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, payment_method,
  stripe_payment_intent_id, entry_fee
)
VALUES (
  '00000000-0000-0000-0000-000000607085', '00000000-0000-0000-0000-000000607043',
  '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021',
  '00000000-0000-0000-0000-000000607053', 'paid', 'online', 'pi_myk9608_stranded', 35.00
);
-- Refunded in myK9 before the override, as the dialog tells the admin to do:
-- 087 in full, 088 only in part. Both read payment_status 'refunded'
-- (buildEntryRefundStamp stamps it for a partial refund too), so only
-- entry_fee and refund_amount tell them apart.
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, payment_method,
  stripe_payment_intent_id, entry_fee, refund_amount
)
VALUES
  (
    '00000000-0000-0000-0000-000000607087', '00000000-0000-0000-0000-000000607041',
    '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021',
    '00000000-0000-0000-0000-000000607053', 'refunded', 'online', 'pi_myk9608_refunded', 35.00, 35.00
  ),
  (
    '00000000-0000-0000-0000-000000607088', '00000000-0000-0000-0000-000000607042',
    '00000000-0000-0000-0000-000000607031', '00000000-0000-0000-0000-000000607021',
    '00000000-0000-0000-0000-000000607053', 'refunded', 'online', 'pi_myk9608_partial', 35.00, 10.00
  );
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-000000607102' AND r.name = 'site_admin'
  ) THEN
    RAISE EXCEPTION 'FIXTURE no site_admin role row — every admin arm would pass vacuously';
  END IF;

  IF (SELECT array_agg(final_placement ORDER BY id) FROM public.entries
      WHERE class_id IN ('00000000-0000-0000-0000-000000607041', '00000000-0000-0000-0000-000000607042')
        AND dog_id IN ('00000000-0000-0000-0000-000000607051', '00000000-0000-0000-0000-000000607052'))
     IS DISTINCT FROM ARRAY[1, 2, 1, 2] THEN
    RAISE EXCEPTION 'FIXTURE the manual classes did not start hand-placed 1/2';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000607085'
      AND payment_status = 'paid' AND stripe_payment_intent_id = 'pi_myk9608_stranded'
  ) THEN
    RAISE EXCEPTION 'FIXTURE the paid online entry was not seeded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000607087'
      AND payment_status = 'refunded' AND stripe_payment_intent_id = 'pi_myk9608_refunded'
      AND refund_amount = 35.00
  ) OR NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000607088'
      AND payment_status = 'refunded' AND stripe_payment_intent_id = 'pi_myk9608_partial'
      AND entry_fee = 35.00 AND refund_amount = 10.00
  ) THEN
    RAISE EXCEPTION 'FIXTURE the fully and partially refunded online entries were not seeded';
  END IF;

  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607086') IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FIXTURE d55 did not start hand-placed 4th';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. MYK9-607 item 1: the stale snapshot is not re-applied over a human's
--    later placement, and the result says so.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

DO $$
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'FIXTURE is_platform_admin() is false for the admin session';
  END IF;
END;
$$;

SELECT public.force_delete_dog('00000000-0000-0000-0000-000000607051');

RESET ROLE;

-- The secretary re-places c41 by hand while the dog is deleted. c42 is left
-- alone. (Written as the test runner: this is the fixture of a human action,
-- not the thing under test.)
UPDATE public.entries SET final_placement = 1
WHERE id = '00000000-0000-0000-0000-000000607082';

DO $$
BEGIN
  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607082') IS DISTINCT FROM 1
     OR (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607081') IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE c41 was not re-placed with the deleted entry unplaced';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

-- Carried across the role switch in a transaction-local setting rather than a
-- temp table, so no role needs TEMP or another role's table. to_jsonb() of the
-- row keeps the red run (old SETOF dogs shape) failing on BEHAVIOUR first.
SELECT set_config(
  'myk9_607.restore_result',
  (SELECT to_jsonb(r)::text FROM public.restore_dog('00000000-0000-0000-0000-000000607051') r),
  true
);

RESET ROLE;

DO $$
DECLARE
  v_result jsonb := current_setting('myk9_607.restore_result')::jsonb;
  v_firsts integer;
BEGIN
  -- Behaviour first, so the red run fails on the defect, not on the shape.
  SELECT count(*) INTO v_firsts
  FROM public.entries
  WHERE class_id = '00000000-0000-0000-0000-000000607041'
    AND deleted_at IS NULL
    AND final_placement = 1;

  IF v_firsts <> 1 THEN
    RAISE EXCEPTION
      'FAIL the re-placed manual class has % live firsts after restore — the stale snapshot was re-applied over the secretary''s placement',
      v_firsts;
  END IF;

  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607082') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL the secretary''s later placement did not survive the restore';
  END IF;

  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607081') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the restored entry in the re-placed class was given a placement';
  END IF;
  RAISE NOTICE 'PASS a snapshot placement a live entry now holds is not re-applied';

  -- The untouched class in the SAME restore still gets its placement back.
  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607083') IS DISTINCT FROM 1
     OR (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607084') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FAIL the untouched manual class did not get its hand-set 1/2 back';
  END IF;
  RAISE NOTICE 'PASS the untouched manual class regained its placement in the same restore';

  IF v_result ->> 'dog_id' IS DISTINCT FROM '00000000-0000-0000-0000-000000607051'
     OR (v_result ->> 'entries_restored')::integer IS DISTINCT FROM 2
     OR (v_result ->> 'placements_reapplied')::integer IS DISTINCT FROM 1
     OR jsonb_array_length(v_result -> 'placements_skipped') IS DISTINCT FROM 1
     OR NOT COALESCE(v_result -> 'placements_skipped' @> jsonb_build_array(jsonb_build_object(
       'entry_id', '00000000-0000-0000-0000-000000607081',
       'class_id', '00000000-0000-0000-0000-000000607041',
       'class_name', 'MYK9-607 Re-placed Class',
       'final_placement', 1
     )), false) THEN
    RAISE EXCEPTION 'FAIL restore_dog did not report the skipped placement: %', v_result;
  END IF;
  RAISE NOTICE 'PASS restore_dog names the skipped placement, its class and its place';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. MYK9-607 item 2: two force-deletes of one dog in one transaction share a
--    deleted_at. The restore must read the NEWER audit row.
-- ---------------------------------------------------------------------------
-- The secretary moves d51 to 3rd in c42 (d52 stays 2nd), so the second
-- snapshot differs from the first (which recorded 1st).
UPDATE public.entries SET final_placement = 3
WHERE id = '00000000-0000-0000-0000-000000607083';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

SELECT public.force_delete_dog('00000000-0000-0000-0000-000000607051');

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(DISTINCT metadata ->> 'deleted_at') FROM public.activity_log
    WHERE record_type = 'dog' AND record_id = '00000000-0000-0000-0000-000000607051'
  ) <> 1 OR (
    SELECT count(*) FROM public.activity_log
    WHERE record_type = 'dog' AND record_id = '00000000-0000-0000-0000-000000607051'
  ) <> 2 THEN
    RAISE EXCEPTION 'FIXTURE expected two audit rows sharing one deleted_at — the tie is not set up';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

SELECT count(*) FROM public.restore_dog('00000000-0000-0000-0000-000000607051');

RESET ROLE;

DO $$
BEGIN
  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607083') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'FAIL restore read the OLDER of two same-transaction audit rows: placement is % (expected 3 from the newer snapshot)',
      (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607083');
  END IF;
  RAISE NOTICE 'PASS a same-transaction delete/restore/delete restores from the newer audit row';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. MYK9-608: Admin -> Deleted Items can see who deleted a dog, and what a
--    force-delete stranded.
-- ---------------------------------------------------------------------------
-- The ordinary path: the OWNER soft-deletes a dog with nothing paid or scored.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607101","role":"authenticated"}', true);

SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000607054');

-- A non-admin sees no deleted dogs at all.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_deleted_dogs()) THEN
    RAISE EXCEPTION 'FAIL a non-admin read rows from get_deleted_dogs()';
  END IF;
  RAISE NOTICE 'PASS a non-admin gets zero rows from get_deleted_dogs()';
END;
$$;

-- The override path, over a paid online entry.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

SELECT public.force_delete_dog('00000000-0000-0000-0000-000000607053');

SELECT set_config(
  'myk9_607.deleted_dogs',
  (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)::text FROM public.get_deleted_dogs() g),
  true
);

RESET ROLE;

DO $$
DECLARE
  v_rows jsonb := current_setting('myk9_607.deleted_dogs')::jsonb;
  v_forced jsonb := (
    SELECT r FROM jsonb_array_elements(v_rows) r
    WHERE r ->> 'id' = '00000000-0000-0000-0000-000000607053'
  );
  v_ordinary jsonb := (
    SELECT r FROM jsonb_array_elements(v_rows) r
    WHERE r ->> 'id' = '00000000-0000-0000-0000-000000607054'
  );
BEGIN
  IF v_forced IS NULL OR v_ordinary IS NULL THEN
    RAISE EXCEPTION 'FAIL get_deleted_dogs() did not list both deleted dogs for the admin';
  END IF;

  IF v_ordinary ->> 'deleted_by_email' IS DISTINCT FROM 'myk9-607-owner@example.test' THEN
    RAISE EXCEPTION 'FAIL the soft_delete_dog deleter is not named: %', v_ordinary;
  END IF;

  IF v_forced ->> 'deleted_by_email' IS DISTINCT FROM 'myk9-607-admin@example.test' THEN
    RAISE EXCEPTION 'FAIL the force_delete_dog deleter is not named: %', v_forced;
  END IF;
  RAISE NOTICE 'PASS get_deleted_dogs() names the deleter for both delete paths';

  IF v_ordinary -> 'force_delete_audit' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL an ordinary soft delete carries force-delete audit facts: %', v_ordinary;
  END IF;

  -- COALESCE every `?`: on a missing key it is NULL, and NOT NULL would let
  -- the IF fall through as if the assertion held.
  IF NOT COALESCE(v_forced -> 'force_delete_audit' -> 'entry_ids' ? '00000000-0000-0000-0000-000000607085', false)
     OR NOT COALESCE(v_forced -> 'force_delete_audit' -> 'paid_entry_ids' ? '00000000-0000-0000-0000-000000607085', false)
     OR NOT COALESCE(v_forced -> 'force_delete_audit' -> 'stripe_payment_intent_ids' ? 'pi_myk9608_stranded', false)
     OR (v_forced -> 'force_delete_audit' ->> 'refund_issued') IS DISTINCT FROM 'false'
     OR (v_forced -> 'force_delete_audit' ->> 'logged_at') IS NULL THEN
    RAISE EXCEPTION 'FAIL the force-deleted dog does not carry its audit facts: %', v_forced;
  END IF;
  RAISE NOTICE 'PASS a force-deleted dog carries its entries, paid entries and stranded payment intent';

  -- The money facts, exactly as the rows held them. Compared as a whole
  -- array so a missing entry, an extra key or a derived field all fail.
  IF (v_forced -> 'force_delete_audit' -> 'payments') IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object(
      'entry_id', '00000000-0000-0000-0000-000000607085',
      'stripe_payment_intent_id', 'pi_myk9608_stranded',
      'payment_status', 'paid',
      'entry_fee', 35.00,
      'refund_amount', NULL
    ),
    jsonb_build_object(
      'entry_id', '00000000-0000-0000-0000-000000607087',
      'stripe_payment_intent_id', 'pi_myk9608_refunded',
      'payment_status', 'refunded',
      'entry_fee', 35.00,
      'refund_amount', 35.00
    ),
    jsonb_build_object(
      'entry_id', '00000000-0000-0000-0000-000000607088',
      'stripe_payment_intent_id', 'pi_myk9608_partial',
      'payment_status', 'refunded',
      'entry_fee', 35.00,
      'refund_amount', 10.00
    )
  ) THEN
    RAISE EXCEPTION
      'FAIL the per-entry money facts are not exactly as recorded: %',
      v_forced -> 'force_delete_audit' -> 'payments';
  END IF;
  RAISE NOTICE 'PASS every affected entry''s money facts come back exactly as recorded, partial refund included';

  -- Recorded, never judged: no derived owed/unrefunded field anywhere.
  IF COALESCE(v_forced -> 'force_delete_audit' ? 'paid_payment_intent_ids', true)
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_forced -> 'force_delete_audit' -> 'payments') p,
            jsonb_object_keys(p) k
       WHERE k NOT IN ('entry_id', 'stripe_payment_intent_id', 'payment_status', 'entry_fee', 'refund_amount')
     ) THEN
    RAISE EXCEPTION 'FAIL the audit carries a derived money judgement: %', v_forced -> 'force_delete_audit';
  END IF;
  RAISE NOTICE 'PASS the audit carries no derived owed or unrefunded field';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Force-delete, restore, then an ORDINARY delete in the same transaction.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

SELECT public.force_delete_dog('00000000-0000-0000-0000-000000607055');
SELECT count(*) FROM public.restore_dog('00000000-0000-0000-0000-000000607055');

RESET ROLE;

DO $$
BEGIN
  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607086') IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FIXTURE d55 did not get its 4th back on the first restore';
  END IF;
END;
$$;

-- The secretary takes d55's placement away; then the dog is deleted the
-- ORDINARY way, which writes no audit row and shares the first deleted_at.
UPDATE public.entries SET final_placement = NULL
WHERE id = '00000000-0000-0000-0000-000000607086';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000607102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000607102","role":"authenticated"}', true);

SELECT public.soft_delete_dog('00000000-0000-0000-0000-000000607055');

SELECT set_config(
  'myk9_607.cycled_row',
  (SELECT to_jsonb(g)::text FROM public.get_deleted_dogs() g
   WHERE g.id = '00000000-0000-0000-0000-000000607055'),
  true
);

SELECT count(*) FROM public.restore_dog('00000000-0000-0000-0000-000000607055');

RESET ROLE;

DO $$
DECLARE
  v_row jsonb := NULLIF(current_setting('myk9_607.cycled_row'), '')::jsonb;
BEGIN
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'FIXTURE the ordinarily deleted dog was not listed';
  END IF;

  IF (
    SELECT (metadata ->> 'deleted_at')::timestamptz FROM public.activity_log
    WHERE record_type = 'dog' AND record_id = '00000000-0000-0000-0000-000000607055'
  ) IS DISTINCT FROM (SELECT now()) THEN
    RAISE EXCEPTION 'FIXTURE the force-delete audit row does not share the transaction deleted_at';
  END IF;

  IF v_row -> 'force_delete_audit' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION
      'FAIL an ordinary deletion was described by the earlier, restored force-delete audit row: %', v_row;
  END IF;
  RAISE NOTICE 'PASS a restored force-delete audit row does not describe a later ordinary deletion';

  IF (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607086') IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL restoring the ordinary deletion re-applied the stale force-delete snapshot (placement %)',
      (SELECT final_placement FROM public.entries WHERE id = '00000000-0000-0000-0000-000000607086');
  END IF;
  RAISE NOTICE 'PASS restoring the ordinary deletion did not re-apply the stale snapshot';

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_log
    WHERE record_type = 'dog' AND record_id = '00000000-0000-0000-0000-000000607055'
      AND metadata ? 'restored_at'
      AND metadata ->> 'restored_by' = '00000000-0000-0000-0000-000000607102'
  ) THEN
    RAISE EXCEPTION 'FAIL restore_dog did not close the audit row it restored from';
  END IF;
  RAISE NOTICE 'PASS restore_dog closes the audit row it restored from, naming the restorer';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. ACLs. DROP + CREATE resets them, and default privileges re-grant anon.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.restore_dog(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_deleted_dogs()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.force_delete_dog(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute a dog delete/restore RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.restore_dog(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_deleted_dogs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated lost EXECUTE on restore_dog / get_deleted_dogs';
  END IF;

  IF has_function_privilege('anon', 'public.dog_force_delete_audit(uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dog_force_delete_audit(uuid, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL an API role can call the internal dog_force_delete_audit helper';
  END IF;
  RAISE NOTICE 'PASS anon is shut out and the audit helper is internal';
END;
$$;

ROLLBACK;
