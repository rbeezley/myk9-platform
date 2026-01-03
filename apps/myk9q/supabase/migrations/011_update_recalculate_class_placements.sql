-- Update recalculate_class_placements function to accept array of class IDs
-- Migration: 011_update_recalculate_class_placements.sql
-- This allows us to recalculate placements for multiple classes at once (e.g., Novice A & B)
-- while maintaining separate placement calculations for each class

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS recalculate_class_placements(bigint, boolean);

-- Create updated function that accepts array of class IDs
CREATE OR REPLACE FUNCTION recalculate_class_placements(
  p_class_ids bigint[],
  p_is_nationals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id bigint;
BEGIN
  -- Loop through each class ID and calculate placements separately
  FOREACH v_class_id IN ARRAY p_class_ids
  LOOP
    IF p_is_nationals THEN
      -- Nationals: Rank by qualifying, then points (descending), then time (ascending)
      UPDATE results r
      SET final_placement = ranked.placement
      FROM (
        SELECT
          r2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN r2.result_status = 'q' OR r2.result_status = 'qualified' THEN 0 ELSE 1 END,
              r2.points_earned DESC NULLS LAST,
              r2.search_time_seconds ASC NULLS LAST
          ) as placement
        FROM results r2
        INNER JOIN entries e ON r2.entry_id = e.id
        WHERE e.class_id = v_class_id
          AND r2.is_scored = true
          AND (r2.result_status = 'q' OR r2.result_status = 'qualified')
      ) ranked
      WHERE r.id = ranked.id;
    ELSE
      -- Regular: Rank by qualifying, then faults (ascending), then time (ascending)
      UPDATE results r
      SET final_placement = ranked.placement
      FROM (
        SELECT
          r2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN r2.result_status = 'q' OR r2.result_status = 'qualified' THEN 0 ELSE 1 END,
              r2.total_faults ASC NULLS LAST,
              r2.search_time_seconds ASC NULLS LAST
          ) as placement
        FROM results r2
        INNER JOIN entries e ON r2.entry_id = e.id
        WHERE e.class_id = v_class_id
          AND r2.is_scored = true
          AND (r2.result_status = 'q' OR r2.result_status = 'qualified')
      ) ranked
      WHERE r.id = ranked.id;
    END IF;

    -- Clear placements for non-qualifying entries
    UPDATE results r
    SET final_placement = NULL
    FROM entries e
    WHERE r.entry_id = e.id
      AND e.class_id = v_class_id
      AND (r.result_status IS NULL OR (r.result_status != 'q' AND r.result_status != 'qualified'));

  END LOOP;
END;
$$;

-- Add comment
COMMENT ON FUNCTION recalculate_class_placements IS 'Recalculates placements for one or more classes. Placements are calculated separately per class, even when multiple class IDs are provided (e.g., for combined Novice A & B view).';
