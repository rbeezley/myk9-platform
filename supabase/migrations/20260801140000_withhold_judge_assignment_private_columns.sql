-- MYK9-146: keep judge fees and internal assignment notes out of public and
-- ordinary authenticated reads while preserving the public judge panel.
--
-- RLS cannot hide individual columns. The prior table-wide SELECT grants made
-- `select=fee,notes` available to a cold anon or unrelated authenticated user,
-- even though the row policy was intentionally public for show discovery. Use
-- column grants for the public shape and a caller-checked SECURITY DEFINER RPC
-- for office managers that genuinely need the private fields.

-- A table-level SELECT grant is all-or-nothing for PostgREST column requests;
-- revoke it before restoring the explicit safe-column allowlists. Do not revoke
-- INSERT/UPDATE/DELETE: office writes remain protected by the RLS policies from
-- MYK9-147 and service_role keeps its existing full grant.
REVOKE SELECT ON TABLE public.judge_assignments FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  person_id,
  show_id,
  trial_id,
  class_id,
  status,
  invited_at,
  confirmed_at,
  created_at,
  updated_at
) ON public.judge_assignments TO anon;

-- Authenticated show-day paths also need the capacity override and replication
-- version. Neither is a fee or free-text internal note.
GRANT SELECT (
  id,
  person_id,
  show_id,
  trial_id,
  class_id,
  status,
  invited_at,
  confirmed_at,
  created_at,
  updated_at,
  day_capacity_override,
  version
) ON public.judge_assignments TO authenticated;

-- Private assignment fields are returned only after the helper evaluates the
-- caller against each assignment's show. Returning the base composite keeps the
-- RPC useful to manager analytics without exposing a broadly readable view.
CREATE OR REPLACE FUNCTION public.get_manager_judge_assignments()
RETURNS SETOF public.judge_assignments
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT ja.*
  FROM public.judge_assignments AS ja
  WHERE public.is_show_office_manager(ja.show_id);
$$;

REVOKE ALL ON FUNCTION public.get_manager_judge_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_judge_assignments() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_manager_judge_assignments() IS
  'MYK9-146: returns fee and internal notes only for rows whose show is managed by the current site admin, club admin, or active/unexpired secretary.';

NOTIFY pgrst, 'reload schema';
