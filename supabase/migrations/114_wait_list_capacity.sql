-- =============================================================================
-- Migration 114: Wait List & Judge-Day Capacity
-- =============================================================================
-- Adds judge-day capacity model, mail-in reservation config, wait list
-- payment flow, and a function to calculate judge-day availability.
-- Design: docs/plans/2026-04-02-wait-list-design.md
--
-- NOTE: waitlist_entries RLS policies already exist (migration 009).
-- NOTE: migrations 110-113 were added after this plan was written; using 114.

-- -----------------------------------------------------------------------------
-- 1. Add capacity & mail-in config to shows
-- -----------------------------------------------------------------------------

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS default_judge_day_capacity INTEGER NOT NULL DEFAULT 125,
  ADD COLUMN IF NOT EXISTS mail_in_strategy TEXT DEFAULT 'none'
    CHECK (mail_in_strategy IN ('fixed', 'percentage', 'deadline', 'none')),
  ADD COLUMN IF NOT EXISTS mail_in_value INTEGER,
  ADD COLUMN IF NOT EXISTS mail_in_deadline DATE,
  ADD COLUMN IF NOT EXISTS mail_in_auto_release BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mail_in_release_date DATE,
  ADD COLUMN IF NOT EXISTS waitlist_payment_deadline_hours INTEGER NOT NULL DEFAULT 48;

-- Validate mail_in_value is set when strategy requires it
ALTER TABLE shows ADD CONSTRAINT shows_mail_in_value_required
  CHECK (
    mail_in_strategy = 'none'
    OR mail_in_strategy = 'deadline'
    OR mail_in_value IS NOT NULL
  );

