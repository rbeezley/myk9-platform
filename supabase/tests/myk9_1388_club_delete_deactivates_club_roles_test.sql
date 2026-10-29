-- MYK9-1388 (migration 20261029021700): soft-deleting a club deactivates the
-- role grants scoped to it; restoring reactivates exactly those.
--
-- Properties asserted here:
--   * deleting club A deactivates the club_admin grant on A and stamps
--     club_deactivated_at = clubs.deleted_at;
--   * the same user's grant on club B is untouched;
--   * a grant on A that was already inactive before the delete is not stamped;
--   * restoring A reactivates only the grant the delete deactivated; the
--     pre-inactive grant stays inactive;
--   * a person soft-deleted while the club is deleted keeps that revocation: club
--     restore does not reactivate their grant (Codex P1);
--   * an active grant for a deleted club is refused on INSERT and on
--     reactivation, and works again once the club is restored (Codex P2);
--   * a standalone is_active change clears club_deactivated_at (Codex P2);
--   * backfill: running the migration's backfill statement deactivates an
--     active grant whose club was deleted before the trigger existed.
--
-- The trigger fires on any writer of clubs.deleted_at, so the fixtures write it
-- as postgres, like the other soft-delete fixtures. All fixtures roll back.
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
-- since before any delete.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active)
SELECT p.user_id::uuid, r.id, p.club_id::uuid, p.is_active
FROM (VALUES
  ('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811', true),
  ('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812', true),
  ('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811', false),
  ('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811', true)
) AS p(user_id, club_id, is_active)
CROSS JOIN public.roles r WHERE r.name = 'club_admin';

CREATE FUNCTION pg_temp.grant_state(p_user text, p_club text)
RETURNS text LANGUAGE sql AS $$
  SELECT ur.is_active::text || '/' || COALESCE(ur.club_deactivated_at::text, 'null')
  FROM public.user_roles ur
  WHERE ur.user_id = p_user::uuid AND ur.club_id = p_club::uuid
$$;

-- Delete club A.
UPDATE public.clubs SET deleted_at = '2026-10-01 12:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811')
     <> 'false/2026-10-01 12:00:00+00' THEN
    RAISE EXCEPTION 'FAIL club A delete did not deactivate the grant: %',
      pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811');
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL club B grant was touched by club A delete';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL the pre-inactive grant was stamped by the delete';
  END IF;
  RAISE NOTICE 'PASS delete deactivates only the deleted club''s active grants';
END;
$$;

-- The third person is removed while club A is deleted.
UPDATE public.people SET deleted_at = '2026-10-02 08:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138803';

-- An active grant for the deleted club is refused, on insert and on reactivation.
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
END;
$$;

-- Restore club A.
UPDATE public.clubs SET deleted_at = NULL
WHERE id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138811')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL restore did not reactivate the grant the delete deactivated';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL restore reactivated a grant that was inactive before the delete';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811')
     <> 'false/2026-10-01 12:00:00+00' THEN
    RAISE EXCEPTION 'FAIL restore reactivated a grant whose person was deleted meanwhile: %',
      pg_temp.grant_state('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811');
  END IF;
  RAISE NOTICE 'PASS restore reactivates exactly the grants the delete deactivated';
END;
$$;

-- A standalone is_active change clears the club provenance: reactivate the
-- grant on the now-live club A, revoke it by hand, and the stamp stays null.
UPDATE public.user_roles SET is_active = true
WHERE user_id = '00000000-0000-0000-0000-000000138802'
  AND club_id = '00000000-0000-0000-0000-000000138811';
UPDATE public.user_roles SET is_active = true
WHERE user_id = '00000000-0000-0000-0000-000000138803'
  AND club_id = '00000000-0000-0000-0000-000000138811';
UPDATE public.user_roles SET is_active = false
WHERE user_id = '00000000-0000-0000-0000-000000138803'
  AND club_id = '00000000-0000-0000-0000-000000138811';

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138802', '00000000-0000-0000-0000-000000138811')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL a live club accepts a reactivated grant';
  END IF;
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138803', '00000000-0000-0000-0000-000000138811')
     <> 'false/null' THEN
    RAISE EXCEPTION 'FAIL a standalone is_active change must clear club_deactivated_at';
  END IF;
  RAISE NOTICE 'PASS standalone changes clear provenance and live clubs accept grants';
END;
$$;

-- Backfill: simulate a club deleted before the trigger existed by disabling it.
ALTER TABLE public.clubs DISABLE TRIGGER trg_clubs_sync_role_grants_on_delete;
UPDATE public.clubs SET deleted_at = '2026-10-08 09:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000138812';
ALTER TABLE public.clubs ENABLE TRIGGER trg_clubs_sync_role_grants_on_delete;

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'true/null' THEN
    RAISE EXCEPTION 'FAIL fixture: the orphan grant should still be active before the backfill';
  END IF;
END;
$$;

SELECT set_config('myk9.club_role_sync', 'on', true);
UPDATE public.user_roles ur
SET is_active = false, club_deactivated_at = c.deleted_at
FROM public.clubs c
WHERE ur.club_id = c.id
  AND c.deleted_at IS NOT NULL
  AND ur.is_active;
SELECT set_config('myk9.club_role_sync', 'off', true);

DO $$
BEGIN
  IF pg_temp.grant_state('00000000-0000-0000-0000-000000138801', '00000000-0000-0000-0000-000000138812')
     <> 'false/2026-10-08 09:00:00+00' THEN
    RAISE EXCEPTION 'FAIL backfill did not deactivate the orphan grant';
  END IF;
  RAISE NOTICE 'PASS backfill deactivates grants to already-deleted clubs';
END;
$$;

ROLLBACK;
