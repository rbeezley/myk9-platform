-- Track how a waitlist row was created so mail-in/offline promotions can use
-- a manual hold instead of the online pay-to-claim expiration clock.

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS joined_via text NOT NULL DEFAULT 'online'
  CHECK (joined_via IN ('online', 'mail_in'));

COMMENT ON COLUMN public.waitlist_entries.joined_via IS
  'Channel that created the waitlist row. online rows use pay-to-claim expiry; mail_in rows are held for secretary/offline handling.';

DROP FUNCTION IF EXISTS public.add_to_waitlist(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.add_to_waitlist(
  p_class_id uuid,
  p_exhibitor_id uuid,
  p_dog_id uuid,
  p_handler_id uuid DEFAULT NULL,
  p_joined_via text DEFAULT 'online'
)
RETURNS public.waitlist_entries
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  next_position integer;
  new_entry public.waitlist_entries;
  v_show_id uuid;
BEGIN
  IF p_joined_via NOT IN ('online', 'mail_in') THEN
    RAISE EXCEPTION 'Invalid waitlist join channel';
  END IF;

  SELECT t.show_id
  INTO v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF p_joined_via = 'mail_in'
     AND NOT (
       public.is_show_secretary(v_show_id)
       OR public.is_site_admin()
     ) THEN
    RAISE EXCEPTION 'Only show secretaries may create mail-in waitlist rows';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  SELECT COALESCE(MAX(position), 0) + 1
  INTO next_position
  FROM public.waitlist_entries
  WHERE class_id = p_class_id
    AND status = 'waiting';

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    handler_id,
    position,
    joined_via
  )
  VALUES (
    p_class_id,
    p_exhibitor_id,
    p_dog_id,
    p_handler_id,
    next_position,
    p_joined_via
  )
  RETURNING * INTO new_entry;

  RETURN new_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_to_waitlist(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_waitlist(uuid, uuid, uuid, uuid, text) TO authenticated;
