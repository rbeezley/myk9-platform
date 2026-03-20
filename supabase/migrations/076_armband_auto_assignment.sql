-- Migration: Armband Auto-Assignment
-- Adds starting_armband_number to shows, unique constraint on armbands,
-- and an atomic assign_armband() function for sequential assignment.

-- Add starting armband number configuration to shows
ALTER TABLE shows ADD COLUMN IF NOT EXISTS starting_armband_number INTEGER NOT NULL DEFAULT 100;

-- Enforce one armband per dog per show at the schema level
-- (existing constraint: UNIQUE(show_id, armband_number) prevents duplicate numbers)
ALTER TABLE armbands ADD CONSTRAINT armbands_show_dog_unique UNIQUE (show_id, dog_id);

-- Atomic armband assignment function
-- Returns existing armband if dog already has one for this show,
-- otherwise assigns the next sequential number.
CREATE OR REPLACE FUNCTION assign_armband(p_show_id UUID, p_dog_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing INTEGER;
  v_next INTEGER;
  v_start INTEGER;
BEGIN
  -- Check if this dog already has an armband for this show (fast path, no lock)
  SELECT armband_number::int INTO v_existing
  FROM armbands
  WHERE show_id = p_show_id AND dog_id = p_dog_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Lock the show row to serialize concurrent assignments.
  -- Note: the UNIQUE(show_id, dog_id) constraint protects against the TOCTOU
  -- window between the check above and the INSERT below — a concurrent duplicate
  -- will fail with a unique violation, which the client's try/catch handles.
  SELECT starting_armband_number INTO v_start
  FROM shows
  WHERE id = p_show_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show % not found', p_show_id;
  END IF;

  -- Compute next available number (only consider numeric armband values)
  SELECT COALESCE(
    MAX(CASE WHEN armband_number ~ '^\d+$' THEN armband_number::int END),
    v_start - 1
  ) + 1
  INTO v_next
  FROM armbands
  WHERE show_id = p_show_id;

  -- Insert the assignment (entry_id omitted — armband is per-dog, not per-entry).
  -- is_available = FALSE means this armband is assigned and not available for reassignment.
  INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
  VALUES (p_show_id, p_dog_id, v_next::text, NOW(), FALSE);

  RETURN v_next;
END;
$$;
