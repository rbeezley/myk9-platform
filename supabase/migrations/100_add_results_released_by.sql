-- Add audit column to track who released results for a class
ALTER TABLE classes ADD COLUMN results_released_by UUID REFERENCES auth.users(id);
