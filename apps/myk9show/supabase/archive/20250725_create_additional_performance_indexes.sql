-- Create additional performance indexes based on actual schema
-- Phase 1.4 Enhancement: Performance optimization (comprehensive)
-- Created: 2025-01-25

-- People table indexes
-- Search by name is common
CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name);
CREATE INDEX IF NOT EXISTS idx_people_first_last_name ON people(last_name, first_name);
-- Email lookup for authentication
CREATE INDEX IF NOT EXISTS idx_people_email ON people(email) WHERE email IS NOT NULL;
-- Role-based queries
CREATE INDEX IF NOT EXISTS idx_people_roles ON people USING GIN(roles);

-- Dogs table indexes (additional to existing)
-- Name search
CREATE INDEX IF NOT EXISTS idx_dogs_name ON dogs(name);
CREATE INDEX IF NOT EXISTS idx_dogs_call_name ON dogs(call_name) WHERE call_name IS NOT NULL;
-- Filtering by characteristics
CREATE INDEX IF NOT EXISTS idx_dogs_breed_sex ON dogs(breed, sex);
CREATE INDEX IF NOT EXISTS idx_dogs_date_of_birth ON dogs(date_of_birth) WHERE date_of_birth IS NOT NULL;

-- Shows table indexes
-- Date range queries
CREATE INDEX IF NOT EXISTS idx_shows_start_date ON shows(start_date);
CREATE INDEX IF NOT EXISTS idx_shows_date_range ON shows(start_date, end_date);
-- Status filtering
CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);
-- Location search
CREATE INDEX IF NOT EXISTS idx_shows_city_state ON shows(city, state);

-- Show trials table indexes (additional to existing) 
-- Status filtering
CREATE INDEX IF NOT EXISTS idx_show_trials_status ON show_trials(status);
-- Composite for show + date queries
CREATE INDEX IF NOT EXISTS idx_show_trials_show_date ON show_trials(show_id, date);

-- Classes table indexes (additional to existing)
-- Fee range queries
CREATE INDEX IF NOT EXISTS idx_classes_entry_fee ON classes(entry_fee) WHERE entry_fee IS NOT NULL;
-- Time-based scheduling
CREATE INDEX IF NOT EXISTS idx_classes_start_time ON classes(start_time) WHERE start_time IS NOT NULL;
-- Breed restrictions using GIN for array search
CREATE INDEX IF NOT EXISTS idx_classes_breed_restrictions ON classes USING GIN(breed_restrictions) WHERE breed_restrictions IS NOT NULL;

-- Entries table indexes (additional to existing)
-- Status tracking
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
-- Composite for common queries
CREATE INDEX IF NOT EXISTS idx_entries_dog_class ON entries(dog_id, class_id);
CREATE INDEX IF NOT EXISTS idx_entries_class_status ON entries(class_id, status);

-- Results table indexes (additional to existing)
-- Placement queries
CREATE INDEX IF NOT EXISTS idx_results_placement ON results(placement) WHERE placement IS NOT NULL;
-- Score-based queries
CREATE INDEX IF NOT EXISTS idx_results_score ON results(score) WHERE score IS NOT NULL;
-- Composite for entry + placement
CREATE INDEX IF NOT EXISTS idx_results_entry_placement ON results(entry_id, placement);

-- Dog registrations table indexes (additional to existing)
-- Registration number lookup
CREATE INDEX IF NOT EXISTS idx_dog_registrations_number ON dog_registrations(registration_number);
-- Organization filtering
CREATE INDEX IF NOT EXISTS idx_dog_registrations_organization ON dog_registrations(organization);
-- Expiration date for renewal queries
CREATE INDEX IF NOT EXISTS idx_dog_registrations_expires ON dog_registrations(expires_on) WHERE expires_on IS NOT NULL;

-- Health records indexes
-- Type-based queries
CREATE INDEX IF NOT EXISTS idx_health_records_dog_type ON health_records(dog_id, record_type);
-- Date-based queries for recent records
CREATE INDEX IF NOT EXISTS idx_health_records_date ON health_records(date) WHERE date IS NOT NULL;
-- Expiration tracking
CREATE INDEX IF NOT EXISTS idx_health_records_expires ON health_records(expires_on) WHERE expires_on IS NOT NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_people_last_name IS 'Speed up people search by last name';
COMMENT ON INDEX idx_people_email IS 'Quick email lookup for authentication';
COMMENT ON INDEX idx_people_roles IS 'GIN index for role-based access queries';
COMMENT ON INDEX idx_dogs_breed_sex IS 'Composite index for breed and sex filtering';
COMMENT ON INDEX idx_shows_date_range IS 'Optimize date range queries for show listings';
COMMENT ON INDEX idx_entries_class_status IS 'Speed up class roster queries by status';
COMMENT ON INDEX idx_results_entry_placement IS 'Quick lookup of placements by entry';