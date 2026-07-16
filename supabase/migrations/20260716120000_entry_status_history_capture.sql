-- MYK9-20: capture lifecycle history at the database status boundary.
-- App status writes are split across replicated mutations, direct RPCs, and
-- show-day operations, so a trigger is the only complete authoritative seam.

CREATE OR REPLACE FUNCTION public.record_entry_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by UUID;
  v_reason TEXT;
BEGIN
  IF NEW.entry_status IS NOT DISTINCT FROM OLD.entry_status THEN
    RETURN NEW;
  END IF;

  SELECT p.id
  INTO v_changed_by
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  IF NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason THEN
    v_reason := NULLIF(BTRIM(NEW.withdrawal_reason), '');
  ELSIF NEW.special_requests IS DISTINCT FROM OLD.special_requests THEN
    v_reason := NULLIF(BTRIM(NEW.special_requests), '');
  END IF;

  INSERT INTO public.entry_status_history (
    entry_id,
    previous_status,
    new_status,
    changed_by,
    changed_at,
    reason
  )
  VALUES (
    NEW.id,
    OLD.entry_status,
    NEW.entry_status,
    v_changed_by,
    NOW(),
    v_reason
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_record_status_history ON public.entries;

CREATE TRIGGER entries_record_status_history
  AFTER UPDATE OF entry_status ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.record_entry_status_history();

REVOKE ALL ON FUNCTION public.record_entry_status_history() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "entry_status_history_select" ON public.entry_status_history;

CREATE POLICY "entry_status_history_select"
  ON public.entry_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.shows s ON s.id = e.show_id
      WHERE e.id = entry_status_history.entry_id
        AND (
          public.is_show_official(e.show_id)
          OR (s.club_id IS NOT NULL AND public.is_club_admin(s.club_id))
        )
    )
  );

COMMENT ON FUNCTION public.record_entry_status_history() IS
  'Records every entries.entry_status transition with schema-authoritative old/new values.';
