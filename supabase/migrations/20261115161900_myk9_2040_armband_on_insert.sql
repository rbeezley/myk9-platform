-- MYK9-2040: an entry keyed as 'confirmed' gets an armband, and a re-accepted
-- entry is told again.
--
-- 1. submit_show_entries inserts a secretary's mail-in entry already
--    'confirmed'. auto_assign_armband_on_accept_trigger was BEFORE UPDATE OF
--    entry_status only, so an insert never reached it and the entry had no
--    armband. The trigger now also fires BEFORE INSERT, and the function guards
--    on TG_OP (OLD is NULL on insert). One numbering rule: the same function.
--
--    An insert that supplies its own armband keeps it.
--
-- 2. Accept (confirmation sent) -> waitlist -> accept again left
--    confirmation_email_sent_at set from the first time, so the confirmation
--    sender skipped the entry. A new acceptance is a new confirmation: when an
--    entry moves from a pre-acceptance (back-to-review) status to 'confirmed'
--    the mark is cleared and the status reset to 'pending'. Leaving 'confirmed'
--    changes nothing, and neither do day-of or terminal round trips. This is
--    done in the same BEFORE trigger pass, ahead of the nested-trigger early
--    return, so it holds however the status changed.
--
-- 3. Backfill: confirmed, live entries with no armband. A no-op status touch is
--    rejected: this function ignores an update whose OLD status is already
--    confirmed, and a touch that did get through would fire the status-change
--    triggers (history, withdrawn stamp) for no real change. The backfill
--    instead sets ONLY entries.armband, so the column-scoped triggers (status,
--    payment, fees, check-in, deleted_at, score) do not fire. The
--    unconditional BEFORE UPDATE triggers that do fire (updated_at, version,
--    the cancelled-class and refund-column guards) are guards or the bumps the
--    replication delta needs, and none of them reads the armband.
--    The number is chosen with the function's own rule as of 20260830190000 (existing armbands row
--    for the dog and show is reused, otherwise MAX numeric + 1 from the show's
--    starting number, under the same advisory lock and show row lock).
--
-- SECURITY INVOKER and SET search_path are unchanged from 20260830190000, and
-- CREATE OR REPLACE keeps the ACL: EXECUTE for authenticated (granted there),
-- plus the pre-existing anon/PUBLIC entries. Nothing here changes grants.

CREATE OR REPLACE FUNCTION public.auto_assign_armband_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_armband text;
  v_next_num integer;
  v_start_num integer;
  -- An entry that moves from one of these to 'confirmed' is accepted anew, so
  -- it is a new confirmation. Day-of and terminal moves (checked-in ..
  -- completed, withdrawn, scratched, absent, moved) are deliberately absent: a
  -- Pull then Put back, or Absent then Undo, must not trigger a second full
  -- confirmation mid-show. Clearing on RE-ACCEPTANCE, not on leaving, means a
  -- declined entry (not_accepted) keeps its mark and the deployed date-based
  -- sender, which filters on the email fields and not on status, can never
  -- email it.
  v_back_to_review constant text[] := ARRAY[
    'no-status', 'draft', 'submitted', 'paid', 'pending-payment',
    'not_accepted', 'move-up-requested', 'promotion-expired'
  ];
