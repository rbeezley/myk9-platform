-- MYK9-2393: saving the Judge Qualifications panel deleted and re-inserted every row,
-- so suspension_date, suspension_reason, approval_number, approved_by, notes, id and
-- created_at were lost on every save (a Suspended card turned into Expired).
--
-- The save stays one atomic call, but it is now id-preserving:
--   * a payload row with an id that belongs to the person is UPDATED, touching only the
--     columns the form owns (organization, qualification_level, disciplines, judge_number,
--     date_obtained, expiration_date, is_active);
--   * a payload row without an id is INSERTED;
--   * a row of the person that is absent from the payload is DELETED;
--   * an id that belongs to another person (or to no row) is refused.
-- Authorization is unchanged from 20260903150000 (MYK9-354): secretaries and site admins only.

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

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_qualifications, '[]'::jsonb)) AS q(id uuid)
    WHERE q.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.judge_qualifications AS jq
        WHERE jq.id = q.id
          AND jq.person_id = p_person_id
      )
  ) THEN
    RAISE EXCEPTION 'Qualification id does not belong to target person';
  END IF;

  UPDATE public.judge_qualifications AS jq
  SET
    organization = q.organization,
    qualification_level = q.qualification_level,
    disciplines = q.disciplines,
    judge_number = q.judge_number,
    date_obtained = q.date_obtained,
    expiration_date = q.expiration_date,
    is_active = COALESCE(q.is_active, jq.is_active),
    updated_at = now()
  FROM jsonb_to_recordset(COALESCE(p_qualifications, '[]'::jsonb)) AS q(
    id uuid,
    organization text,
    qualification_level text,
    disciplines text[],
    judge_number text,
    date_obtained date,
    expiration_date date,
    is_active boolean
  )
  WHERE q.id IS NOT NULL
    AND jq.id = q.id
    AND jq.person_id = p_person_id;

  DELETE FROM public.judge_qualifications AS jq
  WHERE jq.person_id = p_person_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_qualifications, '[]'::jsonb)) AS q(id uuid)
      WHERE q.id = jq.id
    );

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
    id uuid,
    person_id uuid,
    organization text,
    qualification_level text,
    disciplines text[],
    judge_number text,
    date_obtained date,
    expiration_date date,
    is_active boolean
  )
  WHERE q.id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.replace_judge_qualifications(uuid, jsonb) IS
  'Saves a person''s judge qualification list: updates rows by id (form-owned columns only, so suspension, approval, notes, id and created_at survive), inserts rows without an id, deletes rows absent from the payload. Only secretaries and site admins may call it (MYK9-354, MYK9-2393).';
