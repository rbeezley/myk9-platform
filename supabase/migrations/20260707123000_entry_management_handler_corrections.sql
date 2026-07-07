-- Add a handler-correction RPC that works for show managers and preserves
-- exhibitor-scoped behavior for self-service edits.

DROP FUNCTION IF EXISTS public.update_entry_handler_for_entry_management(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.update_entry_handler_for_entry_management(
  p_entry_id uuid,
  p_handler text,
  p_handler_id uuid DEFAULT NULL,
  p_clear_handler_id boolean DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_show_id uuid;
  v_show_club_id uuid;
  v_existing_handler_id uuid;
  v_resolved_handler_id uuid;
  v_is_official boolean;
BEGIN
  SELECT p.id
    INTO v_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: caller is not linked to a person record'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.show_id, e.handler_id, s.club_id
    INTO v_show_id, v_existing_handler_id, v_show_club_id
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry % not found', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(v_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  IF v_is_official THEN
    IF p_handler_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_handler_id) THEN
        RAISE EXCEPTION 'handler % not found', p_handler_id
          USING ERRCODE = '22023';
      END IF;
      v_resolved_handler_id := p_handler_id;
    END IF;

    UPDATE public.entries
       SET handler = p_handler,
           handler_id = CASE
             WHEN v_resolved_handler_id IS NOT NULL THEN v_resolved_handler_id
             WHEN p_clear_handler_id THEN NULL
             ELSE v_existing_handler_id
           END,
           updated_at = now()
     WHERE id = p_entry_id;

    RETURN;
  END IF;

  IF p_handler_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.entries e
      JOIN public.dogs d ON d.id = e.dog_id
     WHERE e.id = p_entry_id
       AND p_handler_id IN (v_person_id, d.owner_id, d.co_owner_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller cannot assign handler %', p_handler_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.entries e
     SET handler = p_handler,
         handler_id = COALESCE(p_handler_id, v_existing_handler_id),
         updated_at = now()
    FROM public.dogs d
   WHERE e.id = p_entry_id
     AND d.id = e.dog_id
     AND (
       e.handler_id = v_person_id
       OR d.owner_id = v_person_id
       OR d.co_owner_id = v_person_id
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized: caller does not own entry %', p_entry_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_entry_handler_for_entry_management(uuid, text, uuid, boolean)
  FROM public;
GRANT EXECUTE ON FUNCTION public.update_entry_handler_for_entry_management(uuid, text, uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
