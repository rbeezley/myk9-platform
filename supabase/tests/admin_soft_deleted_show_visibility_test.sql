-- MYK9-233 behavioral contract.
--
-- shows_select and manageable_show_ids() must state the SAME sentence about a
-- soft-deleted show, in both directions:
--   site admin  -> sees the deleted show AND its entries
--   non-admin   -> sees neither, VIA THE SHOW-MANAGEMENT ROUTE
--
-- That qualifier is load-bearing and was missing from the first draft of this
-- file. entries_select is manageable_show_ids() OR handler-is-me OR I-own-the-dog.
-- This migration governs the FIRST arm only. An exhibitor who is the handler or
-- the dog's owner still reads their own entry row for a soft-deleted show,
-- because those two arms carry no show-liveness test and this change did not add
-- one. Asserted explicitly at the bottom of this file rather than left implied.
--
-- Before the fix they disagreed and the disagreement lost money: an admin was
-- handed the ENTRIES of a soft-deleted show (manageable_show_ids() is SECURITY
-- DEFINER and never restated the filter) while the SHOW row itself was hidden
-- (shows_select ANDed deleted_at OUTSIDE the whole OR group). The payout ledger
-- maps over resolved shows, so that money left the table and both totals.
--
-- The live show in the same fixture is the guard against over-opening: this must
-- not become "admins see everything, nobody else sees anything".
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000233001', 'MYK9-233 Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000233010',
    'Site',
    'Admin',
    '00000000-0000-0000-0000-000000233100'
  ),
  (
    '00000000-0000-0000-0000-000000233011',
    'Entrant',
    'Exhibitor',
    '00000000-0000-0000-0000-000000233101'
  ),
  -- A THIRD person who owns no dog and handles no entry. The first draft of this
  -- fixture named 233011 "Unrelated" and then made it the owner AND handler of
  -- both entries, so the over-opening guard below was impersonating the one
  -- identity that entries_select grants by another route entirely.
  (
    '00000000-0000-0000-0000-000000233012',
    'Truly Unrelated',
    'Bystander',
    '00000000-0000-0000-0000-000000233102'
  );

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000233010',
  id,
  true,
  '00000000-0000-0000-0000-000000233100'
FROM public.roles
WHERE name = 'site_admin';

-- Two shows: one soft-deleted, one live. Both published, both with paid entries.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  (
    '00000000-0000-0000-0000-000000233002',
    'MYK9-233 Deleted Show',
    'AKC',
    current_date,
    current_date + 1,
    '00000000-0000-0000-0000-000000233001',
    'published'
  ),
  (
    '00000000-0000-0000-0000-000000233003',
    'MYK9-233 Live Show',
    'AKC',
    current_date,
    current_date + 1,
    '00000000-0000-0000-0000-000000233001',
    'published'
  );

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  (
    '00000000-0000-0000-0000-000000233004',
    '00000000-0000-0000-0000-000000233002',
    'MYK9-233 Deleted Trial',
    current_date
  ),
  (
    '00000000-0000-0000-0000-000000233005',
    '00000000-0000-0000-0000-000000233003',
    'MYK9-233 Live Trial',
    current_date
  );

INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  (
    '00000000-0000-0000-0000-000000233006',
    '00000000-0000-0000-0000-000000233004',
    'Container Novice',
    'in_progress'
  ),
  (
    '00000000-0000-0000-0000-000000233007',
    '00000000-0000-0000-0000-000000233005',
    'Container Novice',
    'in_progress'
  );

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  (
    '00000000-0000-0000-0000-000000233020',
    'MYK9-233 Dog A',
    'A',
    'Beagle',
    '00000000-0000-0000-0000-000000233011'
  ),
  (
    '00000000-0000-0000-0000-000000233021',
    'MYK9-233 Dog B',
    'B',
    'Beagle',
    '00000000-0000-0000-0000-000000233011'
  );

-- Paid online entries: this is the money that must not disappear.
--
-- entries_protect_payment_fields_insert() blocks a forged paid-online row for
-- everyone except service_role, which is what the payment service runs as.
-- Production creates these through its SECURITY DEFINER RPC; this rolled-back
-- fixture takes the same role and only the direct INSERT it needs, matching
-- pull_refund_decision_rls_test.sql.
GRANT INSERT ON public.entries TO service_role;

SET LOCAL ROLE service_role;

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband,
  is_in_ring, is_scored, entry_fee, payment_status, payment_method
)
VALUES
  (
    '00000000-0000-0000-0000-000000233030',
    '00000000-0000-0000-0000-000000233020',
    '00000000-0000-0000-0000-000000233006',
    '00000000-0000-0000-0000-000000233002',
    '00000000-0000-0000-0000-000000233004',
    '00000000-0000-0000-0000-000000233011',
    'confirmed',
    '233-del',
    false,
    false,
    30.00,
    'paid',
    'online'
  ),
  (
    '00000000-0000-0000-0000-000000233031',
    '00000000-0000-0000-0000-000000233021',
    '00000000-0000-0000-0000-000000233007',
    '00000000-0000-0000-0000-000000233003',
    '00000000-0000-0000-0000-000000233005',
    '00000000-0000-0000-0000-000000233011',
    'confirmed',
    '233-live',
    false,
    false,
    30.00,
    'paid',
    'online'
  );

