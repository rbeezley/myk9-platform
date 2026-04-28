-- supabase/migrations/166_armband_per_dog_per_show.sql
-- Enforce one armband assignment per dog per show.
-- 1) Backfill from entries.armband (legacy data)
-- 2) Deduplicate
-- 3) Add UNIQUE constraint
-- 4) Ensure RLS lets trial secretaries write the table

-- ---------------------------------------------------------------------------
-- 1) Backfill armbands table from entries.armband (legacy data)
--    For every (show_id, dog_id) that has armband set in entries but no
--    matching row in armbands, insert one. If conflicting (multiple armband
--    values for same dog in same show), pick the most recent updated entry.
-- ---------------------------------------------------------------------------

INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
SELECT
  e.show_id,
  e.dog_id,
  e.armband,
  COALESCE(e.updated_at, NOW()),
  FALSE
FROM (
  SELECT DISTINCT ON (show_id, dog_id)
    show_id, dog_id, armband, updated_at
  FROM entries
  WHERE armband IS NOT NULL
    AND show_id IS NOT NULL
    AND dog_id IS NOT NULL
    AND deleted_at IS NULL
  ORDER BY show_id, dog_id, updated_at DESC
) e
LEFT JOIN armbands a
  ON a.show_id = e.show_id AND a.dog_id = e.dog_id
WHERE a.id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Deduplicate: keep the most recent armband row per (show_id, dog_id)
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY show_id, dog_id
      ORDER BY created_at DESC
    ) AS rn
  FROM armbands
  WHERE dog_id IS NOT NULL
)
DELETE FROM armbands WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- 3) Add unique constraint: one armband per dog per show
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'armbands'
      AND constraint_name = 'armbands_show_dog_unique'
  ) THEN
    ALTER TABLE armbands ADD CONSTRAINT armbands_show_dog_unique UNIQUE (show_id, dog_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) RLS: trial secretaries can manage armbands for their shows
--    (Use IF NOT EXISTS so re-running is safe)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'armbands'
      AND policyname = 'secretaries_manage_armbands'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "secretaries_manage_armbands" ON armbands
      FOR ALL USING (
        show_id IN (
          SELECT s.id FROM shows s
          WHERE has_role('trial_secretary', s.club_id)
             OR has_role('club_admin', s.club_id)
             OR has_role('platform_admin')
        )
      ) WITH CHECK (
        show_id IN (
          SELECT s.id FROM shows s
          WHERE has_role('trial_secretary', s.club_id)
             OR has_role('club_admin', s.club_id)
             OR has_role('platform_admin')
        )
      );
    $POLICY$;
  END IF;
END $$;

SELECT 'Migration 166: armbands backfilled, deduplicated, UNIQUE(show_id, dog_id) added, RLS enabled' AS status;
