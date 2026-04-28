-- Auto-assign sequential armband when an entry is accepted or confirmed.
-- One armband per dog per show; all classes share the same number.
-- Advisory lock prevents race conditions when multiple entries are accepted concurrently.

CREATE OR REPLACE FUNCTION auto_assign_armband_on_accept()
RETURNS TRIGGER AS $$
DECLARE
  v_armband text;
  v_next_num integer;
BEGIN
  -- Prevent recursion from the propagation UPDATE below
  IF pg_trigger_depth() > 0 THEN
    RETURN NEW;
  END IF;

  -- Only act on transition TO accepted/confirmed
  IF NEW.entry_status NOT IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF OLD.entry_status IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.dog_id IS NULL OR NEW.show_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Advisory lock: prevents two concurrent accepts for the same show from
  -- picking the same next armband number.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.show_id::text));

  -- Use existing armband if dog already has one for this show
  SELECT armband_number INTO v_armband
  FROM armbands
  WHERE show_id = NEW.show_id AND dog_id = NEW.dog_id;

  IF v_armband IS NULL THEN
    -- Next sequential number (1 if no armbands assigned yet)
    SELECT COALESCE(MAX(armband_number::integer) + 1, 1) INTO v_next_num
    FROM armbands
    WHERE show_id = NEW.show_id
      AND armband_number ~ '^[0-9]+$';

    v_armband := v_next_num::text;

    INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
    VALUES (NEW.show_id, NEW.dog_id, v_armband, NOW(), FALSE)
    ON CONFLICT (show_id, dog_id) DO UPDATE
      SET armband_number = EXCLUDED.armband_number,
          assigned_at    = EXCLUDED.assigned_at;
  END IF;

  -- Propagate to all other entries for this dog in this show
  UPDATE entries
  SET armband     = v_armband,
      updated_at  = NOW()
  WHERE show_id    = NEW.show_id
    AND dog_id     = NEW.dog_id
    AND deleted_at IS NULL
    AND armband IS DISTINCT FROM v_armband;

  -- Apply to the row being accepted
  NEW.armband := v_armband;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_armband_on_accept_trigger
  BEFORE UPDATE OF entry_status ON entries
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_armband_on_accept();
