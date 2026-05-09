-- Fix recursive-trigger guard so the accepted-entry trigger can run.
-- pg_trigger_depth() is 1 while the current trigger is executing; only
-- nested trigger invocations should be skipped.

CREATE OR REPLACE FUNCTION auto_assign_armband_on_accept()
RETURNS TRIGGER AS $$
DECLARE
  v_armband text;
  v_next_num integer;
  v_start_num integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.entry_status NOT IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF OLD.entry_status IN ('accepted', 'confirmed') THEN
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
$$ LANGUAGE plpgsql;
