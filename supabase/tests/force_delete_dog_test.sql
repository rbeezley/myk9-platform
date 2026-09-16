-- force_delete_dog(): who may override the MK002 refusal, and what the override
-- must still clean up.
--
-- This is the admin escape hatch from soft_delete_dog's paid/scored refusal
-- (migration 20260915214500, follow-ups in 20260916181700). Properties that
-- matter and are not visible in the schema:
--
--   * It is ADMIN-ONLY. The owner of the dog — who may delete it via
--     soft_delete_dog — must be refused here, or the guard the whole feature
--     exists to protect is bypassable by the person it constrains.
--   * It still performs the FULL cascade. An override that skipped the waitlist
--     delete would leave a deleted dog promotable into a live entry, which is
--     the exact bug 20260830140000 fixed for the ordinary path.
--   * MK002 has TWO arms, money and results. The scored arm is asserted here
--     because force_delete_dog is the ONLY path that reaches a scored entry.
--   * The cascade now closes the hole it leaves: waitlist positions behind the
--     removed dog are re-packed to 1..N, and the placements of a manual-status
--     class are re-derived so the survivors move up — and move back down when
--     the dog is restored (MYK9-596 items 1 and 2).
--   * The override writes ONE activity_log row naming the actor, the entries
--     and the stranded Stripe payment intents (MYK9-596 item 3). It is the only
--     record that a captured charge was left behind.
--
-- Deliberately asserted: the paid entry IS soft-deleted and no refund is
-- recorded, and the cart / waitlist rows do NOT come back on restore. That is
-- the agreed behaviour, not an oversight — see the migration headers. If a
-- future change starts issuing refunds, or makes the cascade fully reversible,
-- these assertions should fail and be updated on purpose.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (
    '00000000-0000-0000-0000-0000000fd011',
    'Force Delete',
    'Owner',
    'force-delete-dog-owner@example.test'
  ),
  (
    '00000000-0000-0000-0000-0000000fd012',
    'Force Delete',
    'Admin',
    'force-delete-dog-admin@example.test'
  );

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-0000000fd101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'force-delete-dog-owner@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-0000000fd102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'force-delete-dog-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

-- Make the second user a site_admin: is_platform_admin() -> is_site_admin()
-- matches on user_roles.auth_user_id = auth.uid(). `user_id` is a SEPARATE,
-- NOT NULL column that foreign-keys to people(id) — a people id is never an
-- auth uid in this database, so both columns must be set, with the right value
-- in each.
INSERT INTO public.user_roles (user_id, auth_user_id, role_id, is_active)
SELECT
  '00000000-0000-0000-0000-0000000fd012',
  '00000000-0000-0000-0000-0000000fd102',
  r.id,
  true
FROM public.roles r
WHERE r.name = 'site_admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = '00000000-0000-0000-0000-0000000fd102'
      AND r.name = 'site_admin'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE no site_admin role row was created — the admin arm below would pass vacuously';
  END IF;
END;
$$;

INSERT INTO public.shows (id, name, organization, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-0000000fd021',
  'Force Delete Show',
  'AKC',
  current_date,
  current_date,
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-0000000fd031',
  '00000000-0000-0000-0000-0000000fd021',
  'Force Delete Trial',
  current_date
);

-- fd041 carries the paid entry and the waitlist queue.
-- fd042 is the SCORED class, and is deliberately `status_source = 'manual'`:
-- that branch of refresh_class_scoring_state used to null a tombstoned entry's
-- placement and RETURN without recomputing, so a restored entry stayed
-- unplaced forever (MYK9-596 item 2). `status` is 'in_progress', NOT
-- 'completed', because handle_entry_scoring_state_change flips status_source
-- back to 'derived' on any INSERT into a completed class — with 'completed'
-- here the manual branch is never reached and the placement assertions below
-- pass against the UNFIXED function.
INSERT INTO public.classes (id, trial_id, name, status, status_source)
VALUES
  ('00000000-0000-0000-0000-0000000fd041', '00000000-0000-0000-0000-0000000fd031', 'Force Delete Class', 'upcoming', 'derived'),
  ('00000000-0000-0000-0000-0000000fd042', '00000000-0000-0000-0000-0000000fd031', 'Force Delete Scored Class', 'in_progress', 'manual');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-0000000fd051', 'Paid Up', 'Border Collie', '00000000-0000-0000-0000-0000000fd011'),
  ('00000000-0000-0000-0000-0000000fd052', 'Runner Up', 'Border Collie', '00000000-0000-0000-0000-0000000fd011'),
  ('00000000-0000-0000-0000-0000000fd053', 'Third In Line', 'Border Collie', '00000000-0000-0000-0000-0000000fd011');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES (
  '00000000-0000-0000-0000-0000000fd051',
  'AKC',
  'SW999101',
  'Paid Up Formally'
);

