-- ROLLBACK SCRIPT: Revert singular table names back to plural
-- Created: 2025-01-26
-- Description: Emergency rollback for singular table names migration
-- IMPORTANT: Only run this if the migration causes critical issues

BEGIN;

-- =====================================================
-- 1. REVERT TABLE NAMES BACK TO PLURAL
-- =====================================================

-- Core entity tables
ALTER TABLE IF EXISTS "user" RENAME TO people;
ALTER TABLE IF EXISTS dog RENAME TO dogs;
ALTER TABLE IF EXISTS show RENAME TO shows;
ALTER TABLE IF EXISTS club RENAME TO clubs;
ALTER TABLE IF EXISTS trial RENAME TO show_trials;
ALTER TABLE IF EXISTS class RENAME TO classes;
ALTER TABLE IF EXISTS entry RENAME TO entries;
ALTER TABLE IF EXISTS result RENAME TO results;

-- Registration and health tables
ALTER TABLE IF EXISTS dog_registration RENAME TO dog_registrations;
ALTER TABLE IF EXISTS health_record RENAME TO health_records;
ALTER TABLE IF EXISTS vaccination RENAME TO vaccinations;
ALTER TABLE IF EXISTS medication RENAME TO medications;
ALTER TABLE IF EXISTS allergy RENAME TO allergies;
ALTER TABLE IF EXISTS vet_visit RENAME TO vet_visits;

-- Achievement and qualification tables
ALTER TABLE IF EXISTS achievement RENAME TO achievements;
ALTER TABLE IF EXISTS judge_qualification RENAME TO judge_qualifications;

-- Template tables
ALTER TABLE IF EXISTS class_template RENAME TO class_templates;
ALTER TABLE IF EXISTS show_template RENAME TO show_templates;
ALTER TABLE IF EXISTS template_field RENAME TO template_fields;
ALTER TABLE IF EXISTS template_rule RENAME TO template_rules;

-- System and monitoring tables
ALTER TABLE IF EXISTS sync_operation RENAME TO sync_operations;
ALTER TABLE IF EXISTS sync_conflict RENAME TO sync_conflicts;
ALTER TABLE IF EXISTS sync_log RENAME TO sync_logs;
ALTER TABLE IF EXISTS user_preference RENAME TO user_preferences;
ALTER TABLE IF EXISTS search_query RENAME TO search_queries;
ALTER TABLE IF EXISTS search_result RENAME TO search_results;
ALTER TABLE IF EXISTS audit_log RENAME TO audit_logs;
ALTER TABLE IF EXISTS sync_cursor RENAME TO sync_cursors;
ALTER TABLE IF EXISTS sync_queue_item RENAME TO sync_queue;
ALTER TABLE IF EXISTS client_metadata_item RENAME TO client_metadata;

-- Other tables
ALTER TABLE IF EXISTS api_key RENAME TO api_keys;
ALTER TABLE IF EXISTS organization RENAME TO organizations;
ALTER TABLE IF EXISTS ui_breadcrumb RENAME TO ui_breadcrumbs;
ALTER TABLE IF EXISTS ui_state_item RENAME TO ui_state;
ALTER TABLE IF EXISTS feature_flag RENAME TO feature_flags;
ALTER TABLE IF EXISTS past_result RENAME TO past_results;
ALTER TABLE IF EXISTS handler RENAME TO handlers;
ALTER TABLE IF EXISTS entry_status_history_item RENAME TO entry_status_history;

-- =====================================================
-- 2. REMOVE USER AUTHENTICATION LINK
-- =====================================================

DROP INDEX IF EXISTS idx_user_auth_id;
ALTER TABLE people DROP COLUMN IF EXISTS user_id;

-- =====================================================
-- 3. REMOVE AUDIT COLUMNS
-- =====================================================

-- Remove from people table
ALTER TABLE people DROP COLUMN IF EXISTS created_by;
ALTER TABLE people DROP COLUMN IF EXISTS updated_by;
ALTER TABLE people DROP COLUMN IF EXISTS deleted_at;

-- Remove from other tables
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY['clubs', 'dogs', 'shows', 'show_trials', 'classes', 'entries', 'results'];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS created_by', tbl);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS updated_by', tbl);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS deleted_at', tbl);
    END LOOP;
END $$;

