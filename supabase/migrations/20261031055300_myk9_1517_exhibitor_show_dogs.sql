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
-- Soft-deleted shows, classes, trials and dogs expose nothing, and the access
-- decision reads the same live-entry set as the listing (one definition).
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
  run_position integer,
  check_in_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_passcode boolean := false;
  -- Entries in these states are not running; a NULL status counts as live.
  v_excluded constant text[] :=
    ARRAY['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'];
BEGIN
  IF p_show_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- A soft-deleted (or unknown) show has no roster, for anyone.
  IF NOT EXISTS (
    SELECT 1 FROM public.shows s WHERE s.id = p_show_id AND s.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Passcode session: the claim must name this show and be the current generation.
  v_passcode :=
    (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
    AND nullif(auth.jwt() -> 'app_metadata' ->> 'show_id', '') = p_show_id::text
    AND public.ringside_claim_generation_current() IS TRUE;

  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  -- "Live entry" is defined ONCE, in `live`, and both the access decision and the
  -- listing read it, so the caller can never be admitted by an entry the listing
  -- would not show: not deleted, not in a non-running state, and its dog, class and
  -- trial all live.
  RETURN QUERY
  WITH live AS MATERIALIZED (
    SELECT
      e.id AS entry_id,
      e.armband AS entry_armband,
      e.handler AS entry_handler,
      e.handler_id,
      e.class_id AS entry_class_id,
      e.run_order,
      e.check_in_status AS entry_check_in,
      e.is_scored AS entry_is_scored,
      e.is_in_ring AS entry_is_in_ring,
      d.call_name AS dog_call_name,
      d.name AS dog_name,
      d.breed AS dog_breed,
      d.owner_id,
      d.co_owner_id,
      c.name AS cls_name,
      t.name AS trial_name,
      t.date AS trial_date
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id AND d.deleted_at IS NULL
    LEFT JOIN public.classes c ON c.id = e.class_id AND c.deleted_at IS NULL
    LEFT JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
    WHERE e.show_id = p_show_id
      AND e.deleted_at IS NULL
      AND (e.class_id IS NULL OR (c.id IS NOT NULL AND t.id IS NOT NULL))
      AND coalesce(e.entry_status, '') <> ALL (v_excluded)
  ),
  ranked AS (
    -- Place in line (1 = next), by the shared queue rules (runQueue.ts pendingByRunOrder,
    -- mirrored in push-trigger-run-proximity): only a dog still WAITING has a place. A
    -- scored, in-ring, pulled or otherwise finished dog has none (NULL; the check-in
    -- status says what it is). No score value is read out, only whether the dog is
    -- still due to run.
    SELECT
      k.*,
      CASE WHEN k.waiting THEN row_number() OVER (
        PARTITION BY k.entry_class_id, k.waiting
        ORDER BY coalesce(nullif(k.run_order, 0), k.armband_key), k.armband_key, k.entry_id
      ) END AS run_position
    FROM (
      SELECT
        l.*,
        CASE WHEN l.entry_armband ~ '^[0-9]{1,9}$' THEN l.entry_armband::integer
             ELSE 2147483647 END AS armband_key,
        (
          NOT coalesce(l.entry_is_scored, false)
          AND NOT coalesce(l.entry_is_in_ring, false)
          AND coalesce(l.entry_check_in, 'no-status') IN
            ('no-status', 'checked-in', 'at-gate', 'come-to-gate', 'conflict')
        ) AS waiting
      FROM live l
    ) k
  )
  SELECT
    r.entry_armband::integer,
    coalesce(nullif(btrim(r.dog_call_name), ''), r.dog_name)::text,
    r.dog_breed::text,
    r.entry_handler::text,
    r.entry_class_id,
    r.cls_name::text,
    r.trial_name::text,
    r.trial_date,
    r.run_position::integer,
    coalesce(r.entry_check_in, 'no-status')::text
  FROM ranked r
  WHERE (
      v_passcode
      OR (
        v_person_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM live l
          WHERE l.handler_id = v_person_id
             OR l.owner_id = v_person_id
             OR l.co_owner_id = v_person_id
        )
      )
    )
    AND r.entry_armband ~ '^[0-9]{1,9}$'
    AND r.entry_armband::integer > 0
  ORDER BY r.entry_armband::integer, r.trial_date, r.cls_name, r.entry_class_id, r.entry_id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000);
END;
$$;

COMMENT ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) IS
  'MYK9-1517. Owner-approved limited view of the show''s dogs for exhibitors and passcode sessions: armband, call name, breed, handler name, class, run-order position, check-in status. No contact, fee, payment, registration or score data. Zero rows unless the caller has a live entry in the show or a current passcode claim for it. Paged, at most 1000 rows per call.';

-- anon and PUBLIC get EXECUTE by default; revoke both explicitly. A passcode
-- session is an authenticated (anonymous-sign-in) JWT, so authenticated covers it.
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO service_role;