RESET ROLE;

UPDATE public.shows
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000233002';

-- ---------------------------------------------------------------------------
-- Site admin: sees BOTH shows and BOTH entries.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000233100',
  true
);

DO $$
DECLARE
  deleted_show_id uuid := '00000000-0000-0000-0000-000000233002';
  live_show_id uuid := '00000000-0000-0000-0000-000000233003';
  visible_shows uuid[];
  manageable uuid[];
  visible_entries uuid[];
BEGIN
  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}')
    INTO visible_shows
    FROM public.shows s
   WHERE s.id IN (deleted_show_id, live_show_id);

  IF NOT (deleted_show_id = ANY(visible_shows)) THEN
    RAISE EXCEPTION
      'FAIL site admin cannot see the soft-deleted show; shows_select still gates the admin arm. saw: %',
      visible_shows;
  END IF;

  IF NOT (live_show_id = ANY(visible_shows)) THEN
    RAISE EXCEPTION 'FAIL site admin lost the live show. saw: %', visible_shows;
  END IF;

  SELECT coalesce(array_agg(m ORDER BY m), '{}')
    INTO manageable
    FROM public.manageable_show_ids() AS m
   WHERE m IN (deleted_show_id, live_show_id);

  IF NOT (deleted_show_id = ANY(manageable) AND live_show_id = ANY(manageable)) THEN
    RAISE EXCEPTION
      'FAIL manageable_show_ids() disagrees with shows_select for a site admin. saw: %',
      manageable;
  END IF;

  SELECT coalesce(array_agg(e.id ORDER BY e.id), '{}')
    INTO visible_entries
    FROM public.entries e
   WHERE e.show_id IN (deleted_show_id, live_show_id);

  -- The money. An admin who can read the entry must also be able to read the
  -- show it belongs to, or the payout ledger drops it while still owing it.
  IF array_length(visible_entries, 1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FAIL site admin should see both paid entries. saw: %', visible_entries;
  END IF;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Unrelated authenticated user: sees the LIVE show only, and no entry on the
-- deleted show. This is the over-opening guard.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000233102',
  true
);

DO $$
DECLARE
  deleted_show_id uuid := '00000000-0000-0000-0000-000000233002';
  live_show_id uuid := '00000000-0000-0000-0000-000000233003';
  visible_shows uuid[];
  manageable_deleted bigint;
  visible_entries bigint;
BEGIN
  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}')
    INTO visible_shows
    FROM public.shows s
   WHERE s.id IN (deleted_show_id, live_show_id);

  IF deleted_show_id = ANY(visible_shows) THEN
    RAISE EXCEPTION
      'FAIL non-admin can see a soft-deleted show; the deleted_at gate was dropped instead of scoped. saw: %',
      visible_shows;
  END IF;

  IF NOT (live_show_id = ANY(visible_shows)) THEN
    RAISE EXCEPTION
      'FAIL non-admin lost the live published show; the rewrite over-tightened. saw: %',
      visible_shows;
  END IF;

  SELECT count(*)
    INTO manageable_deleted
    FROM public.manageable_show_ids() AS m
   WHERE m = deleted_show_id;

  IF manageable_deleted <> 0 THEN
    RAISE EXCEPTION
      'FAIL manageable_show_ids() returns a soft-deleted show to a non-admin';
  END IF;

  -- The assertion the first draft never made. Without it the whole non-admin
  -- half of this file proved only that shows_select works, and the entries
  -- claim in the header went unchecked.
  SELECT count(*)
    INTO visible_entries
    FROM public.entries e
   WHERE e.show_id = deleted_show_id;

  IF visible_entries <> 0 THEN
    RAISE EXCEPTION
      'FAIL an unrelated non-admin can read % entries of a soft-deleted show',
      visible_entries;
  END IF;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- The entrant: still reads their OWN entry for the soft-deleted show.
--
-- This is current behaviour, not desired behaviour, and it is pinned here so the
-- gap is visible instead of silent. entries_select's handler and dog-owner arms
-- carry no show-liveness test, so they bypass manageable_show_ids() entirely;
-- MYK9-233 did not touch them and closing that arm is a separate product
-- decision about whether an exhibitor keeps sight of their own paid entry after
-- a club drops the show.
--
-- It is not a live exposure today: soft_delete_show() cascades deleted_at down
-- to entries, and every exhibitor-facing read filters entries.deleted_at. That
-- makes a CLIENT filter the only thing standing in front of a permission
-- boundary, which is why this is written down rather than shrugged off.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000233101',
  true
);

DO $$
DECLARE
  deleted_show_id uuid := '00000000-0000-0000-0000-000000233002';
  own_entries bigint;
BEGIN
  SELECT count(*)
    INTO own_entries
    FROM public.entries e
   WHERE e.show_id = deleted_show_id;

  IF own_entries <> 1 THEN
    RAISE EXCEPTION
      'FAIL expected the entrant to still read their own 1 entry via the handler/owner arm, saw %. If this dropped to 0 the arm was gated - update the header contract and delete this block.',
      own_entries;
  END IF;
END;
$$;

RESET ROLE;

ROLLBACK;
