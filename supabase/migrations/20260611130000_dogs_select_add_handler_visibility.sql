-- Migration 20260611130000: Expose dogs to non-owner handlers
--
-- Context: 20260611120000 tightened dogs_select to owner/co_owner/staff only.
-- A secretary can assign a handler to a dog the handler doesn't own; those
-- entries are visible via entries_select (handler_id branch), but the handler
-- can no longer read the linked dogs row to populate dog details in the UI.
--
-- Fix: add a fourth branch — if the user has a live entry as handler for
-- this dog, the dog is visible to them.
--
-- Circular-dependency safety (entries has FORCE ROW LEVEL SECURITY):
-- The EXISTS inner query filters strictly by `handler_id = get_my_person_id()`.
-- Any entry row matching that filter also satisfies entries_select branch 2
-- (EXISTS on people WHERE p.id = handler_id AND p.auth_user_id = uid()),
-- which short-circuits the OR before reaching branch 3 (the dogs JOIN that
-- would re-enter dogs_select). So the entries read here never causes
-- entries_select to re-read dogs, and there is no 42P17 recursion.

DROP POLICY IF EXISTS dogs_select ON public.dogs;
CREATE POLICY dogs_select ON public.dogs
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id      = (SELECT public.get_my_person_id())
      OR co_owner_id = (SELECT public.get_my_person_id())
      OR (SELECT public.is_show_manager())
      OR EXISTS (
        SELECT 1 FROM public.entries e
        WHERE e.dog_id     = dogs.id
          AND e.handler_id = (SELECT public.get_my_person_id())
          AND e.deleted_at IS NULL
      )
    )
  );

NOTIFY pgrst, 'reload schema';
