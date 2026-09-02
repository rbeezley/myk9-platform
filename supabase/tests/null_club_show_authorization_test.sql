-- MYK9-258: a show with no club must not be manageable by every secretary.
--
-- is_trial_secretary/is_club_admin treat a NULL argument as "no club filter",
-- so passing a nullable `shows.club_id` positionally made every club-less show
-- manageable by every active secretary and club admin on the platform. Found on
-- staging by the G9 rehearsal's per-show scope assertion: four secretaries in
-- four different clubs each reported managing the same club-less show.
--
-- Each case asserts BOTH directions. A test that only proves the club-less show
-- is hidden would also pass if the guard hid everything, which would be a worse
-- bug in the other direction.
--
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000000c01', 'MYK9-258 Club A');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000c11',
    'Club A',
    'Secretary',
    '00000000-0000-0000-0000-000000000c21'
  ),
  (
    '00000000-0000-0000-0000-000000000c12',
    'Club A',
    'Administrator',
    '00000000-0000-0000-0000-000000000c22'
  );

-- is_trial_secretary additionally requires active club membership.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c11',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-000000000c12',
    'active'
  );

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c11',
  id,
  '00000000-0000-0000-0000-000000000c01',
  true,
  '00000000-0000-0000-0000-000000000c21'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c12',
  id,
  '00000000-0000-0000-0000-000000000c01',
  true,
  '00000000-0000-0000-0000-000000000c22'
FROM public.roles
WHERE name = 'club_admin';

-- One show in club A, and one with NO club at all — the shape that leaked.
-- `organization` is NOT NULL with no default (migration 040 renamed the original
-- required `type` column), so omitting it aborts the whole test file before any
-- assertion runs.
INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
VALUES
  (
    '00000000-0000-0000-0000-000000000c31',
    'MYK9-258 Club A Show',
    'AKC',
    '00000000-0000-0000-0000-000000000c01',
    'published',
    DATE '2026-09-01',
    DATE '2026-09-02'
  ),
  (
    '00000000-0000-0000-0000-000000000c32',
    'MYK9-258 Club-less Show',
    'AKC',
    NULL,
    'published',
    DATE '2026-09-01',
    DATE '2026-09-02'
  );

-- An entry on EACH show. Without one on the club-less show, case 1.6 passes
-- against the vulnerable function too — an empty export and a denied export are
-- indistinguishable — so the assertion would certify nothing.
-- payment_status / entry_fee are the `can_view_admin`-masked columns case 5
-- reads back through view_authenticated_entry_results; without a value the
-- "column is masked" and "column is empty" outcomes are indistinguishable.
INSERT INTO public.entries (id, show_id, armband, payment_status, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000000c51', '00000000-0000-0000-0000-000000000c31', '101', 'paid', 25),
  ('00000000-0000-0000-0000-000000000c52', '00000000-0000-0000-0000-000000000c32', '201', 'paid', 35);

-- ---------------------------------------------------------------------------
-- 1. The club secretary
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c21',
  true
);

DO $$
DECLARE
  v_sees_own boolean;
  v_sees_clubless boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c31'
  ) INTO v_sees_own;
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) INTO v_sees_clubless;

  IF NOT v_sees_own THEN
    RAISE EXCEPTION
      'FAIL 1.1 club secretary lost their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 1.1 club secretary still manages their own club''s show';

  IF v_sees_clubless THEN
    RAISE EXCEPTION
      'FAIL 1.2 club secretary manages a show with no club (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 1.2 club secretary does not manage a club-less show';
END;
$$;

