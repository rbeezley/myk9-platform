-- Restrict armband writes to users who can manage the target show.
--
-- Early RLS left "armbands_all" open to every authenticated user. Later
-- manager-scoped policies were added, but the broad policy still made direct
-- client upserts effectively cross-show writable. Keep public read behavior,
-- but require can_manage_show(show_id) for insert/update/delete.

DROP POLICY IF EXISTS "armbands_all" ON public.armbands;
DROP POLICY IF EXISTS "secretaries_manage_armbands" ON public.armbands;

CREATE POLICY "show_managers_insert_armbands"
ON public.armbands
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "show_managers_update_armbands"
ON public.armbands
FOR UPDATE
TO authenticated
USING ((SELECT public.can_manage_show(show_id)))
WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "show_managers_delete_armbands"
ON public.armbands
FOR DELETE
TO authenticated
USING ((SELECT public.can_manage_show(show_id)));