BEGIN
  -- Before the depth guard so a nested status change clears too.
  IF TG_OP = 'UPDATE'
     AND OLD.entry_status = ANY (v_back_to_review)
     AND NEW.entry_status = 'confirmed' THEN
    NEW.confirmation_email_sent_at := NULL;
    NEW.confirmation_email_status := 'pending';
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.entry_status NOT IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;
  -- OLD does not exist on INSERT: an entry inserted accepted/confirmed is a
  -- new acceptance.
  IF TG_OP = 'UPDATE' AND OLD.entry_status IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- An insert that brings its own armband (one reserved offline on the
  -- secretary's device, or a day-of add) keeps it: renumbering would change a
  -- number already shown to her. The caller owns the ledger row:
  -- submitOfflineLateEntry.ts writes it through
  -- replicatedArmbandsTable.upsertAssignedArmband before the entry, and the
  -- entry depends on that mutation.
  IF TG_OP = 'INSERT' AND NULLIF(btrim(COALESCE(NEW.armband, '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.dog_id IS NULL OR NEW.show_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.show_id::text));

  SELECT COALESCE(starting_armband_number, 100) INTO v_start_num
  FROM shows
  WHERE id = NEW.show_id
  FOR UPDATE;

  IF v_start_num IS NULL THEN
    v_start_num := 100;
  END IF;

  SELECT armband_number INTO v_armband
  FROM armbands
  WHERE show_id = NEW.show_id AND dog_id = NEW.dog_id;

  IF v_armband IS NULL THEN
    SELECT COALESCE(
      MAX(CASE WHEN armband_number ~ '^[0-9]+$' THEN armband_number::integer END),
      v_start_num - 1
    ) + 1 INTO v_next_num
    FROM armbands
    WHERE show_id = NEW.show_id;

    v_armband := v_next_num::text;

    INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
    VALUES (NEW.show_id, NEW.dog_id, v_armband, NOW(), FALSE)
    ON CONFLICT (show_id, dog_id) DO UPDATE
      SET armband_number = EXCLUDED.armband_number,
          assigned_at    = EXCLUDED.assigned_at;
  END IF;

  -- On INSERT the row is not in the table yet, so this only reaches siblings.
  UPDATE entries
  SET armband     = v_armband,
      updated_at  = NOW()
  WHERE show_id    = NEW.show_id
    AND dog_id     = NEW.dog_id
    AND id         <> NEW.id
    AND deleted_at IS NULL
    AND armband IS DISTINCT FROM v_armband;

  NEW.armband := v_armband;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_assign_armband_on_accept() TO authenticated;

-- Ordering note: on INSERT this trigger now fires before
-- entries_00_refuse_deleted_parent (alphabetical) and takes `shows FOR UPDATE`
-- before that trigger's parent gate. A confirmed insert racing a show
-- soft-delete can deadlock (40P01); the replication queue retries it. Accepted.
-- The trigger is not renamed: renaming would change the UPDATE firing order the
-- 20261027003700 (MYK9-1407) migration documents.
DROP TRIGGER IF EXISTS auto_assign_armband_on_accept_trigger ON public.entries;
CREATE TRIGGER auto_assign_armband_on_accept_trigger
  BEFORE INSERT OR UPDATE OF entry_status ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_armband_on_accept();

-- Backfill: confirmed, live entries keyed before this fix. Oldest first, so
-- numbers follow keying order.
DO $backfill$
DECLARE
  r record;
  v_armband text;
  v_next_num integer;
  v_start_num integer;
BEGIN
  FOR r IN
    SELECT show_id, dog_id, MIN(created_at) AS first_created
    FROM public.entries
    WHERE entry_status = 'confirmed'
      AND deleted_at IS NULL
      AND armband IS NULL
      AND dog_id IS NOT NULL
      AND show_id IS NOT NULL
    GROUP BY show_id, dog_id
    ORDER BY MIN(created_at), show_id, dog_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(r.show_id::text));

    SELECT COALESCE(starting_armband_number, 100) INTO v_start_num
    FROM public.shows WHERE id = r.show_id FOR UPDATE;
    v_start_num := COALESCE(v_start_num, 100);

    SELECT armband_number INTO v_armband
    FROM public.armbands
    WHERE show_id = r.show_id AND dog_id = r.dog_id;

    IF v_armband IS NULL THEN
      SELECT COALESCE(
        MAX(CASE WHEN armband_number ~ '^[0-9]+$' THEN armband_number::integer END),
        v_start_num - 1
      ) + 1 INTO v_next_num
      FROM public.armbands
      WHERE show_id = r.show_id;

      v_armband := v_next_num::text;

      INSERT INTO public.armbands (show_id, dog_id, armband_number, assigned_at, is_available)
      VALUES (r.show_id, r.dog_id, v_armband, NOW(), FALSE)
      ON CONFLICT (show_id, dog_id) DO UPDATE
        SET armband_number = EXCLUDED.armband_number,
            assigned_at    = EXCLUDED.assigned_at;
    END IF;

    UPDATE public.entries
    SET armband = v_armband
    WHERE show_id = r.show_id
      AND dog_id = r.dog_id
      AND deleted_at IS NULL
      AND armband IS DISTINCT FROM v_armband;
  END LOOP;
END
$backfill$;