DO $$
BEGIN
  IF NOT public.can_manage_show('00000000-0000-0000-0000-000000000c31') THEN
    RAISE EXCEPTION 'FAIL 1.3 can_manage_show denied the secretary their own show';
  END IF;
  RAISE NOTICE 'PASS 1.3 can_manage_show admits the secretary to their own show';

  IF public.can_manage_show('00000000-0000-0000-0000-000000000c32') THEN
    RAISE EXCEPTION 'FAIL 1.4 can_manage_show admitted a club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 1.4 can_manage_show rejects a club-less show';

  IF public.is_show_office_manager('00000000-0000-0000-0000-000000000c32') THEN
    RAISE EXCEPTION
      'FAIL 1.5 is_show_office_manager admitted a club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 1.5 is_show_office_manager rejects a club-less show';

  -- get_entries_for_export returns owner email and phone, so the club-less show
  -- handed every secretary a full entrant export including PII.
  --
  -- Both directions, and in this order: the authorized export must return its
  -- seeded row FIRST, otherwise "returns nothing" below proves only that the
  -- function is broken for everyone.
  IF NOT EXISTS (
    SELECT 1 FROM public.get_entries_for_export('00000000-0000-0000-0000-000000000c31')
  ) THEN
    RAISE EXCEPTION
      'FAIL 1.6a get_entries_for_export returned nothing for the secretary''s own show';
  END IF;
  RAISE NOTICE 'PASS 1.6a get_entries_for_export returns the secretary''s own show';

  IF EXISTS (
    SELECT 1 FROM public.get_entries_for_export('00000000-0000-0000-0000-000000000c32')
  ) THEN
    RAISE EXCEPTION
      'FAIL 1.6b get_entries_for_export returned rows for a club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 1.6b get_entries_for_export returns nothing for a club-less show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The club admin — same collapse, separate arm
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c22',
  true
);

DO $$
DECLARE
  v_sees_own boolean;
  v_sees_clubless boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c31'
  ) INTO v_sees_own;
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) INTO v_sees_clubless;

  IF NOT v_sees_own THEN
    RAISE EXCEPTION 'FAIL 2.1 club admin lost their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 2.1 club admin still manages their own club''s show';

  IF v_sees_clubless THEN
    RAISE EXCEPTION
      'FAIL 2.2 club admin manages a show with no club (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 2.2 club admin does not manage a club-less show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. A trial under the club-less show
--
-- can_manage_trial reaches the club through the trial's show, so it inherits
-- the same defect one join away.
-- ---------------------------------------------------------------------------
-- `trials` uses `date` (not `trial_date`) and requires `name`.
INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000000c41',
  '00000000-0000-0000-0000-000000000c32',
  'MYK9-258 Club-less Trial',
  DATE '2026-09-01'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c21',
  true
);

DO $$
BEGIN
  IF public.can_manage_trial('00000000-0000-0000-0000-000000000c41') THEN
    RAISE EXCEPTION
      'FAIL 3.1 can_manage_trial admitted a trial of a club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 3.1 can_manage_trial rejects a trial of a club-less show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The show-scoped arm still works
--
-- This case originally granted a show-scoped secretary role on the CLUB-LESS
-- show, to prove the guard had not broken that arm. CI rejected it:
--
--   club_id is required for role "secretary" — secretary and club_admin roles
--   must be scoped to a club
--
-- So that state is unreachable: a show-scoped secretary grant always carries a
-- club, and the show-scoped arm therefore cannot reach a club-less show at all.
-- The original case was asserting something the schema forbids.
--
-- What is worth pinning has since inverted. When MYK9-258 was written the
-- opposite risk was that the new `club_id IS NOT NULL` guards had narrowed the
-- show-scoped arm for shows that DO have a club, so this case asserted that a
-- secretary of club B still reached club A's show through an explicit
-- show-scoped grant. The label/permission split retired that arm on purpose: a
-- show-scoped row is now paperwork and carries no permission, and appointment
-- to the owning club is the only thing that grants access. So the case below
-- now asserts the reverse — club B's secretary must NOT reach club A's show —
-- while 4.2 keeps its original force unchanged.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000000c02', 'MYK9-258 Club B');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000c13',
  'Club B',
  'Secretary',
  '00000000-0000-0000-0000-000000000c23'
);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-000000000c02',
  '00000000-0000-0000-0000-000000000c13',
  'active'
);

-- Club B needs a show of its own. Without it this caller manages nothing at all
-- and 4.1/4.2 below would both pass for the wrong reason -- the "would also pass
-- if the guard hid everything" failure this file's header calls out.
INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
VALUES (
  '00000000-0000-0000-0000-000000000c33',
  'MYK9-258 Club B Show',
  'AKC',
  '00000000-0000-0000-0000-000000000c02',
  'published',
  DATE '2026-09-01',
  DATE '2026-09-02'
);

-- club_id is club B (the schema requires one); show_id points at club A's show.
-- This is exactly the row that used to grant cross-club access and must not any more.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c13',
  id,
  '00000000-0000-0000-0000-000000000c02',
  '00000000-0000-0000-0000-000000000c31',
  true,
  '00000000-0000-0000-0000-000000000c23'
