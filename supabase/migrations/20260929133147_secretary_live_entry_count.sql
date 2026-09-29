-- Independent manager-authorized count for validating an empty secretary replica.
-- The replication view can temporarily return zero during an RLS gap.
CREATE OR REPLACE FUNCTION public.get_secretary_live_entry_count(p_show_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF NOT coalesce(public.can_manage_show(p_show_id), false) THEN
    RAISE EXCEPTION 'Not authorized to manage show entries' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.entries
  WHERE show_id = p_show_id AND deleted_at IS NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_secretary_live_entry_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secretary_live_entry_count(uuid) TO authenticated, service_role;
