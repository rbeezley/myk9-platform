-- Durable, offline-replayable staff confirmations for show paperwork.
-- A row records a human confirmation after print invocation; opening Reports,
-- generating a PDF, or calling browser Print never inserts one automatically.

CREATE TABLE public.paperwork_prints (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  trial_id uuid REFERENCES public.trials(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('show', 'trial', 'class')),
  report_id text NOT NULL CHECK (length(btrim(report_id)) > 0),
  coverage jsonb NOT NULL CHECK (jsonb_typeof(coverage) = 'object'),
  fingerprint text NOT NULL CHECK (length(btrim(fingerprint)) > 0),
  printed_by uuid NOT NULL,
  printed_by_name text NOT NULL CHECK (length(btrim(printed_by_name)) > 0),
  printed_at timestamptz NOT NULL,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paperwork_prints_scope_shape CHECK (
    (scope_kind = 'show' AND trial_id IS NULL AND class_id IS NULL)
    OR (scope_kind = 'trial' AND trial_id IS NOT NULL AND class_id IS NULL)
    OR (scope_kind = 'class' AND trial_id IS NOT NULL AND class_id IS NOT NULL)
  ),
  CONSTRAINT paperwork_prints_void_shape CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (
      voided_at IS NOT NULL
      AND voided_by IS NOT NULL
      AND length(btrim(void_reason)) > 0
      AND voided_at >= printed_at
    )
  )
);

CREATE INDEX paperwork_prints_show_report_latest_idx
  ON public.paperwork_prints (show_id, report_id, printed_at DESC)
  WHERE voided_at IS NULL;
CREATE INDEX paperwork_prints_trial_report_latest_idx
  ON public.paperwork_prints (trial_id, report_id, printed_at DESC)
  WHERE trial_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX paperwork_prints_class_report_latest_idx
  ON public.paperwork_prints (class_id, report_id, printed_at DESC)
  WHERE class_id IS NOT NULL AND voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_paperwork_print_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  trial_show_id uuid;
  class_trial_id uuid;
BEGIN
  IF NEW.trial_id IS NOT NULL THEN
    SELECT show_id INTO trial_show_id
    FROM public.trials
    WHERE id = NEW.trial_id;
    IF trial_show_id IS DISTINCT FROM NEW.show_id THEN
      RAISE EXCEPTION 'paperwork print Trial does not belong to Show';
    END IF;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT trial_id INTO class_trial_id
    FROM public.classes
    WHERE id = NEW.class_id;
    IF class_trial_id IS DISTINCT FROM NEW.trial_id THEN
      RAISE EXCEPTION 'paperwork print Class does not belong to Trial';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_paperwork_print_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'voided paperwork print records are immutable';
  END IF;

  IF NEW.voided_at IS NULL OR NEW.voided_by IS NULL OR NULLIF(btrim(NEW.void_reason), '') IS NULL THEN
    RAISE EXCEPTION 'paperwork print updates may only record a complete void correction';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['voided_at', 'voided_by', 'void_reason', 'version', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['voided_at', 'voided_by', 'void_reason', 'version', 'updated_at']) THEN
    RAISE EXCEPTION 'paperwork print facts are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER paperwork_prints_validate_scope
  BEFORE INSERT OR UPDATE ON public.paperwork_prints
  FOR EACH ROW EXECUTE FUNCTION public.validate_paperwork_print_scope();

CREATE TRIGGER paperwork_prints_immutable_guard
  BEFORE UPDATE ON public.paperwork_prints
  FOR EACH ROW EXECUTE FUNCTION public.guard_paperwork_print_update();

CREATE TRIGGER paperwork_prints_set_updated_at
  BEFORE UPDATE ON public.paperwork_prints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER paperwork_prints_version_increment
  BEFORE UPDATE ON public.paperwork_prints
  FOR EACH ROW EXECUTE FUNCTION public.increment_replication_version();

ALTER TABLE public.paperwork_prints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paperwork_prints FORCE ROW LEVEL SECURITY;

CREATE POLICY paperwork_prints_select
  ON public.paperwork_prints
  FOR SELECT TO authenticated
  USING ((SELECT public.can_manage_show(show_id)));

CREATE POLICY paperwork_prints_insert
  ON public.paperwork_prints
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_show(show_id))
    AND printed_by = (SELECT auth.uid())
    AND voided_at IS NULL
    AND voided_by IS NULL
    AND void_reason IS NULL
  );

CREATE POLICY paperwork_prints_void
  ON public.paperwork_prints
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_show(show_id)))
  WITH CHECK (
    (SELECT public.can_manage_show(show_id))
    AND voided_by = (SELECT auth.uid())
    AND voided_at IS NOT NULL
    AND NULLIF(btrim(void_reason), '') IS NOT NULL
  );

REVOKE ALL ON TABLE public.paperwork_prints FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.paperwork_prints TO authenticated;
GRANT UPDATE (voided_at, voided_by, void_reason) ON TABLE public.paperwork_prints TO authenticated;

COMMENT ON TABLE public.paperwork_prints IS
  'Append-only staff confirmations of physical paperwork printing; corrections are void updates.';
COMMENT ON COLUMN public.paperwork_prints.printed_at IS
  'Client-observed confirmation time, captured only after the staff member confirms printing.';
COMMENT ON COLUMN public.paperwork_prints.coverage IS
  'Compact document-specific subject coverage used to determine which Classes or Dogs a print covers.';
