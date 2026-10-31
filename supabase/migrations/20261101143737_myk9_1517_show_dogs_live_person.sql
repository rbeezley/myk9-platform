-- MYK9-1517 follow-up (security review 2026-10-31): the account arm of
-- public.show_dogs_limited_view resolved the caller's person by auth_user_id alone, so
-- a suspended person (people.status = 'suspended') or a self-soft-deleted one
-- (people.deleted_at set by soft_delete_person) still read the roster on a request
-- principal that was already valid. The token hook and AuthContext only act at token
-- issue and in the client; they do not stop a SECURITY DEFINER function.
--
-- Only the person lookup changes: it now requires deleted_at IS NULL and
-- status = 'active', the same predicate custom_access_token_hook uses. The independent
-- passcode arm, projection, paging, search_path and ACL are copied unchanged from
-- 20261031055300_myk9_1517_exhibitor_show_dogs.sql (the latest definition).

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
    AND p.deleted_at IS NULL
    AND p.status = 'active'
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
      e.check_in_status AS entry_check_in,
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
    coalesce(r.entry_check_in, 'no-status')::text
  FROM live r
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
    -- CASE, not AND: Postgres does not promise to test the pattern before the
    -- cast, and armband is free text, so one '12A' would fail the whole call.
    AND CASE WHEN r.entry_armband ~ '^[0-9]{1,9}$' THEN r.entry_armband::integer > 0 ELSE false END
  ORDER BY r.entry_armband::integer, r.trial_date, r.cls_name, r.entry_class_id, r.entry_id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000);
END;
$$;

COMMENT ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) IS
  'MYK9-1517. Owner-approved limited view of the show''s dogs for exhibitors and passcode sessions: armband, call name, breed, handler name, class, check-in status. No contact, fee, payment, registration or score data. Zero rows unless the caller has a live entry in the show or a current passcode claim for it. Paged, at most 1000 rows per call.';

-- anon and PUBLIC get EXECUTE by default; revoke both explicitly. A passcode
-- session is an authenticated (anonymous-sign-in) JWT, so authenticated covers it.
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO service_role;
