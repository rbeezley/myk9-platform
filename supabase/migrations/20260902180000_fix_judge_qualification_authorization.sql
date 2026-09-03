-- Keep the deployed qualification replacement function aligned with the
-- unified RBAC role name. The original migration predates role consolidation.
CREATE OR REPLACE FUNCTION public.replace_judge_qualifications(
  p_person_id uuid,
  p_qualifications jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_site_admin()
    OR public.has_role('secretary')
    OR public.get_my_person_id() = p_person_id
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
GRANT EXECUTE ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) TO authenticated;
