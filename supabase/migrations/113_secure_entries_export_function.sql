-- =============================================================================
-- Migration 113: Secure entries export via SECURITY DEFINER function
-- =============================================================================
-- Problem: getEntriesForExport fetches owner PII (email, phone, name) via a
-- direct entries SELECT query. The entries table RLS is USING (true) for all
-- authenticated users, so any authenticated user can hit the Supabase REST API
-- with an arbitrary show_id and dump all registrant PII.
--
-- Solution: Move the export query into a SECURITY DEFINER function that checks
-- is_trial_secretary(club_id) before returning data. The function runs as the
-- definer (bypassing RLS) but enforces authorization explicitly. The general
-- entries SELECT RLS stays unchanged (myK9Q depends on it).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_entries_for_export(p_show_id UUID)
RETURNS TABLE (
  id                  UUID,
  armband             TEXT,
  handler             TEXT,
  payment_status      TEXT,
  entry_status        TEXT,
  entry_fee           NUMERIC,
  submitted_at        TIMESTAMPTZ,
  special_requests    TEXT,
  jump_height         TEXT,
  run_order           INT,
  dog_id              UUID,
  dog_name            TEXT,
  dog_call_name       TEXT,
  dog_breed           TEXT,
  owner_first_name    TEXT,
  owner_last_name     TEXT,
  owner_email         TEXT,
  owner_phone         TEXT,
  dog_registrations   JSONB,
  class_name          TEXT,
  class_number        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Authorization: must be platform admin or trial secretary for this show's club
  IF NOT (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = p_show_id
        AND (SELECT public.is_trial_secretary(s.club_id))
    )
  ) THEN
    RETURN; -- empty result set, not an error
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.armband,
    e.handler,
    e.payment_status,
    e.entry_status,
    e.entry_fee,
    e.submitted_at,
    e.special_requests,
    e.jump_height,
    e.run_order,
    d.id                AS dog_id,
    d.name              AS dog_name,
    d.call_name         AS dog_call_name,
    d.breed             AS dog_breed,
    op.first_name       AS owner_first_name,
    op.last_name        AS owner_last_name,
    op.email            AS owner_email,
    op.phone            AS owner_phone,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'organization',        dr.organization,
            'registration_number', dr.registration_number
          )
          ORDER BY dr.organization
        )
        FROM public.dog_registrations dr
        WHERE dr.dog_id = d.id
      ),
      '[]'::jsonb
    )                   AS dog_registrations,
    c.name              AS class_name,
    c.class_number
  FROM public.entries e
  LEFT JOIN public.dogs         d  ON d.id  = e.dog_id
  LEFT JOIN public.people       op ON op.id = d.owner_id
  LEFT JOIN public.classes      c  ON c.id  = e.class_id
  WHERE e.show_id    = p_show_id
    AND e.deleted_at IS NULL
  ORDER BY e.armband ASC NULLS LAST;
END;
$$;

-- Grant execute to authenticated users (function enforces its own auth check)
GRANT EXECUTE ON FUNCTION public.get_entries_for_export(UUID) TO authenticated;
