-- MYK9-1388 (migration 20261029041300): soft-deleting a club deactivates the
-- role grants scoped to it; restore is role-neutral; no active grant can exist
-- for a deleted club.
--
-- Properties asserted here:
--   * deleting club A deactivates the active club_admin grant on A;
--   * the same user's grant on club B is untouched;
--   * a grant on A that was already inactive stays inactive, and the delete
--     does not write user_roles.deactivated_at (that column records person
--     deletes only);
--   * an active grant for a deleted club is refused on INSERT, on reactivation
--     and on moving a grant onto the deleted club;
--   * restoring A reactivates nothing, including a grant whose person was
--     deleted and restored while A was deleted (Codex P1, round 2);
--   * after restore, a fresh grant on A is accepted again;
--   * backfill: running the migration's backfill statement deactivates an
--     active grant whose club was deleted before the trigger existed.
--
-- The trigger fires on any writer of clubs.deleted_at, so the fixtures write it
-- as postgres, like the other soft-delete fixtures. All fixtures roll back.
-- The concurrent grant-vs-delete race is serialised by FOR SHARE on the club
-- row; a single psql session cannot interleave two transactions, so that part
-- is argued in the migration header, not asserted here.
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;
SET LOCAL TIME ZONE 'UTC';

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000138801', NULL, 'MYK9-1388', 'Secretary', 'myk91388-sec@example.test'),
  ('00000000-0000-0000-0000-000000138802', NULL, 'MYK9-1388', 'Other', 'myk91388-other@example.test'),
  ('00000000-0000-0000-0000-000000138803', NULL, 'MYK9-1388', 'Removed', 'myk91388-removed@example.test');

INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000000138811', 'MYK9-1388 Club A', now()),
  ('00000000-0000-0000-0000-000000138812', 'MYK9-1388 Club B', now()),
  ('00000000-0000-0000-0000-000000138813', 'MYK9-1388 Club C', now());

-- Secretary: active club_admin on A and B. Other: club_admin on A, inactive
-- since before any delete. Removed: active club_admin on A, plus one on C.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active)
SELECT p.user_id::uuid, r.id, p.club_id::uuid, p.is_active
FROM (VALUES
  ('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811', true),
  ('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812', true),
  ('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811', false),
  ('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811', true),
  ('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138813', true)
) AS p(user_id, club_id, is_active)
CROSS JOIN public.roles r WHERE r.name = 'club_admin';

-- A legacy show-scoped grant (club_id NULL, show_id set) on a show of club A.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000138821', 'MYK9-1388 Show', 'AKC', current_date, current_date, 'draft',
        '00000000-0000-0000-0000-000000138811');
INSERT INTO public.user_roles (user_id, role_id, show_id, is_active)
SELECT '00000000-0000-0000-0000-000000138801', r.id, '00000000-0000-0000-0000-000000138821', true
FROM public.roles r WHERE r.name = 'steward';

CREATE FUNCTION pg_temp.grant_state(p_user text, p_club text)
RETURNS text LANGUAGE sql AS $$
  SELECT ur.is_active::text || '/' || COALESCE(ur.deactivated_at::text, 'null')
  FROM public.user_roles ur
  WHERE ur.user_id = p_user::uuid AND ur.club_id = p_club::uuid
$$;

-- Delete club A.
UPDATE public.clubs SET deleted_at = '2026-10-01 12:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL club A delete did not deactivate the grant (or wrote deactivated_at): %',
      pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811');
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL club B grant was touched by club A delete';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL the pre-inactive grant changed';
  END IF;
  IF (SELECT is_active FROM public.user_roles
      WHERE show_id = '00000000-0000-0000-0000-000000138821') THEN
    RAISE EXCEPTION 'FAIL club A delete left the show-scoped steward grant active';
  END IF;
  RAISE NOTICE 'PASS delete deactivates only the deleted club''s active grants';
END;
$$;

-- An active grant for the deleted club is refused: insert, reactivation, move.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role_id, club_id, is_active)
    SELECT '00000000-0000-0000-0000-000000138802', r.id,
           '00000000-0000-0000-0000-000000138811', true
    FROM public.roles r WHERE r.name = 'secretary';
    RAISE EXCEPTION 'FAIL inserting an active grant for a deleted club was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS an active grant for a deleted club is refused on insert';
  END;
  BEGIN
    UPDATE public.user_roles SET is_active = true
    WHERE user_id = '00000000-0000-0000-0000-000000138802'
      AND club_id = '00000000-0000-0000-0000-000000138811';
    RAISE EXCEPTION 'FAIL reactivating a grant for a deleted club was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS reactivation for a deleted club is refused';
  END;
  BEGIN
    UPDATE public.user_roles SET is_active = true
    WHERE show_id = '00000000-0000-0000-0000-000000138821';
    RAISE EXCEPTION 'FAIL reactivating a show-scoped grant of a deleted club was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS reactivating a show-scoped grant of a deleted club is refused';
  END;
  BEGIN
    UPDATE public.user_roles SET club_id = '00000000-0000-0000-0000-000000138811'
    WHERE user_id = '00000000-0000-0000-0000-000000138803'
      AND club_id = '00000000-0000-0000-0000-000000138813';
    RAISE EXCEPTION 'FAIL moving an active grant onto a deleted club was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS moving an active grant onto a deleted club is refused';
  END;
END;
$$;

-- While A is deleted, the third person is deleted and then restored.
UPDATE public.people SET deleted_at = '2026-10-02 08:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138803';
UPDATE public.people SET deleted_at = NULL
WHERE id = '00000000-0000-0000-0000-000000138803';

-- Restore club A.
UPDATE public.clubs SET deleted_at = NULL
WHERE id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL restore reactivated a grant; restore must be role-neutral';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL restore reactivated a grant that was inactive before the delete';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL restore reactivated the grant of a person deleted and restored meanwhile: %',
      pg_temp.grant_state('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811');
  END IF;
  RAISE NOTICE 'PASS club restore reactivates nothing';
END;
$$;

-- Once A is live again, an explicit re-grant is accepted.
UPDATE public.user_roles SET is_active = true
WHERE user_id = '00000000-0000-0000-0000-000000138801'
  AND club_id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL a restored club refused an explicit re-grant';
  END IF;
  RAISE NOTICE 'PASS a restored club accepts an explicit re-grant';
END;
$$;

-- Backfill: simulate a club deleted before the trigger existed by disabling it.
ALTER TABLE public.clubs DISABLE TRIGGER trg_clubs_deactivate_role_grants_on_delete;
UPDATE public.clubs SET deleted_at = '2026-10-08 09:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138812';
ALTER TABLE public.clubs ENABLE TRIGGER trg_clubs_deactivate_role_grants_on_delete;

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL fixture: the orphan grant should still be active before the backfill';
  END IF;
END;
$$;

-- The migration's backfill statement, verbatim.
UPDATE public.user_roles AS ur
SET is_active = false
FROM public.clubs AS c
WHERE ur.club_id = c.id
  AND c.deleted_at IS NOT NULL
  AND ur.is_active;

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL backfill did not deactivate the orphan grant';
  END IF;
  RAISE NOTICE 'PASS backfill deactivates grants to already-deleted clubs';
END;
$$;

ROLLBACK;
