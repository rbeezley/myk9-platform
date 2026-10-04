-- MYK9-1008: a show must belong to a club.
--
-- 20261004174300 made shows.club_id NOT NULL and removed the MYK9-258
-- `s.club_id IS NOT NULL AND …` guards from ten SQL functions and 23 RLS
-- policies. Those guards existed because is_trial_secretary(check_club_id) and
-- is_club_admin(check_club_id) read a NULL argument as "any club": a club-less
-- show matched every active secretary and club admin on the platform (MYK9-258,
-- found on staging by the G9 rehearsal).
--
-- This file asserts two things:
--
--   0. The database refuses a show without a club: an INSERT that omits
--      club_id, an INSERT that passes NULL (also as a club admin through RLS),
--      an UPDATE that clears it, and create_show_with_children without one.
--      Each refusal is paired with the same statement WITH a club succeeding,
--      so "refused" cannot mean "this statement is broken for everyone".
--
--   1-5. The functions the migration rewrote still scope by club. Every case
--      asserts BOTH directions against a show in club C, where no fixture
--      identity holds a role: the caller reaches their own club's show, and
--      does not reach club C's. A guard removal that also dropped the club
--      filter (or a NOT NULL that silently never applied) fails here.
--      cross_club_policy_authorization_test.sql is the RLS-policy half.
--
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000c01', 'MYK9-258 Club A'),
  -- Club C hosts the cross-club show. No fixture identity holds a role here.
  ('00000000-0000-0000-0000-000000000c03', 'MYK9-1008 Club C');

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

-- One show in club A, and one in club C (nobody's club). `organization` is
-- NOT NULL with no default (migration 040 renamed the original required `type`
-- column), so omitting it aborts the whole test file before any assertion runs.
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
    'MYK9-1008 Club C Show',
    'AKC',
    '00000000-0000-0000-0000-000000000c03',
    'published',
    DATE '2026-09-01',
    DATE '2026-09-02'
  );

