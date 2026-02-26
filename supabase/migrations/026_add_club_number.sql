-- Add club_number column to clubs table
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_number TEXT;
