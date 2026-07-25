-- Keep already-open secretary desks coordinated after a Paperwork Print
-- confirmation, reprint, or void. The private Broadcast is only an
-- invalidation nudge; the replicated table remains authoritative.

CREATE OR REPLACE FUNCTION public.broadcast_paperwork_print_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_show_id := OLD.show_id;
  ELSE
    v_show_id := NEW.show_id;
  END IF;

  IF v_show_id IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('table', 'paperwork_prints'),
        'showday_change',
        format('show:%s:changes', v_show_id),
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not broadcast Paperwork Print change for show %: %',
        v_show_id,
        SQLERRM;
    END;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is advisory and must never abort a print confirmation.
  RAISE WARNING 'Could not prepare Paperwork Print broadcast: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_paperwork_print_change ON public.paperwork_prints;
CREATE TRIGGER broadcast_paperwork_print_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.paperwork_prints
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_paperwork_print_change();