-- Validate mail_in_deadline is set when strategy = 'deadline'
ALTER TABLE shows ADD CONSTRAINT shows_mail_in_deadline_required
  CHECK (
    mail_in_strategy != 'deadline'
    OR mail_in_deadline IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- 2. Add capacity override to judge_assignments
-- -----------------------------------------------------------------------------

ALTER TABLE judge_assignments
  ADD COLUMN IF NOT EXISTS day_capacity_override INTEGER;

-- -----------------------------------------------------------------------------
-- 3. Extend entry_status with wait-list payment statuses
-- -----------------------------------------------------------------------------

-- Drop and recreate the inline CHECK constraint to add new values.
-- The constraint is named by Postgres as entries_entry_status_check.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check
  CHECK (entry_status IN (
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'checked-in', 'competing', 'completed',
    'withdrawn', 'scratched', 'absent',
    'pending-payment', 'promotion-expired'
  ));

-- -----------------------------------------------------------------------------
-- 4. get_judge_day_capacity() — core capacity function
-- -----------------------------------------------------------------------------
-- Returns capacity stats for a judge on a specific show date.
-- "Judge-day" = all classes assigned to this judge in trials on this date.

CREATE OR REPLACE FUNCTION get_judge_day_capacity(
  p_judge_id UUID,
  p_show_id UUID,
  p_date DATE
)
RETURNS TABLE (
  judge_id UUID,
  show_date DATE,
  capacity INTEGER,
  confirmed_count INTEGER,
  waitlist_count INTEGER,
  mail_in_reserved INTEGER,
  available_spots INTEGER,
  class_ids UUID[]
) AS $$
DECLARE
  v_capacity INTEGER;
  v_override INTEGER;
  v_show_capacity INTEGER;
  v_confirmed INTEGER;
  v_waitlist INTEGER;
  v_reserved INTEGER;
  v_class_ids UUID[];
  v_mail_in_strategy TEXT;
  v_mail_in_value INTEGER;
  v_mail_in_deadline DATE;
BEGIN
  -- Collect all class IDs for this judge on this date
  SELECT ARRAY_AGG(ja.class_id)
  INTO v_class_ids
  FROM judge_assignments ja
  JOIN classes c ON c.id = ja.class_id
  JOIN trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  -- Default to empty array if no assignments
  v_class_ids := COALESCE(v_class_ids, ARRAY[]::UUID[]);

  -- Get show-level default capacity and mail-in config
  SELECT s.default_judge_day_capacity, s.mail_in_strategy, s.mail_in_value, s.mail_in_deadline
  INTO v_show_capacity, v_mail_in_strategy, v_mail_in_value, v_mail_in_deadline
  FROM shows s
  WHERE s.id = p_show_id;

  -- Check for judge-specific override (use MAX since there could be
  -- multiple assignments; the override applies to the judge's whole day)
  SELECT MAX(ja.day_capacity_override)
  INTO v_override
  FROM judge_assignments ja
  JOIN classes c ON c.id = ja.class_id
  JOIN trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.day_capacity_override IS NOT NULL;

  v_capacity := COALESCE(v_override, v_show_capacity, 125);

  -- Calculate mail-in reserved spots
  v_reserved := 0;
  IF v_mail_in_strategy = 'fixed' THEN
    v_reserved := COALESCE(v_mail_in_value, 0);
  ELSIF v_mail_in_strategy = 'percentage' THEN
    v_reserved := FLOOR(v_capacity * COALESCE(v_mail_in_value, 0) / 100.0);
  ELSIF v_mail_in_strategy = 'deadline' THEN
    -- Deadline strategy: mail-in gets priority before the deadline,
    -- but doesn't block spots — online entries fill normally.
    v_reserved := 0;
  END IF;

  -- Count confirmed entries across all judge's classes for this day
  SELECT COUNT(*)
  INTO v_confirmed
  FROM entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'pending-payment')
    AND e.deleted_at IS NULL;

  -- Count active waitlist entries across all judge's classes for this day
  SELECT COUNT(*)
  INTO v_waitlist
  FROM waitlist_entries we
  WHERE we.class_id = ANY(v_class_ids)
    AND we.status = 'waiting';

  -- Return results
  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := v_waitlist;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_judge_day_capacity(UUID, UUID, DATE) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. promote_waitlist_entry() — atomic promotion with advisory lock
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION promote_waitlist_entry(
  p_waitlist_entry_id UUID,
  p_deadline_hours INTEGER DEFAULT 48
) RETURNS UUID AS $$
DECLARE
  v_wl waitlist_entries;
  v_new_entry_id UUID;
BEGIN
  -- Verify caller is secretary, club_admin, or site_admin
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'club_admin', 'site_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Lock this waitlist entry to prevent concurrent promotion
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  -- Fetch and verify still waiting
  SELECT * INTO v_wl FROM waitlist_entries WHERE id = p_waitlist_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist entry not found';
  END IF;
  IF v_wl.status != 'waiting' THEN
    RAISE EXCEPTION 'Waitlist entry is not available for promotion';
  END IF;

  -- Create entry with pending-payment status
  INSERT INTO entries (dog_id, class_id, show_id, trial_id, entry_status, handler_id)
  SELECT v_wl.dog_id, v_wl.class_id, t.show_id, c.trial_id, 'pending-payment', v_wl.handler_id
  FROM classes c JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
  RETURNING id INTO v_new_entry_id;

  -- Update waitlist entry to offered
  UPDATE waitlist_entries
  SET status = 'offered',
      offered_at = NOW(),
      offer_expires_at = NOW() + (p_deadline_hours || ' hours')::INTERVAL,
      updated_at = NOW()
  WHERE id = p_waitlist_entry_id;

  RETURN v_new_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION promote_waitlist_entry(UUID, INTEGER) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Performance index for entry counting
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS entries_class_status_idx
  ON entries(class_id, entry_status)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 7. Helper view: judge_day_summary
-- -----------------------------------------------------------------------------
-- Convenience view for the secretary dashboard. Lists every judge + date
-- combination for a show with their capacity stats.

CREATE OR REPLACE VIEW judge_day_summary AS
SELECT
  ja.show_id,
  ja.person_id AS judge_id,
  p.first_name || ' ' || p.last_name AS judge_name,
  t.date AS show_date,
  ARRAY_AGG(DISTINCT c.id) AS class_ids,
  ARRAY_AGG(DISTINCT c.name) AS class_names,
  COUNT(DISTINCT e.id) FILTER (
    WHERE e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'pending-payment')
    AND e.deleted_at IS NULL
  ) AS confirmed_count,
  COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'waiting') AS waitlist_count
FROM judge_assignments ja
JOIN people p ON p.id = ja.person_id
JOIN classes c ON c.id = ja.class_id
JOIN trials t ON t.id = c.trial_id
LEFT JOIN entries e ON e.class_id = c.id
LEFT JOIN waitlist_entries we ON we.class_id = c.id
WHERE ja.status = 'confirmed'
GROUP BY ja.show_id, ja.person_id, p.first_name, p.last_name, t.date;

-- Readable by authenticated users (secretary checks happen in app layer)
GRANT SELECT ON judge_day_summary TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Performance index for judge-day lookups
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS judge_assignments_person_show_class_idx
  ON judge_assignments(person_id, show_id, class_id)
  WHERE status = 'confirmed';

-- -----------------------------------------------------------------------------
-- 9. Deprecate old check_class_availability
-- -----------------------------------------------------------------------------

COMMENT ON FUNCTION check_class_availability(UUID) IS
  'DEPRECATED: Use get_judge_day_capacity() for judge-day capacity model. Retained for backwards compatibility.';
