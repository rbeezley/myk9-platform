-- Create essential performance indexes for database integration
-- Updated for singular table names post-migration
-- Phase 0: Performance Infrastructure
-- Created: 2025-01-26

-- User table indexes (renamed from people)
-- Search by name is common
CREATE INDEX IF NOT EXISTS idx_user_last_name ON "user"(last_name);
CREATE INDEX IF NOT EXISTS idx_user_first_last_name ON "user"(last_name, first_name);
-- Email lookup for authentication and uniqueness
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email) WHERE email IS NOT NULL;
-- Role-based queries (if roles column exists)
CREATE INDEX IF NOT EXISTS idx_user_roles ON "user" USING GIN(roles) WHERE roles IS NOT NULL;

-- Dog table indexes
-- Name search - primary sorting field
CREATE INDEX IF NOT EXISTS idx_dog_name ON dog(name);
CREATE INDEX IF NOT EXISTS idx_dog_call_name ON dog(call_name) WHERE call_name IS NOT NULL;
-- Owner relationship (critical for ownership queries)
CREATE INDEX IF NOT EXISTS idx_dog_owner_id ON dog(owner_id);
-- Filtering by characteristics
CREATE INDEX IF NOT EXISTS idx_dog_breed_sex ON dog(breed, sex);
CREATE INDEX IF NOT EXISTS idx_dog_birth_date ON dog(date_of_birth) WHERE date_of_birth IS NOT NULL;
-- Search functionality
CREATE INDEX IF NOT EXISTS idx_dog_breed ON dog(breed);

-- Show table indexes
-- Date range queries (most common show queries)
CREATE INDEX IF NOT EXISTS idx_show_start_date ON show(start_date);
CREATE INDEX IF NOT EXISTS idx_show_date_range ON show(start_date, end_date);
-- Club relationship
CREATE INDEX IF NOT EXISTS idx_show_club_id ON show(club_id);
-- Status filtering
CREATE INDEX IF NOT EXISTS idx_show_status ON show(status) WHERE status IS NOT NULL;
-- Location search
CREATE INDEX IF NOT EXISTS idx_show_location ON show(location) WHERE location IS NOT NULL;

-- Trial table indexes (renamed from show_trials)
-- Show relationship
CREATE INDEX IF NOT EXISTS idx_trial_show_id ON trial(show_id);
-- Date ordering
CREATE INDEX IF NOT EXISTS idx_trial_date ON trial(date);
-- Status filtering
CREATE INDEX IF NOT EXISTS idx_trial_status ON trial(status) WHERE status IS NOT NULL;
-- Composite for show + date queries
CREATE INDEX IF NOT EXISTS idx_trial_show_date ON trial(show_id, date);

-- Class table indexes
-- Trial relationship
CREATE INDEX IF NOT EXISTS idx_class_trial_id ON class(trial_id);
-- Class name for ordering (no class_number column exists)
CREATE INDEX IF NOT EXISTS idx_class_name ON class(name);
-- Fee range queries
CREATE INDEX IF NOT EXISTS idx_class_entry_fee ON class(entry_fee) WHERE entry_fee IS NOT NULL;
-- Time-based scheduling
CREATE INDEX IF NOT EXISTS idx_class_start_time ON class(start_time) WHERE start_time IS NOT NULL;

-- Entry table indexes
-- Core relationships
CREATE INDEX IF NOT EXISTS idx_entry_dog_id ON entry(dog_id);
CREATE INDEX IF NOT EXISTS idx_entry_class_id ON entry(class_id);
-- Status tracking (critical for entry management)
CREATE INDEX IF NOT EXISTS idx_entry_status ON entry(status);
-- Composite for common queries
CREATE INDEX IF NOT EXISTS idx_entry_dog_class ON entry(dog_id, class_id);
CREATE INDEX IF NOT EXISTS idx_entry_class_status ON entry(class_id, status);

-- Result table indexes
-- Entry relationship
CREATE INDEX IF NOT EXISTS idx_result_entry_id ON result(entry_id);
-- Placement queries
CREATE INDEX IF NOT EXISTS idx_result_placement ON result(placement) WHERE placement IS NOT NULL;
-- Score-based queries
CREATE INDEX IF NOT EXISTS idx_result_score ON result(score) WHERE score IS NOT NULL;
-- Composite for entry + placement
CREATE INDEX IF NOT EXISTS idx_result_entry_placement ON result(entry_id, placement);

-- Club table indexes
-- Name search
CREATE INDEX IF NOT EXISTS idx_club_name ON club(name);
-- Location-based queries
CREATE INDEX IF NOT EXISTS idx_club_address ON club(address) WHERE address IS NOT NULL;

-- Dog registration table indexes
-- Dog relationship
CREATE INDEX IF NOT EXISTS idx_dog_registration_dog_id ON dog_registration(dog_id);
-- Registration number lookup (unique identifiers)
CREATE INDEX IF NOT EXISTS idx_dog_registration_number ON dog_registration(registration_number);
-- Organization filtering
CREATE INDEX IF NOT EXISTS idx_dog_registration_organization ON dog_registration(organization);

-- Health record table indexes (if exists)
-- Dog relationship
CREATE INDEX IF NOT EXISTS idx_health_record_dog_id ON health_record(dog_id);
-- Date-based queries for recent records
CREATE INDEX IF NOT EXISTS idx_health_record_date ON health_record(date) WHERE date IS NOT NULL;

-- Full-text search indexes for common search patterns
-- Dog search (name, breed, call_name)
CREATE INDEX IF NOT EXISTS idx_dog_search_trgm ON dog USING gin ((name || ' ' || breed || ' ' || COALESCE(call_name, '')) gin_trgm_ops);
-- User search (first_name, last_name, email)
CREATE INDEX IF NOT EXISTS idx_user_search_trgm ON "user" USING gin ((first_name || ' ' || last_name || ' ' || COALESCE(email, '')) gin_trgm_ops);
-- Show search (name, location)
CREATE INDEX IF NOT EXISTS idx_show_search_trgm ON show USING gin ((name || ' ' || COALESCE(location, '')) gin_trgm_ops);

-- Add comments for documentation
COMMENT ON INDEX idx_user_last_name IS 'Speed up user search by last name';
COMMENT ON INDEX idx_user_email IS 'Quick email lookup for authentication';
COMMENT ON INDEX idx_dog_owner_id IS 'Critical for dog ownership queries';
COMMENT ON INDEX idx_dog_name IS 'Primary sorting field for dogs';
COMMENT ON INDEX idx_show_date_range IS 'Optimize date range queries for show listings';
COMMENT ON INDEX idx_entry_class_status IS 'Speed up class roster queries by status';
COMMENT ON INDEX idx_result_entry_placement IS 'Quick lookup of placements by entry';
COMMENT ON INDEX idx_dog_search_trgm IS 'Full-text search for dogs using trigrams';
COMMENT ON INDEX idx_user_search_trgm IS 'Full-text search for users using trigrams';
COMMENT ON INDEX idx_show_search_trgm IS 'Full-text search for shows using trigrams';

-- Enable pg_trgm extension if not already enabled (for full-text search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;