FROM public.roles
WHERE name = 'secretary';

-- ...and the appointment that DOES grant, so the positive direction is covered.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c13',
  id,
  '00000000-0000-0000-0000-000000000c02',
  true,
  '00000000-0000-0000-0000-000000000c23'
FROM public.roles
WHERE name = 'secretary';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c23',
  true
);

DO $$
BEGIN
  -- 4.0 first: if this fails, 4.1 and 4.2 prove nothing.
  IF NOT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c33'
  ) THEN
    RAISE EXCEPTION
      'FAIL 4.0 club B secretary lost their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 4.0 club B secretary manages their own club''s show';

  IF EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c31'
  ) THEN
    RAISE EXCEPTION
      'FAIL 4.1 a show-scoped grant still reaches another club''s show';
  END IF;
  RAISE NOTICE 'PASS 4.1 a show-scoped grant does not reach another club''s show';

  -- And the club-less guard still holds independently: club B's secretary role
  -- must not hand them the club-less show either.
  IF EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) THEN
    RAISE EXCEPTION
      'FAIL 4.2 a show-scoped grantee also received the club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 4.2 a show-scoped grantee does not receive the club-less show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The owner-run view (MYK9-329)
--
-- view_authenticated_entry_results is security_invoker = false, so RLS on
-- entries is not a backstop: its own can_manage flag is the only gate. Until
-- 20260902120000 that flag carried `(sh.club_id IS NULL AND has_manager_role)`,
-- which cases 1-4 above cannot see because they exercise the SQL helpers, not
-- the view. A secretary of club A got can_manage (and can_view_admin: payment
-- columns) on every club-less show on the platform.
--
-- Three directions, in this order. 5.1 proves the view works for the caller at
-- all (own-club row present WITH its masked payment column visible), otherwise
-- 5.2 "returns nothing" would also pass for a broken view. 5.3 proves the
-- club-less show is still reachable by the one role that should reach it.
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c21',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000c21","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  v_own_rows integer;
  v_own_payment_visible integer;
  v_clubless_rows integer;
BEGIN
  SELECT count(*), count(payment_status)
    INTO v_own_rows, v_own_payment_visible
    FROM public.view_authenticated_entry_results
   WHERE show_id = '00000000-0000-0000-0000-000000000c31';

  IF v_own_rows <> 1 OR v_own_payment_visible <> 1 THEN
    RAISE EXCEPTION
      'FAIL 5.1 club secretary lost their own show in the view (rows %, payment visible %)',
      v_own_rows, v_own_payment_visible;
  END IF;
  RAISE NOTICE 'PASS 5.1 club secretary reads their own show''s payment column through the view';

  SELECT count(*)
    INTO v_clubless_rows
    FROM public.view_authenticated_entry_results
   WHERE show_id = '00000000-0000-0000-0000-000000000c32';

  IF v_clubless_rows <> 0 THEN
    RAISE EXCEPTION
      'FAIL 5.2 club secretary reads % row(s) of a club-less show through the view (MYK9-329)',
      v_clubless_rows;
  END IF;
  RAISE NOTICE 'PASS 5.2 club secretary reads nothing of a club-less show through the view';
END;
$$;

-- 5.3 A site admin still reaches the club-less show, payment column and all.
INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000c14',
  'Site',
  'Administrator',
  '00000000-0000-0000-0000-000000000c24'
);

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c14',
  id,
  true,
  '00000000-0000-0000-0000-000000000c24'
FROM public.roles
WHERE name = 'site_admin';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c24',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000c24","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  v_rows integer;
  v_payment_visible integer;
BEGIN
  SELECT count(*), count(payment_status)
    INTO v_rows, v_payment_visible
    FROM public.view_authenticated_entry_results
   WHERE show_id = '00000000-0000-0000-0000-000000000c32';

  IF v_rows <> 1 OR v_payment_visible <> 1 THEN
    RAISE EXCEPTION
      'FAIL 5.3 site admin lost the club-less show in the view (rows %, payment visible %)',
      v_rows, v_payment_visible;
  END IF;
  RAISE NOTICE 'PASS 5.3 site admin still reads the club-less show''s payment column';
END;
$$;

ROLLBACK;
