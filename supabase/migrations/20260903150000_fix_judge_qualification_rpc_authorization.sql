-- MYK9-354: the qualification replacement RPC must not grant self-service
-- credential writes. Keep its authorization aligned with the table's write
-- policies: secretaries and site admins may manage qualifications.

CREATE OR REPLACE FUNCTION public.replace_judge_qualifications(
  p_person_id uuid,
  p_qualifications jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.is_site_admin()
    OR public.has_role('secretary')
  ) THEN
    RAISE EXCEPTION 'Not authorized to replace judge qualifications';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_qualifications, '[]'::jsonb)) AS q(person_id uuid)
    WHERE q.person_id IS DISTINCT FROM p_person_id
  ) THEN
    RAISE EXCEPTION 'Qualification person_id does not match target person';
  END IF;

  DELETE FROM public.judge_qualifications
  WHERE person_id = p_person_id;

  INSERT INTO public.judge_qualifications (
    person_id,
    organization,
    qualification_level,
    disciplines,
    judge_number,
    date_obtained,
    expiration_date,
    is_active
  )
  SELECT
    q.person_id,
    q.organization,
    q.qualification_level,
    q.disciplines,
    q.judge_number,
    q.date_obtained,
    q.expiration_date,
    COALESCE(q.is_active, true)
  FROM jsonb_to_recordset(COALESCE(p_qualifications, '[]'::jsonb)) AS q(
    person_id uuid,
    organization text,
    qualification_level text,
    disciplines text[],
    judge_number text,
    date_obtained date,
    expiration_date date,
    is_active boolean
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) TO authenticated;

-- Keep direct DELETE restricted to site admins. The SECURITY DEFINER RPC owns
-- its atomic replacement path and must not widen destructive table access.

COMMENT ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) IS
  'Atomically replaces judge qualifications for a target person. Only secretaries and site admins may call it; self-service callers cannot create or delete credential rows (MYK9-354).';