-- The ONLINE-paid entry: a real Stripe payment intent that the override strands
-- captured. The audit row has to name it, because nothing else will.
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, payment_method,
  stripe_payment_intent_id, entry_fee
)
VALUES (
  '00000000-0000-0000-0000-0000000fd081',
  '00000000-0000-0000-0000-0000000fd041',
  '00000000-0000-0000-0000-0000000fd031',
  '00000000-0000-0000-0000-0000000fd021',
  '00000000-0000-0000-0000-0000000fd051',
  'paid',
  'card',
  'pi_myk9596_forcedelete',
  35.00
);

-- The SCORED half: two qualified runs in the manual class, dog fd051 faster.
-- final_placement is left to the server (refresh -> recalculate_class_placements
-- fires on insert); the fixture guard below proves it landed 1/2.
INSERT INTO public.entries (
  id, class_id, trial_id, show_id, dog_id, payment_status, entry_status,
  is_scored, result_status, total_faults, search_time_seconds
)
VALUES
  (
    '00000000-0000-0000-0000-0000000fd083',
    '00000000-0000-0000-0000-0000000fd042',
    '00000000-0000-0000-0000-0000000fd031',
    '00000000-0000-0000-0000-0000000fd021',
    '00000000-0000-0000-0000-0000000fd051',
    'pending', 'confirmed', true, 'qualified', 0, 10
  ),
  (
    '00000000-0000-0000-0000-0000000fd084',
    '00000000-0000-0000-0000-0000000fd042',
    '00000000-0000-0000-0000-0000000fd031',
    '00000000-0000-0000-0000-0000000fd021',
    '00000000-0000-0000-0000-0000000fd052',
    'pending', 'confirmed', true, 'qualified', 0, 20
  );

-- The CART leg: entry_cart_items has no soft-delete column, so the cascade
-- hard-deletes it and restore cannot bring it back.
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status)
SELECT
  '00000000-0000-0000-0000-0000000fd061',
  ep.id,
  '00000000-0000-0000-0000-0000000fd021',
  'active'
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-0000000fd101';

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
SELECT
  '00000000-0000-0000-0000-0000000fd062',
  '00000000-0000-0000-0000-0000000fd061',
  '00000000-0000-0000-0000-0000000fd051',
  '00000000-0000-0000-0000-0000000fd041',
  3500
WHERE EXISTS (
  SELECT 1 FROM public.entry_carts WHERE id = '00000000-0000-0000-0000-0000000fd061'
);

-- Three dogs queued 1, 2, 3 on the same class. Removing the one at the FRONT is
-- what exposes the missing re-sequence.
INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position)
SELECT
  v.id,
  '00000000-0000-0000-0000-0000000fd041',
  ep.id,
  v.dog_id,
  v.position
FROM public.exhibitor_profiles ep
CROSS JOIN (
  VALUES
    ('00000000-0000-0000-0000-0000000fd071'::uuid, '00000000-0000-0000-0000-0000000fd051'::uuid, 1),
    ('00000000-0000-0000-0000-0000000fd072'::uuid, '00000000-0000-0000-0000-0000000fd052'::uuid, 2),
    ('00000000-0000-0000-0000-0000000fd073'::uuid, '00000000-0000-0000-0000-0000000fd053'::uuid, 3)
) AS v(id, dog_id, position)
WHERE ep.auth_user_id = '00000000-0000-0000-0000-0000000fd101';

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.waitlist_entries
    WHERE class_id = '00000000-0000-0000-0000-0000000fd041'
  ) <> 3 THEN
    RAISE EXCEPTION
      'FIXTURE the three waitlist rows were never created — the cascade and re-sequence assertions would pass vacuously';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entry_cart_items WHERE id = '00000000-0000-0000-0000-0000000fd062'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE the cart item was never created — the cart assertion would pass vacuously';
  END IF;

  -- The manual branch must still be reachable AND the class must already be
  -- placed 1/2, or the placement assertions below prove nothing.
  IF (
    SELECT status_source FROM public.classes
    WHERE id = '00000000-0000-0000-0000-0000000fd042'
  ) IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION
      'FIXTURE the scored class is no longer status_source=manual — the placement assertions would pass vacuously';
  END IF;

  IF (
    SELECT final_placement FROM public.entries
    WHERE id = '00000000-0000-0000-0000-0000000fd083'
  ) IS DISTINCT FROM 1
  OR (
    SELECT final_placement FROM public.entries
    WHERE id = '00000000-0000-0000-0000-0000000fd084'
  ) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FIXTURE the scored class did not start placed 1/2';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The dog's OWNER must be refused. They can soft-delete their own dog, so
