-- =============================================================================
-- MYK9-2294: a show's secretary sets a judge's affiliation (ASCA §1.5.7) through a single-field
-- RPC. Design: docs/plan-judge-affiliation-by-secretary.md (owner chose option B, 2026-11-19).
--
-- WHY AN RPC. person_edit_allowed admits a person's own login, a site admin and a manager of a
-- show the person has an ENTRY in, so a judge with a login and no entries fails every branch and
-- the secretary could not fill in the affiliation the premium requires. Widening
-- person_edit_allowed would open the judge's whole record (address, phone, email) to every
-- secretary of any show they judge, so this writes the ONE column and nothing else. It does not
-- go through update_person_details and person_edit_allowed is not touched.
--
-- WHO. The caller must pass can_manage_show(p_show_id), the person must hold a judge_assignments
-- row on that show whose status is not declined or cancelled (those do not print on the premium),
-- the show must be live (can_manage_show does not check deleted_at) and the person must not be
-- soft-deleted. Every failure raises 42501 with the SAME message, so the RPC never reveals
-- whether a person exists.
--
-- GRANTS. No new table. SECURITY DEFINER with an empty search_path; EXECUTE is revoked from
-- PUBLIC and anon and granted to authenticated only. Effective access is asserted by
-- supabase/tests/myk9_2294_set_judge_affiliation_test.sql. The people replication triggers
-- (version, updated_at) run on the UPDATE as for any other write.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_judge_affiliation(
  p_person_id uuid,
  p_show_id uuid,
  p_affiliation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR p_person_id IS NULL
     OR p_show_id IS NULL
     OR NOT public.can_manage_show(p_show_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.shows s
        WHERE s.id = p_show_id AND s.deleted_at IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.judge_assignments ja
        WHERE ja.show_id = p_show_id
          AND ja.person_id = p_person_id
          AND coalesce(ja.status, 'invited') NOT IN ('declined', 'cancelled')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.people p
        WHERE p.id = p_person_id AND p.deleted_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'You cannot set the affiliation of this judge.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
     SET judge_affiliation = nullif(btrim(p_affiliation), '')
   WHERE id = p_person_id
     AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_judge_affiliation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_judge_affiliation(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_judge_affiliation(uuid, uuid, text) TO authenticated;

COMMIT;
