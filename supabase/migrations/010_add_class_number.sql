-- Migration: Add class_number column to classes table
-- This column is used for display ordering and identifying classes (e.g., "Class 1", "Class 2")

-- Add class_number column to classes
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS class_number VARCHAR(20);

-- Add index for ordering by class_number
CREATE INDEX IF NOT EXISTS idx_classes_class_number ON classes(class_number);

-- Add comment
COMMENT ON COLUMN classes.class_number IS 'Display number/identifier for the class (e.g., "1", "2A", "NW-1")';
