-- MYK9-494: a judge change must reach devices that have already synced the class.
--
-- Judge names live in `judge_assignments` (classes.judge_name was dropped by MYK9-479), and the
-- classes replication is INCREMENTAL: `fetchRemoteRows` filters `updated_at > since`. A swap,
-- a decline or a removal writes only `judge_assignments`, so `classes.updated_at` never moves,
-- the class row is never re-fetched, and an already-synced device keeps showing the previous
-- judge until the next full resync — up to 24h, i.e. right through a show weekend.
--
-- The app already touches the class from two of its own mutation paths
-- (`touchClassForJudgeSync`, called by upsertClassJudgeAssignment and reassignClassJudge), but
-- that covers only those two call sites. It does NOT cover assignments written server-side by
-- `create_show_with_children`, a direct status change (invited -> confirmed / declined), a
-- cascade delete, a support/SQL correction, or any path added later. A trigger covers all of
-- them because it lives next to the data, not next to one caller.
--
-- WHY `updated_at` AND NOT A NEW COLUMN
-- `updated_at` is the cursor the replication layer already reads; anything else would need a
-- second cursor in every client. `update_classes_updated_at` (BEFORE UPDATE) would set it on its
-- own, but it is written explicitly here so the intent survives a future change to that trigger.
--
-- SECURITY DEFINER: a judge responding to their own invitation has no UPDATE privilege on
-- `classes`, and neither does the secretary of a club that does not own the class. The function
-- touches exactly one column on exactly the affected class rows and returns no data.

CREATE OR REPLACE FUNCTION public.touch_class_on_judge_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_class_id uuid;
  v_new_class_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_class_id := NEW.class_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_class_id := OLD.class_id;
  ELSE
    v_new_class_id := NEW.class_id;
    v_old_class_id := OLD.class_id;
  END IF;

  -- Both ids, so MOVING an assignment between classes refreshes the class it left as well as
  -- the one it joined. A show-level assignment carries class_id IS NULL and touches nothing.
  UPDATE public.classes c
  SET updated_at = now()
  WHERE c.id IN (
    SELECT class_id
    FROM unnest(ARRAY[v_old_class_id, v_new_class_id]) AS class_id
    WHERE class_id IS NOT NULL
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Never called directly: a trigger fires its function regardless of EXECUTE privileges (the
-- privilege is checked once, at CREATE TRIGGER). So the decision for every client role is the
-- same and it is explicit — no handle on a SECURITY DEFINER function that writes to classes.
REVOKE ALL ON FUNCTION public.touch_class_on_judge_assignment_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_class_on_judge_assignment_change() FROM anon;
REVOKE ALL ON FUNCTION public.touch_class_on_judge_assignment_change() FROM authenticated;

DROP TRIGGER IF EXISTS trg_touch_class_on_judge_assignment_write ON public.judge_assignments;
CREATE TRIGGER trg_touch_class_on_judge_assignment_write
AFTER INSERT OR DELETE ON public.judge_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_class_on_judge_assignment_change();

-- Column-scoped: fee, notes and confirmed_at churn without changing who is judging, and every
-- touch costs a class row re-fetch on every synced device.
DROP TRIGGER IF EXISTS trg_touch_class_on_judge_assignment_update ON public.judge_assignments;
CREATE TRIGGER trg_touch_class_on_judge_assignment_update
AFTER UPDATE OF person_id, status, class_id ON public.judge_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_class_on_judge_assignment_change();

COMMENT ON FUNCTION public.touch_class_on_judge_assignment_change() IS
  'MYK9-494: bumps public.classes.updated_at when a class-level judge_assignments row is '
  'inserted, deleted, or has its person_id/status/class_id changed, so the INCREMENTAL classes '
  'replication re-fetches the class and the exhibitor run schedule picks up the new judge. '
  'Without it a judge swap or decline is invisible to an already-synced device until the next '
  'full resync. Show-level assignments (class_id IS NULL) touch nothing.';

NOTIFY pgrst, 'reload schema';
