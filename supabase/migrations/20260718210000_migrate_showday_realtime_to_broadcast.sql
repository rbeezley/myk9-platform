-- Move high-volume show-day invalidation signals from Postgres Changes to
-- private, show-scoped Broadcast topics. Replication-backed reads remain the
-- source of truth; this signal carries no row data.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "show-day change signals are readable" ON realtime.messages;
CREATE POLICY "show-day change signals are readable"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    realtime.topic() ~
      '^show:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:changes$'
  );

CREATE OR REPLACE FUNCTION public.broadcast_showday_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_show_id uuid;
  v_new_show_id uuid;
  v_topic text;
BEGIN
  IF TG_TABLE_NAME = 'entries' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_show_id := OLD.show_id;
    END IF;

    IF TG_OP <> 'DELETE' THEN
      v_new_show_id := NEW.show_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'classes' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT trials.show_id
      INTO v_old_show_id
      FROM public.trials
      WHERE trials.id = OLD.trial_id;
    END IF;

    IF TG_OP <> 'DELETE' THEN
      SELECT trials.show_id
      INTO v_new_show_id
      FROM public.trials
      WHERE trials.id = NEW.trial_id;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  FOR v_topic IN
    SELECT DISTINCT format('show:%s:changes', show_id)
    FROM unnest(ARRAY[v_old_show_id, v_new_show_id]) AS scoped_show(show_id)
    WHERE show_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('table', TG_TABLE_NAME),
        'showday_change',
        v_topic,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not broadcast show-day change for %.%: %',
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is advisory. A signaling failure must never abort a show-day write.
  RAISE WARNING 'Could not prepare show-day change broadcast for %.%: %',
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_entries_showday_change ON public.entries;
CREATE TRIGGER broadcast_entries_showday_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_showday_change();

DROP TRIGGER IF EXISTS broadcast_classes_showday_change ON public.classes;
CREATE TRIGGER broadcast_classes_showday_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_showday_change();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.entries;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'classes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.classes;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'show_message_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.show_message_threads;
  END IF;
END;
$$;
