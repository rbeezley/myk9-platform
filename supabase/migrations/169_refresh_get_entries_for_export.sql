-- Recreate get_entries_for_export to clear stale plan cache after schema changes.
CREATE OR REPLACE FUNCTION public.get_entries_for_export(p_show_id uuid)
RETURNS TABLE(
  id uuid,
  armband text,
  handler text,
  payment_status text,
  entry_status text,
  entry_fee numeric,
  submitted_at timestamp with time zone,
  special_requests text,
  jump_height text,
  run_order integer,
  dog_id uuid,
  dog_name text,
  dog_call_name text,
  dog_breed text,
  owner_first_name text,
  owner_last_name text,
  owner_email text,
  owner_phone text,
  dog_registrations jsonb,
  class_name text,
  class_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = p_show_id
        AND (SELECT public.is_trial_secretary(s.club_id))
    )
  ) THEN
    RETURN;
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
    c.class_number::text
  FROM public.entries e
  LEFT JOIN public.dogs   d  ON d.id  = e.dog_id
  LEFT JOIN public.people op ON op.id = d.owner_id
  LEFT JOIN public.classes c  ON c.id  = e.class_id
  WHERE e.show_id    = p_show_id
    AND e.deleted_at IS NULL
  ORDER BY e.armband ASC NULLS LAST;
END;
$$;
