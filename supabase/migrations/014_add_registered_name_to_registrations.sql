-- Migration: Add registered_name column to dog_registrations table
-- This allows storing the dog's registered name with each registration organization

-- Add registered_name column
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS registered_name TEXT;

-- Add breed column for storing the breed as registered with the organization
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS breed TEXT;

-- Add variety column for breed varieties (e.g., Standard, Miniature, Toy)
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS variety TEXT;

-- Add status column for registration status (pending, approved, expired, etc.)
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add application_number for tracking applications
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS application_number TEXT;

-- Add submission_date for when the application was submitted
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS submission_date DATE;

-- Add certificate column for storing certificate file reference
ALTER TABLE dog_registrations
ADD COLUMN IF NOT EXISTS certificate TEXT;

-- Create index on organization for faster lookups
CREATE INDEX IF NOT EXISTS idx_dog_registrations_organization
ON dog_registrations(organization);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_dog_registrations_status
ON dog_registrations(status);

-- Add comment to table
COMMENT ON TABLE dog_registrations IS 'Stores dog registration information with various kennel clubs and organizations';
COMMENT ON COLUMN dog_registrations.registered_name IS 'The official registered name of the dog with this organization';
COMMENT ON COLUMN dog_registrations.breed IS 'The breed as registered with this organization';
COMMENT ON COLUMN dog_registrations.variety IS 'Breed variety if applicable (e.g., Standard, Miniature, Toy)';
COMMENT ON COLUMN dog_registrations.status IS 'Registration status: pending, approved, expired, suspended, rejected';
COMMENT ON COLUMN dog_registrations.application_number IS 'Application tracking number';
COMMENT ON COLUMN dog_registrations.submission_date IS 'Date the registration application was submitted';
COMMENT ON COLUMN dog_registrations.certificate IS 'Reference to registration certificate file';