--    without this the override is reachable by exactly the people the MK002
--    guard is meant to stop.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd101","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');
    RAISE EXCEPTION 'FAIL the dog owner was allowed to force-delete';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'PASS a non-admin owner is refused 42501';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT deleted_at FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-0000000fd051'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the refused override still tombstoned the dog';
  END IF;
  RAISE NOTICE 'PASS the refused override left the dog untouched';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. MK002's SCORED arm still refuses the ordinary path, for an admin too.
--    dog fd052's only entry is unpaid, so nothing but `is_scored` can be
--    refusing it — the money arm cannot mask a broken results arm.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd102","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entries
    WHERE dog_id = '00000000-0000-0000-0000-0000000fd052'
      AND deleted_at IS NULL
      AND payment_status = 'paid'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE dog fd052 has a paid entry — the scored arm of MK002 would not be what refuses';
  END IF;

  BEGIN
    PERFORM public.soft_delete_dog('00000000-0000-0000-0000-0000000fd052');
    RAISE EXCEPTION 'FAIL soft_delete_dog accepted a dog with a SCORED entry';
  EXCEPTION
    WHEN sqlstate 'MK002' THEN
      RAISE NOTICE 'PASS soft_delete_dog still refuses the scored arm of MK002';
  END;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. A site admin succeeds over the paid AND scored entries, and the whole
--    cascade runs: entries tombstoned, cart item gone, waitlist spot gone and
--    the queue re-packed, the survivor re-ranked, one audit row written.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd102","role":"authenticated"}',
  true
);

-- Positive control on the gate itself. The row-exists check above cannot tell a
-- correct auth_user_id from a wrong one, and a wrong one would surface as a
-- confusing 42501 from the call below rather than as "the fixture is broken".
DO $$
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION
      'FIXTURE is_platform_admin() is false for the admin session — the role row is not wired to auth.uid()';
  END IF;
  RAISE NOTICE 'PASS fixture admin is recognised by is_platform_admin()';
END;
$$;

SELECT public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');

RESET ROLE;

DO $$
DECLARE
  v_dog_deleted_at timestamptz;
  v_entry_deleted_at timestamptz;
  v_positions integer[];
  v_survivor_placement integer;
BEGIN
  SELECT deleted_at INTO v_dog_deleted_at
  FROM public.dogs WHERE id = '00000000-0000-0000-0000-0000000fd051';

  IF v_dog_deleted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the admin override did not tombstone the dog';
  END IF;
  RAISE NOTICE 'PASS admin override soft-deleted the dog over a paid and scored entry';

  SELECT deleted_at INTO v_entry_deleted_at
  FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000fd081';

  IF v_entry_deleted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL the paid entry survived the override; the cascade did not run';
  END IF;
  RAISE NOTICE 'PASS the paid entry was soft-deleted (no refund is issued — deliberate)';

  IF (
    SELECT deleted_at FROM public.entries
    WHERE id = '00000000-0000-0000-0000-0000000fd083'
  ) IS NULL THEN
    RAISE EXCEPTION 'FAIL the scored entry survived the override';
  END IF;
  RAISE NOTICE 'PASS the scored entry was soft-deleted';

  -- restore_dog re-links entries by matching the dog's deleted_at exactly. Both
  -- UPDATEs read NOW(), which is transaction-start time, so these MUST be equal
  -- — if they ever diverge, a force-deleted dog restores without its entries.
  IF v_entry_deleted_at IS DISTINCT FROM v_dog_deleted_at THEN
    RAISE EXCEPTION
      'FAIL dog and entry deleted_at differ (% vs %); restore_dog would not re-link the entries',
      v_dog_deleted_at, v_entry_deleted_at;
  END IF;
  RAISE NOTICE 'PASS dog and entry share a deleted_at, so restore_dog can re-link them';

  IF EXISTS (
    SELECT 1 FROM public.entry_cart_items
    WHERE dog_id = '00000000-0000-0000-0000-0000000fd051'
  ) THEN
    RAISE EXCEPTION 'FAIL a force-deleted dog still has pre-checkout cart items';
  END IF;
  RAISE NOTICE 'PASS cart items removed by the override';

  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE dog_id = '00000000-0000-0000-0000-0000000fd051'
  ) THEN
    RAISE EXCEPTION 'FAIL a force-deleted dog is still queued on a waitlist';
  END IF;
  RAISE NOTICE 'PASS waitlist spot removed by the override';

  -- MYK9-596 item 1: the queue must close up behind the removed dog. Without
  -- this the two dogs left sit at 2 and 3 forever, each reporting a place in
  -- the queue that is one worse than the truth.
  SELECT array_agg(position ORDER BY position) INTO v_positions
  FROM public.waitlist_entries
  WHERE class_id = '00000000-0000-0000-0000-0000000fd041' AND status = 'waiting';

  IF v_positions IS DISTINCT FROM ARRAY[1, 2] THEN
    RAISE EXCEPTION 'FAIL waitlist positions were not re-sequenced: %', v_positions;
  END IF;
  RAISE NOTICE 'PASS waitlist positions re-sequenced to 1,2';

  -- MYK9-596 item 2: the manual branch recomputes, so the survivor moves up.
  SELECT final_placement INTO v_survivor_placement
  FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000fd084';

  IF v_survivor_placement IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'FAIL the surviving scored entry is placed % (expected 1) — the manual branch did not recompute',
      v_survivor_placement;
  END IF;
  RAISE NOTICE 'PASS the surviving scored entry moved up to placement 1';
