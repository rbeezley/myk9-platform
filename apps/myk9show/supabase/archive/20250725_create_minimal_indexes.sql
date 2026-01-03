-- Create minimal performance indexes for core tables
-- Phase 1.4 Enhancement: Performance optimization (verified columns only)
-- Created: 2025-01-25
-- Updated: 2025-01-26 - Updated to use singular table names after migration

-- Note: Only creating indexes for columns that definitely exist

-- Dog table - foreign key index (singular)
CREATE INDEX IF NOT EXISTS idx_dog_owner_id ON dog(owner_id);

-- Entry table - foreign key indexes (singular)
CREATE INDEX IF NOT EXISTS idx_entry_dog_id ON entry(dog_id);
CREATE INDEX IF NOT EXISTS idx_entry_class_id ON entry(class_id);

-- Class table - foreign key index (singular)
CREATE INDEX IF NOT EXISTS idx_class_trial_id ON class(trial_id);

-- Trial table - foreign key index (singular - renamed from show_trials)
CREATE INDEX IF NOT EXISTS idx_trial_show_id ON trial(show_id);

-- Show table - foreign key index (singular)
CREATE INDEX IF NOT EXISTS idx_show_club_id ON show(club_id);

-- Result table - foreign key index (singular)
CREATE INDEX IF NOT EXISTS idx_result_entry_id ON result(entry_id);

-- Dog registration table - foreign key index (singular)
CREATE INDEX IF NOT EXISTS idx_dog_registration_dog_id ON dog_registration(dog_id);

-- Add comments
COMMENT ON INDEX idx_dog_owner_id IS 'Foreign key index for dog ownership queries';
COMMENT ON INDEX idx_entry_dog_id IS 'Foreign key index for dog entry queries';
COMMENT ON INDEX idx_show_club_id IS 'Foreign key index for club show queries';