-- An entry on EACH show. Without one on the club C show, case 1.6 passes
-- against a broken function too — an empty export and a denied export are
-- indistinguishable — so the assertion would certify nothing.
-- payment_status / entry_fee are the `can_view_admin`-masked columns case 5
-- reads back through view_authenticated_entry_results; without a value the
-- "column is masked" and "column is empty" outcomes are indistinguishable.
INSERT INTO public.entries (id, show_id, armband, payment_status, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000000c51', '00000000-0000-0000-0000-000000000c31', '101', 'paid', 25),
  ('00000000-0000-0000-0000-000000000c52', '00000000-0000-0000-0000-000000000c32', '201', 'paid', 35);

-- ---------------------------------------------------------------------------
-- 0. A show without a club is refused
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (SELECT attnotnull FROM pg_attribute
           WHERE attrelid = 'public.shows'::regclass AND attname = 'club_id') THEN
    RAISE EXCEPTION 'FAIL 0.0 shows.club_id is nullable';
  END IF;
  IF (SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'public.shows'::regclass AND conname = 'shows_club_id_fkey')
     IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'FAIL 0.0 shows_club_id_fkey is not ON DELETE RESTRICT';
  END IF;
  RAISE NOTICE 'PASS 0.0 shows.club_id is NOT NULL and its FK is ON DELETE RESTRICT';
END;
$$;

-- 0.1 / 0.2 The migration/seed session (no SET ROLE, so no RLS and no
-- API-role trigger carve-outs): an omitted club and an explicit NULL.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.shows (id, name, organization, status, start_date, end_date)
    VALUES ('00000000-0000-0000-0000-000000000c61', 'MYK9-1008 No Club', 'AKC',
            'draft', DATE '2026-09-01', DATE '2026-09-02');
    RAISE EXCEPTION 'FAIL 0.1 a show with no club_id was inserted';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 0.1 a show that omits club_id is refused (23502)';
  END;

  BEGIN
    INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
    VALUES ('00000000-0000-0000-0000-000000000c62', 'MYK9-1008 Null Club', 'AKC',
            NULL, 'draft', DATE '2026-09-01', DATE '2026-09-02');
    RAISE EXCEPTION 'FAIL 0.2 a show with club_id NULL was inserted';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 0.2 a show with club_id NULL is refused (23502)';
  END;

  -- 0.3 An existing show cannot have its club cleared.
  BEGIN
    UPDATE public.shows SET club_id = NULL
     WHERE id = '00000000-0000-0000-0000-000000000c31';
    RAISE EXCEPTION 'FAIL 0.3 an UPDATE cleared a show''s club';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 0.3 clearing a show''s club is refused (23502)';
  END;
  IF (SELECT club_id FROM public.shows WHERE id = '00000000-0000-0000-0000-000000000c31')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000000c01'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.3 club A''s show lost its club';
  END IF;
END;
$$;

-- 0.4 / 0.5 Club A's admin through the API role. shows_insert no longer
-- carries the `club_id IS NOT NULL` guard, and is_club_admin(NULL) answers
-- "club admin anywhere?", so the policy admits a NULL club: the column is what
-- refuses it now. The positive control is the same INSERT with the admin's own
-- club, which must succeed.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c22', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000c22","role":"authenticated","app_metadata":{}}',
  true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
    VALUES ('00000000-0000-0000-0000-000000000c63', 'MYK9-1008 API Null Club', 'AKC',
            NULL, 'draft', DATE '2026-09-01', DATE '2026-09-02');
    RAISE EXCEPTION 'FAIL 0.4 a club admin inserted a show with no club';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 0.4 a club admin''s show with no club is refused (23502)';
  END;

  INSERT INTO public.shows (id, name, organization, club_id, status, start_date, end_date)
  VALUES ('00000000-0000-0000-0000-000000000c64', 'MYK9-1008 API Own Club', 'AKC',
          '00000000-0000-0000-0000-000000000c01', 'draft', DATE '2026-09-01', DATE '2026-09-02');
  RAISE NOTICE 'PASS 0.5 the same club admin still inserts a show in their own club';
END;
$$;

-- 0.6 / 0.7 create_show_with_children, the Add Show wizard's online path:
-- refused without a club (its own 22023 check, ahead of every authorization
-- question), and accepted with the admin's club.
DO $$
DECLARE
  v_message text;
  v_created uuid;
BEGIN
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000c65',
        'name', 'MYK9-1008 RPC No Club',
        'organization', 'AKC',
        'start_date', '2026-09-01',
        'end_date', '2026-09-02',
        'status', 'draft',
        'accept_check_payments', true,
        'accept_cash_payments', true
      ),
      '[]'::jsonb, '[]'::jsonb, ARRAY[]::uuid[]
    );
    RAISE EXCEPTION 'FAIL 0.6 create_show_with_children created a show with no club';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message !~ 'non-null club_id' THEN
      RAISE EXCEPTION 'FAIL 0.6 unexpected message: %', v_message;
    END IF;
    RAISE NOTICE 'PASS 0.6 create_show_with_children refuses a show with no club (22023)';
  END;

  v_created := public.create_show_with_children(
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000c66',
      'name', 'MYK9-1008 RPC Own Club',
      'organization', 'AKC',
      'club_id', '00000000-0000-0000-0000-000000000c01',
      'start_date', '2026-09-01',
      'end_date', '2026-09-02',
      'status', 'draft',
      'accept_check_payments', true,
      'accept_cash_payments', true
    ),
    '[]'::jsonb, '[]'::jsonb, ARRAY[]::uuid[]
  );
  IF v_created IS DISTINCT FROM '00000000-0000-0000-0000-000000000c66'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.7 create_show_with_children did not create the club''s show (got %)', v_created;
  END IF;
  RAISE NOTICE 'PASS 0.7 create_show_with_children still creates a show for the admin''s club';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

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
  v_sees_club_c boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c31'
  ) INTO v_sees_own;
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) INTO v_sees_club_c;

  IF NOT v_sees_own THEN
    RAISE EXCEPTION
      'FAIL 1.1 club secretary lost their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 1.1 club secretary still manages their own club''s show';

  IF v_sees_club_c THEN
    RAISE EXCEPTION
      'FAIL 1.2 club secretary manages club C''s show';
  END IF;
  RAISE NOTICE 'PASS 1.2 club secretary does not manage club C''s show';
END;
$$;