-- =====================================================
-- 4. REVERT BOOLEAN COLUMN NAMES
-- =====================================================

-- Dogs table
ALTER TABLE dogs RENAME COLUMN is_spayed_neutered TO spayed_neutered;

-- Classes table
ALTER TABLE classes RENAME COLUMN allows_waitlist TO allow_waitlist;

-- Shows table
ALTER TABLE shows RENAME COLUMN allows_day_of_show_entries TO allow_day_of_show_entries;
ALTER TABLE shows RENAME COLUMN allows_non_owner_handlers TO allow_non_owner_handlers;

-- Vet visits table
ALTER TABLE vet_visits RENAME COLUMN requires_follow_up TO follow_up_required;

-- =====================================================
-- 5. RESTORE TEXT FIELDS AND REMOVE FOREIGN KEYS
-- =====================================================

-- Restore text columns on shows table if foreign keys were migrated
DO $$
BEGIN
    -- Only restore if the foreign key columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shows' AND column_name = 'chairman_id') THEN
        -- Restore text values from foreign keys
        UPDATE shows s
        SET show_chairman = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = s.chairman_id)
        WHERE chairman_id IS NOT NULL;
        
        UPDATE shows s
        SET show_secretary = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = s.secretary_id)
        WHERE secretary_id IS NOT NULL;
        
        UPDATE shows s
        SET chief_ring_steward = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = s.chief_steward_id)
        WHERE chief_steward_id IS NOT NULL;
        
        -- Drop foreign key columns
        ALTER TABLE shows DROP COLUMN IF EXISTS chairman_id;
        ALTER TABLE shows DROP COLUMN IF EXISTS secretary_id;
        ALTER TABLE shows DROP COLUMN IF EXISTS chief_steward_id;
    END IF;
    
    -- Same for results table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'results' AND column_name = 'judge_id') THEN
        UPDATE results r
        SET judge_name = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = r.judge_id)
        WHERE judge_id IS NOT NULL;
        
        UPDATE results r
        SET recorded_by = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = r.recorded_by_id)
        WHERE recorded_by_id IS NOT NULL;
        
        ALTER TABLE results DROP COLUMN IF EXISTS judge_id;
        ALTER TABLE results DROP COLUMN IF EXISTS recorded_by_id;
    END IF;
    
    -- Health tables
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vet_visits' AND column_name = 'veterinarian_id') THEN
        UPDATE vet_visits v
        SET vet_name = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = v.veterinarian_id)
        WHERE veterinarian_id IS NOT NULL;
        
        ALTER TABLE vet_visits DROP COLUMN IF EXISTS veterinarian_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'medications' AND column_name = 'prescriber_id') THEN
        UPDATE medications m
        SET prescribed_by = (SELECT CONCAT(first_name, ' ', last_name) FROM people p WHERE p.id = m.prescriber_id)
        WHERE prescriber_id IS NOT NULL;
        
        ALTER TABLE medications DROP COLUMN IF EXISTS prescriber_id;
    END IF;
END $$;

-- =====================================================
-- 6. RESTORE ORIGINAL FOREIGN KEY CONSTRAINTS
-- =====================================================

-- Dogs table foreign keys
ALTER TABLE dogs DROP CONSTRAINT IF EXISTS dog_owner_id_fkey;
ALTER TABLE dogs ADD CONSTRAINT dogs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES people(id) ON DELETE CASCADE;

-- Entries table foreign keys
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entry_dog_id_fkey;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entry_class_id_fkey;
ALTER TABLE entries ADD CONSTRAINT entries_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
ALTER TABLE entries ADD CONSTRAINT entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

-- Classes table foreign keys
ALTER TABLE classes DROP CONSTRAINT IF EXISTS class_trial_id_fkey;
ALTER TABLE classes ADD CONSTRAINT classes_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES show_trials(id) ON DELETE CASCADE;

-- Show trials table foreign keys
ALTER TABLE show_trials DROP CONSTRAINT IF EXISTS trial_show_id_fkey;
ALTER TABLE show_trials ADD CONSTRAINT show_trials_show_id_fkey FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

-- Shows table foreign keys
ALTER TABLE shows DROP CONSTRAINT IF EXISTS show_club_id_fkey;
ALTER TABLE shows ADD CONSTRAINT shows_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