END;
$$;

-- MYK9-596 item 3: the audit row. This is the ONLY record that a captured
-- charge was stranded, so it must name the actor, the dog, every entry and
-- every payment intent.
DO $$
DECLARE
  v_matches integer;
BEGIN
  SELECT count(*) INTO v_matches
  FROM public.activity_log
  WHERE record_type = 'dog'
    AND record_id = '00000000-0000-0000-0000-0000000fd051'
    AND action_type = 'deleted'
    AND actor_id = '00000000-0000-0000-0000-0000000fd102'
    AND metadata ->> 'override' = 'force_delete_dog'
    AND metadata -> 'entry_ids' ? '00000000-0000-0000-0000-0000000fd081'
    AND metadata -> 'entry_ids' ? '00000000-0000-0000-0000-0000000fd083'
    AND metadata -> 'paid_entry_ids' ? '00000000-0000-0000-0000-0000000fd081'
    AND metadata -> 'stripe_payment_intent_ids' ? 'pi_myk9596_forcedelete'
    AND (metadata ->> 'waitlist_rows_removed')::integer = 1
    AND (metadata ->> 'cart_items_removed')::integer = 1
    AND (metadata ->> 'refund_issued') = 'false';

  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'FAIL expected exactly one force_delete_dog audit row naming the actor, entries and payment intent, found %',
      v_matches;
  END IF;
  RAISE NOTICE 'PASS the override wrote one audit row naming actor, dog, entries and the stranded payment intent';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. An already-deleted dog raises P0002 rather than silently reporting success.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fd102', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fd102","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.force_delete_dog('00000000-0000-0000-0000-0000000fd051');
    RAISE EXCEPTION 'FAIL re-deleting an already-deleted dog reported success';
  EXCEPTION
    WHEN sqlstate 'P0002' THEN
      RAISE NOTICE 'PASS re-deleting an already-deleted dog raises P0002';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. restore_dog, end to end over what the override actually removed. The dog
--    and BOTH entries come back and the scored one regains its placement; the
--    cart item and the waitlist spot do NOT. That asymmetry is what the dialog
--    copy and the function COMMENT now state, so it is pinned here.
-- ---------------------------------------------------------------------------
-- still in the admin session left set by section 4.
SELECT count(*) FROM public.restore_dog('00000000-0000-0000-0000-0000000fd051');

RESET ROLE;

DO $$
DECLARE
  v_first integer;
  v_second integer;
BEGIN
  IF (
    SELECT deleted_at FROM public.dogs WHERE id = '00000000-0000-0000-0000-0000000fd051'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL restore_dog left the dog tombstoned';
  END IF;

  IF (
    SELECT count(*) FROM public.entries
    WHERE dog_id = '00000000-0000-0000-0000-0000000fd051' AND deleted_at IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'FAIL restore_dog did not bring both entries back';
  END IF;
  RAISE NOTICE 'PASS restore_dog brought the dog and both entries back';

  SELECT final_placement INTO v_first
  FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000fd083';
  SELECT final_placement INTO v_second
  FROM public.entries WHERE id = '00000000-0000-0000-0000-0000000fd084';

  IF v_first IS DISTINCT FROM 1 OR v_second IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      'FAIL after restore the manual class is placed %/% (expected 1/2) — the restored entry is permanently unplaced',
      v_first, v_second;
  END IF;
  RAISE NOTICE 'PASS a restored force-deleted scored entry regains its placement';

  -- The honest half. These are hard deletes; nothing restores them, and the
  -- dialog copy says so. If a future change makes them reversible, replace
  -- these two assertions rather than deleting them.
  IF EXISTS (
    SELECT 1 FROM public.entry_cart_items WHERE id = '00000000-0000-0000-0000-0000000fd062'
  ) THEN
    RAISE EXCEPTION 'FAIL the cart item came back — update the dialog copy and the COMMENT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries WHERE id = '00000000-0000-0000-0000-0000000fd071'
  ) THEN
    RAISE EXCEPTION 'FAIL the waitlist spot came back — update the dialog copy and the COMMENT';
  END IF;
  RAISE NOTICE 'PASS cart items and waitlist spots stay gone, exactly as the copy says';
END;
$$;

ROLLBACK;