DO $$
BEGIN
  IF NOT public.can_manage_show('00000000-0000-0000-0000-000000000c31') THEN
    RAISE EXCEPTION 'FAIL 1.3 can_manage_show denied the secretary their own show';
  END IF;
  RAISE NOTICE 'PASS 1.3 can_manage_show admits the secretary to their own show';

  IF public.can_manage_show('00000000-0000-0000-0000-000000000c32') THEN
    RAISE EXCEPTION 'FAIL 1.4 can_manage_show admitted club C''s show';
  END IF;
  RAISE NOTICE 'PASS 1.4 can_manage_show rejects club C''s show';

  IF public.is_show_office_manager('00000000-0000-0000-0000-000000000c32') THEN
    RAISE EXCEPTION
      'FAIL 1.5 is_show_office_manager admitted club C''s show';
  END IF;
  RAISE NOTICE 'PASS 1.5 is_show_office_manager rejects club C''s show';

  -- get_entries_for_export returns owner email and phone: a show outside the
  -- caller's club must export nothing.
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
      'FAIL 1.6b get_entries_for_export returned rows for club C''s show';
  END IF;
  RAISE NOTICE 'PASS 1.6b get_entries_for_export returns nothing for club C''s show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The club admin — separate arm (is_club_admin)
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000c22',
  true
);

DO $$
DECLARE
  v_sees_own boolean;
  v_sees_club_c boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c31'
  ) INTO v_sees_own;
  SELECT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) INTO v_sees_club_c;

  IF NOT v_sees_own THEN
    RAISE EXCEPTION 'FAIL 2.1 club admin lost their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 2.1 club admin still manages their own club''s show';

  IF v_sees_club_c THEN
    RAISE EXCEPTION
      'FAIL 2.2 club admin manages club C''s show';
  END IF;
  RAISE NOTICE 'PASS 2.2 club admin does not manage club C''s show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. A trial under club C's show
--
-- can_manage_trial reaches the club through the trial's show, one join away.
-- ---------------------------------------------------------------------------
-- `trials` uses `date` (not `trial_date`) and requires `name`.
INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000000c41',
  '00000000-0000-0000-0000-000000000c32',
  'MYK9-1008 Club C Trial',
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
      'FAIL 3.1 can_manage_trial admitted a trial of club C''s show';
  END IF;
  RAISE NOTICE 'PASS 3.1 can_manage_trial rejects a trial of club C''s show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The show-scoped arm grants nothing across clubs
--
-- The label/permission split made a show-scoped user_roles row paperwork: it
-- carries no permission, and appointment to the owning club is the only thing
-- that grants access. So club B's secretary, holding a show-scoped grant on
-- club A's show, must NOT reach it (4.1), and must not reach club C's show
-- either (4.2). 4.0 is the positive control: their own club's show.
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

  -- Nor does club B's secretary role reach club C's show.
  IF EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) THEN
    RAISE EXCEPTION
      'FAIL 4.2 club B''s secretary received club C''s show';
  END IF;
  RAISE NOTICE 'PASS 4.2 club B''s secretary does not receive club C''s show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The owner-run view (MYK9-329)
--
-- view_authenticated_entry_results is security_invoker = false, so RLS on
-- entries is not a backstop: its own can_manage flag is the only gate, and
-- cases 1-4 above cannot see it because they exercise the SQL helpers, not the
-- view.
--
-- Three directions, in this order. 5.1 proves the view works for the caller at
-- all (own-club row present WITH its masked payment column visible), otherwise
-- 5.2 "returns nothing" would also pass for a broken view. 5.3 proves club C's
-- show is still reachable by the one fixture role that should reach it.
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
  v_club_c_rows integer;
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
    INTO v_club_c_rows
    FROM public.view_authenticated_entry_results
   WHERE show_id = '00000000-0000-0000-0000-000000000c32';

  IF v_club_c_rows <> 0 THEN
    RAISE EXCEPTION
      'FAIL 5.2 club secretary reads % row(s) of club C''s show through the view (MYK9-329)',
      v_club_c_rows;
  END IF;
  RAISE NOTICE 'PASS 5.2 club secretary reads nothing of club C''s show through the view';
END;
$$;

-- 5.3 A site admin still reaches club C's show, payment column and all.
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
      'FAIL 5.3 site admin lost club C''s show in the view (rows %, payment visible %)',
      v_rows, v_payment_visible;
  END IF;
  RAISE NOTICE 'PASS 5.3 site admin still reads club C''s show''s payment column';
END;
$$;

ROLLBACK;