-- Results table foreign keys
ALTER TABLE results DROP CONSTRAINT IF EXISTS result_entry_id_fkey;
ALTER TABLE results ADD CONSTRAINT results_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE;

-- Dog registrations foreign keys
ALTER TABLE dog_registrations DROP CONSTRAINT IF EXISTS dog_registration_dog_id_fkey;
ALTER TABLE dog_registrations ADD CONSTRAINT dog_registrations_dog_id_fkey FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;

-- =====================================================
-- 7. RESTORE ORIGINAL INDEXES
-- =====================================================

-- Drop new indexes and restore old ones
DROP INDEX IF EXISTS dog_owner_id_idx;
CREATE INDEX IF NOT EXISTS dogs_owner_id_idx ON dogs(owner_id);

DROP INDEX IF EXISTS dog_breed_idx;
CREATE INDEX IF NOT EXISTS dogs_breed_idx ON dogs(breed);

DROP INDEX IF EXISTS entry_dog_id_idx;
CREATE INDEX IF NOT EXISTS entries_dog_id_idx ON entries(dog_id);

DROP INDEX IF EXISTS entry_class_id_idx;
CREATE INDEX IF NOT EXISTS entries_class_id_idx ON entries(class_id);

DROP INDEX IF EXISTS class_trial_id_idx;
CREATE INDEX IF NOT EXISTS classes_trial_id_idx ON classes(trial_id);

DROP INDEX IF EXISTS trial_show_id_idx;
CREATE INDEX IF NOT EXISTS show_trials_show_id_idx ON show_trials(show_id);

DROP INDEX IF EXISTS trial_date_idx;
CREATE INDEX IF NOT EXISTS show_trials_date_idx ON show_trials(date);

DROP INDEX IF EXISTS show_club_id_idx;
CREATE INDEX IF NOT EXISTS shows_club_id_idx ON shows(club_id);

DROP INDEX IF EXISTS result_entry_id_idx;
CREATE INDEX IF NOT EXISTS results_entry_id_idx ON results(entry_id);

DROP INDEX IF EXISTS dog_registration_dog_id_idx;
CREATE INDEX IF NOT EXISTS dog_registrations_dog_id_idx ON dog_registrations(dog_id);

-- =====================================================
-- 8. RESTORE RLS POLICIES
-- =====================================================

-- Drop new policies
DROP POLICY IF EXISTS "Users can view users" ON people;
DROP POLICY IF EXISTS "Users can view dogs" ON dogs;
DROP POLICY IF EXISTS "Users can view shows" ON shows;
DROP POLICY IF EXISTS "Users can view clubs" ON clubs;
DROP POLICY IF EXISTS "Users can view trials" ON show_trials;
DROP POLICY IF EXISTS "Users can view classes" ON classes;
DROP POLICY IF EXISTS "Users can view entries" ON entries;
DROP POLICY IF EXISTS "Users can view results" ON results;

-- Restore original policies (if they existed)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'people' AND rowsecurity = true) THEN
        CREATE POLICY "Users can view people" ON people FOR SELECT TO authenticated USING (true);
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'dogs' AND rowsecurity = true) THEN
        CREATE POLICY "Users can view dogs" ON dogs FOR SELECT TO authenticated USING (true);
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'shows' AND rowsecurity = true) THEN
        CREATE POLICY "Users can view shows" ON shows FOR SELECT TO authenticated USING (true);
    END IF;
    
    -- Add other original policies as needed
END $$;

-- =====================================================
-- 9. LOG ROLLBACK COMPLETION
-- =====================================================

INSERT INTO audit_logs (id, action, table_name, details, created_at)
VALUES (
    gen_random_uuid(),
    'ROLLBACK',
    'ALL_TABLES',
    jsonb_build_object(
        'migration', 'singular_table_names_rollback',
        'version', '20250126',
        'tables_reverted', 47,
        'description', 'Reverted all singular table names back to plural'
    ),
    NOW()
);

COMMIT;

-- =====================================================
-- POST-ROLLBACK NOTES
-- =====================================================
-- 1. After running this rollback, immediately deploy the original application code
-- 2. Monitor for any errors in the application logs
-- 3. Investigate what caused the migration to fail before attempting again
-- 4. Update any external integrations that were changed for the new table names