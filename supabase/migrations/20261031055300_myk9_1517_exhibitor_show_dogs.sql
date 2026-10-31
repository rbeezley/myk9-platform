-- MYK9-1517: an exhibitor sees a limited view of every dog at their show.
--
-- Exhibitor RLS limits the replica to the caller's own entries (MYK9-1184), so an
-- exhibitor cannot browse the show's dogs to favorite a friend's. This adds ONE
-- SECURITY DEFINER function that returns only the owner-approved columns
-- (2026-10-30): armband, call name, breed, handler name, class membership,
-- run-order position and check-in status. Never contact details, owner address,
-- fees, payment status or registration numbers, and no score or result field at
-- all, so result-visibility rules cannot be bypassed through it.
--
-- Callable only by (a) a signed-in caller with a live entry in THAT show (as
-- handler, owner or co-owner: the same arms as is_show_exhibitor) or (b) a
-- ringside passcode session whose claim names that show and whose generation is
-- current. Anyone else, and anyone asking about another show, gets zero rows.
-- Rows come in pages of at most 1000 (p_limit is clamped to 1..1000, matching
-- PostgREST's max_rows so a page is never silently truncated), in a stable order;
-- the client asks for the next page with p_offset until a short page returns.
--
-- Rejected alternatives: a view or a broadened `entries` policy (wider surface;
-- PostgREST embeds would leak columns). Staff access is unchanged.
--
-- Only entries with their own `entries.armband` are listed. The favorites alert
-- consumers (the in-app monitor and push-trigger-run-proximity) match on that column
-- alone, so listing a dog whose number lives only in the `armbands` table would offer
-- a heart that can never alert. Widening both consumers is a follow-up. A dog with no
-- call name is shown by its registered name.

CREATE OR REPLACE FUNCTION public.show_dogs_limited_view(
  p_show_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  armband integer,
  call_name text,
  breed text,
  handler_name text,
  class_id uuid,
  class_name text,
  trial_name text,
  trial_date date,
  run_order integer,
  check_in_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_authorized boolean := false;
BEGIN
  IF p_show_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Passcode session: the claim must name this show and be the current generation.
  IF (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
     AND nullif(auth.jwt() -> 'app_metadata' ->> 'show_id', '') = p_show_id::text
     AND public.ringside_claim_generation_current() IS TRUE THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    SELECT p.id INTO v_person_id
    FROM public.people p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;

    IF v_person_id IS NOT NULL THEN
      -- A live entry of this show as handler, owner or co-owner.
      v_authorized := EXISTS (
        SELECT 1
        FROM public.entries e
        LEFT JOIN public.dogs od ON od.id = e.dog_id
        WHERE e.show_id = p_show_id
          AND e.deleted_at IS NULL
          AND e.entry_status NOT IN ('withdrawn', 'scratched')
          AND (
            e.handler_id = v_person_id
            OR od.owner_id = v_person_id
            OR od.co_owner_id = v_person_id
          )
      );
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.armband::integer,
    coalesce(nullif(btrim(d.call_name), ''), d.name)::text,
    d.breed::text,
    e.handler::text,
    e.class_id,
    c.name::text,
    t.name::text,
    t.date,
    e.run_order::integer,
    coalesce(e.check_in_status, 'no-status')::text
  FROM public.entries e
  LEFT JOIN public.dogs d ON d.id = e.dog_id
  LEFT JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.trials t ON t.id = c.trial_id
  WHERE e.show_id = p_show_id
    AND e.deleted_at IS NULL
    AND e.armband ~ '^[0-9]{1,9}$'
    AND e.armband::integer > 0
    AND coalesce(e.entry_status, '') NOT IN
      ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
  ORDER BY e.armband::integer, t.date, c.name, e.class_id, e.id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000);
END;
$$;

COMMENT ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) IS
  'MYK9-1517. Owner-approved limited view of the show''s dogs for exhibitors and passcode sessions: armband, call name, breed, handler name, class, run order, check-in status. No contact, fee, payment, registration or score data. Zero rows unless the caller has a live entry in the show or a current passcode claim for it. Paged, at most 1000 rows per call.';

-- anon and PUBLIC get EXECUTE by default; revoke both explicitly. A passcode
-- session is an authenticated (anonymous-sign-in) JWT, so authenticated covers it.
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO service_role;
