-- Fix 42P17 infinite recursion between dogs_select and entries_select.
--
-- Context: 20260611130000 added a handler-visibility branch to dogs_select as an
-- inline `EXISTS (SELECT 1 FROM public.entries …)`. Its safety comment reasoned
-- that entries_select's OR branches short-circuit at runtime before reaching the
-- branch that joins dogs. That reasoning is wrong: Postgres detects policy
-- recursion STRUCTURALLY at query-rewrite time. Any table referenced inside a
-- policy gets its own policies inlined recursively before execution, so
--   dogs_select → entries → entries_select → dogs → dogs_select → …
-- raises "infinite recursion detected in policy for relation \"dogs\"" (42P17)
-- on EVERY authenticated read of dogs or entries, regardless of which OR branch
-- would win at runtime. This broke the dogs/entries replication sync app-wide.
--
-- Fix: move the entries lookup into a SECURITY DEFINER helper. A function body
-- is opaque to the rewriter (no structural reference), and at runtime the
-- function executes as its owner (postgres), which has BYPASSRLS — verified
-- `rolbypassrls = t` on this project 2026-06-12 — so the entries read inside it
-- applies no RLS at all. FORCE ROW LEVEL SECURITY on entries does not defeat
-- BYPASSRLS (it only removes the table-OWNER exemption). Note this corrects the
-- 20260611120000 comment claiming SECURITY DEFINER cannot escape FORCE RLS.
--
-- Performance: the helper is parameterless/uncorrelated (returns the set of
-- dog_ids the current user handles), and the policy consumes it as
-- `id IN (SELECT …)` — an uncorrelated hashed SubPlan evaluated ONCE per
-- statement. This preserves 20260611120000's no-per-row-function-calls intent;
-- a correlated has_entry_for_dog(dogs.id) helper would have reintroduced the
-- O(N) per-row pattern that caused the original statement timeouts.

BEGIN;

-- Set of dog ids the current user is entered to handle (live entries only).
-- SECURITY DEFINER + owner BYPASSRLS: the entries read here is invisible to
-- the RLS rewriter and unfiltered at runtime — this is what breaks the cycle.
-- STABLE so the `IN (SELECT …)` call site is evaluated once per statement.
CREATE OR REPLACE FUNCTION public.get_my_handled_dog_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT e.dog_id
  FROM public.entries e
  WHERE e.handler_id = public.get_my_person_id()
    AND e.deleted_at IS NULL
    AND e.dog_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.get_my_handled_dog_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_handled_dog_ids() TO authenticated;

-- Same four branches as 20260611130000, with the inline entries EXISTS
-- replaced by the helper. Owner/co-owner/staff behavior is unchanged.
DROP POLICY IF EXISTS dogs_select ON public.dogs;
CREATE POLICY dogs_select ON public.dogs
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id      = (SELECT public.get_my_person_id())
      OR co_owner_id = (SELECT public.get_my_person_id())
      OR (SELECT public.is_show_manager())
      OR id IN (SELECT public.get_my_handled_dog_ids())
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
