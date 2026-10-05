-- =============================================================================
-- MYK9-1018: the server, not the device, decides entries.capacity_override on a
-- direct client write.
--
-- THE WRITE PATH THIS CLOSES
--   A show-desk late entry made offline (submitOfflineLateEntry) computes its
--   capacity_override on the device from the offline replica
--   (calculateOfflineCapacityOverrides) and queues an INSERT through
--   ReplicatedEntriesTable.createEntry. The MutationManager uploads it as a plain
--   PostgREST insert (packages/replication/src/mutation-execute.ts, INSERT with
--   no rpc: supabase.from('entries').insert(row)). No RPC sits in between, so the
--   server stored whatever the device sent:
--     - RLS entries_insert / entries_update admit only can_manage_show(show_id)
--       (platform admin, club admin, trial secretary), so a NON-staff caller
--       could never write the flag. That held already; the test pins it.
--     - Staff, though, stored a device-computed flag: a stale replica marked an
--       entry that took the last open spot as an override, or missed one that
--       went over the limit after another device filled the class.
--
-- WHAT THIS DOES
--   trg_entries_capacity_override (BEFORE INSERT OR UPDATE OF capacity_override)
--   uses the direct-write discriminator of 20260930214300
--   (private.entries_direct_write_gate: current_user = 'authenticated'):
--     INSERT  the client's value is ignored. A row that consumes a spot (the
--             capacity status list, not soft-deleted, with a class) is marked
--             when evaluate_entry_capacity, asked as the show desk with override
--             allowed, says the class or a judge day is full. Otherwise false.
--             The insert always lands: show desk may exceed capacity, and the
--             flag only records that it did. Asked BEFORE the row exists, the
--             same moment submit_show_entries asks, so the entry that takes the
--             last spot is not an override and the next one is.
--     UPDATE  a direct client write keeps OLD. The INSERT ack returns only the
--             id, so the device's replica keeps its own estimate until the next
--             pull; a queued full-row upload must not write it back.
--   Definer RPCs (submit_show_entries, which already sets the flag from
--   evaluate_entry_capacity) and service_role writes are not direct client
--   writes and pass through unchanged.
--
--   evaluate_entry_capacity is the single capacity rule and is not redefined
--   here. With source 'show_desk' and override allowed it returns before any
--   wait-list write, so calling it from the trigger only reads and takes its
--   usual transaction advisory locks, which also serializes two desks syncing
--   into the same class.
--
--   trg_entries_00_direct_write_gate gains capacity_override in its UPDATE OF
--   list (copied from 20261001034700, the latest definition), so the gate's
--   setting is fresh whenever this trigger fires. It fires on every INSERT
--   already. Trigger order is by name: trg_entries_00_… runs first.
-- =============================================================================

CREATE OR REPLACE FUNCTION private.entries_server_capacity_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capacity record;
BEGIN
  IF current_setting('myk9.entries_direct_write', true) IS DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.capacity_override := OLD.capacity_override;
    RETURN NEW;
  END IF;

  NEW.capacity_override := false;

  IF NEW.class_id IS NULL
     OR NEW.deleted_at IS NOT NULL
     -- The status list evaluate_entry_capacity counts as holding a spot.
     OR NEW.entry_status IS NULL
     OR NOT (NEW.entry_status = ANY (ARRAY[
       'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
     ]))
  THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.evaluate_entry_capacity(
    NEW.class_id,
    NEW.dog_id,
    NULL,
    NEW.handler_id,
    'show_desk',
    true
  );

  NEW.capacity_override := COALESCE(v_capacity.capacity_override, false);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.entries_server_capacity_override() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_00_direct_write_gate ON public.entries;
CREATE TRIGGER trg_entries_00_direct_write_gate
  BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee, junior_fee_declared, capacity_override
  ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_direct_write_gate();

DROP TRIGGER IF EXISTS trg_entries_capacity_override ON public.entries;
CREATE TRIGGER trg_entries_capacity_override
  BEFORE INSERT OR UPDATE OF capacity_override ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_server_capacity_override();

COMMENT ON COLUMN public.entries.capacity_override IS
  'True only when an authorized show-desk user entered a selection already at capacity. '
  'Set by the server: submit_show_entries from evaluate_entry_capacity, and on a direct '
  'client insert by trg_entries_capacity_override (MYK9-1018), which ignores the client '
  'value and keeps it frozen on a direct client update.';
