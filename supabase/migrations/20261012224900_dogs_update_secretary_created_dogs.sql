-- A secretary may edit a dog she brought into the platform, not only one already
-- entered in her show.
--
-- Incident (2026-10-12): a secretary keying in a mail-in entry fixed a dog's date of
-- birth before the entry existed. dogs_select lets every secretary read every dog
-- (MYK9-854, so she can find a mailed-in dog at all), but dogs_update only admitted the
-- owner, the co-owner, a site admin, or a manager of a show the dog is ALREADY entered in.
-- The edit was saved locally, then refused by the server on every upload and every Retry
-- ("We couldn't update this dog"). MYK9-1112 made the add-entry flow's Edit open the real
-- Edit Dog panel, which put this refusal on the normal mail-in path.
--
-- Two arms are added, both narrow:
--   * created_from_show_id is a show the caller can manage. The add-entry flow stamps it
--     (MYK9-1059) and guard_creation_attribution drops it on INSERT unless the caller can
--     manage that show, and freezes it on UPDATE, so it cannot be forged to gain access.
--   * created_by is the caller AND the caller still holds a staff role (the same role
--     list dogs_insert_secretary admits). created_by is stamped from auth.uid() on INSERT
--     and frozen on UPDATE by the same trigger. Requiring a current staff role keeps the
--     access tied to the appointment rather than outliving it.
-- An exhibitor-owned dog with no tie to the secretary's shows stays read-only to her: it
-- is the owner's record. The client asks can_edit_dog() before offering Edit, so it never
-- offers a save this policy refuses.
--
-- The whole rule lives in ONE function, dog_edit_allowed(), used by the policy (USING and
-- WITH CHECK, fed the row's own columns, so it never re-reads public.dogs from inside a
-- dogs policy under FORCE RLS) and by can_edit_dog(), the UI's question.

CREATE OR REPLACE FUNCTION public.dog_edit_allowed(
  p_dog_id uuid,
  p_owner_id uuid,
  p_co_owner_id uuid,
  p_created_by uuid,
  p_created_from_show_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    (p_owner_id IS NOT NULL AND p_owner_id = (SELECT public.get_my_person_id()))
    OR (p_co_owner_id IS NOT NULL AND p_co_owner_id = (SELECT public.get_my_person_id()))
    OR (SELECT public.is_site_admin())
    OR public.can_manage_show_dog(p_dog_id)
    OR (
      p_created_from_show_id IS NOT NULL
      AND public.can_manage_show(p_created_from_show_id)
    )
    OR (
      p_created_by IS NOT NULL
      AND p_created_by = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.auth_user_id = (SELECT auth.uid())
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
          AND r.name IN ('secretary', 'club_admin', 'site_admin', 'platform_admin')
      )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.dog_edit_allowed(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dog_edit_allowed(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- The UI's question: "may I edit this dog?". SECURITY INVOKER on purpose: it reads the
-- dog under the caller's own dogs_select, because an UPDATE that returns the row (as the
-- replication queue's does) needs SELECT on it too. NULL, not false, when no row comes
-- back: a dog created on a device and not uploaded yet is not on the server, and "not
-- here yet" must not read as "no" (the client treats NULL as unanswered).
CREATE OR REPLACE FUNCTION public.can_edit_dog(p_dog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT public.dog_edit_allowed(d.id, d.owner_id, d.co_owner_id, d.created_by, d.created_from_show_id)
  FROM public.dogs d
  WHERE d.id = p_dog_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_edit_dog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_dog(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "dogs_update" ON public.dogs;
CREATE POLICY "dogs_update" ON public.dogs
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.dog_edit_allowed(dogs.id, dogs.owner_id, dogs.co_owner_id, dogs.created_by, dogs.created_from_show_id))
  )
  WITH CHECK (
    (SELECT public.dog_edit_allowed(dogs.id, dogs.owner_id, dogs.co_owner_id, dogs.created_by, dogs.created_from_show_id))
  );
