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
INSERT INTO public.shows (id, name, club_id, status, start_date, end_date)
VALUES
  (
    '00000000-0000-0000-0000-000000000c31',
    'MYK9-258 Club A Show',
    '00000000-0000-0000-0000-000000000c01',
    'published',
    DATE '2026-09-01',
    DATE '2026-09-02'
  ),
  (
    '00000000-0000-0000-0000-000000000c32',
    'MYK9-258 Club-less Show',
    NULL,
    'published',
    DATE '2026-09-01',
    DATE '2026-09-02'
  );

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
  IF EXISTS (
    SELECT 1 FROM public.get_entries_for_export('00000000-0000-0000-0000-000000000c32')
  ) THEN
    RAISE EXCEPTION
      'FAIL 1.6 get_entries_for_export returned rows for a club-less show (MYK9-258)';
  END IF;
  RAISE NOTICE 'PASS 1.6 get_entries_for_export returns nothing for a club-less show';
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
INSERT INTO public.trials (id, show_id, trial_date, trial_number)
VALUES (
  '00000000-0000-0000-0000-000000000c41',
  '00000000-0000-0000-0000-000000000c32',
  DATE '2026-09-01',
  1
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
-- 4. A show-scoped grant still reaches a club-less show
--
-- The show-scoped arm matches on ur.show_id and says nothing about clubs, so it
-- must keep working. Without this the guard could hide the show from someone
-- explicitly granted it — the opposite failure, equally wrong.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000c11',
  id,
  '00000000-0000-0000-0000-000000000c32',
  true,
  '00000000-0000-0000-0000-000000000c21'
FROM public.roles
WHERE name = 'secretary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.manageable_show_ids() m
    WHERE m = '00000000-0000-0000-0000-000000000c32'
  ) THEN
    RAISE EXCEPTION
      'FAIL 4.1 an explicit show-scoped grant no longer reaches a club-less show';
  END IF;
  RAISE NOTICE 'PASS 4.1 an explicit show-scoped grant still reaches a club-less show';
END;
$$;

ROLLBACK;
