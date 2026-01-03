-- Phase 0: Performance Infrastructure - Essential Indexes
-- Created for database integration Phase 0
-- Date: 2025-01-26

-- Enable pg_trgm extension for full-text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- User table indexes (essential for authentication and search)
CREATE INDEX IF NOT EXISTS idx_user_last_name ON "user"(last_name);
CREATE INDEX IF NOT EXISTS idx_user_first_last_name ON "user"(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email) WHERE email IS NOT NULL;

-- Dog table indexes (essential for owner queries and search)
CREATE INDEX IF NOT EXISTS idx_dog_name ON dog(name);
CREATE INDEX IF NOT EXISTS idx_dog_owner_id ON dog(owner_id);
CREATE INDEX IF NOT EXISTS idx_dog_breed ON dog(breed);

-- Show table indexes (essential for date-based queries)
CREATE INDEX IF NOT EXISTS idx_show_start_date ON show(start_date);
CREATE INDEX IF NOT EXISTS idx_show_club_id ON show(club_id);

-- Entry table indexes (essential for competition management)
CREATE INDEX IF NOT EXISTS idx_entry_dog_id ON entry(dog_id);
CREATE INDEX IF NOT EXISTS idx_entry_class_id ON entry(class_id);
CREATE INDEX IF NOT EXISTS idx_entry_status ON entry(status);

-- Class table indexes (essential for trial management)
CREATE INDEX IF NOT EXISTS idx_class_trial_id ON class(trial_id);

-- Trial table indexes (essential for show organization)
CREATE INDEX IF NOT EXISTS idx_trial_show_id ON trial(show_id);
CREATE INDEX IF NOT EXISTS idx_trial_date ON trial(date);

-- Result table indexes (essential for competition results)
CREATE INDEX IF NOT EXISTS idx_result_entry_id ON result(entry_id);

-- Full-text search indexes for user experience
CREATE INDEX IF NOT EXISTS idx_dog_search_trgm ON dog USING gin ((name || ' ' || breed || ' ' || COALESCE(call_name, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_search_trgm ON "user" USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Add performance comments
COMMENT ON INDEX idx_dog_owner_id IS 'Critical for dog ownership queries - Phase 0';
COMMENT ON INDEX idx_entry_status IS 'Essential for entry management - Phase 0';
COMMENT ON INDEX idx_show_start_date IS 'Core for show date queries - Phase 0';
COMMENT ON INDEX idx_dog_search_trgm IS 'Full-text search for dogs - Phase 0';