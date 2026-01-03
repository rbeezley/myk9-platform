-- Fix announcements table schema
-- Add missing columns that may not exist if table was created before our migration

-- Add author_role column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'author_role'
    ) THEN
        ALTER TABLE announcements ADD COLUMN author_role TEXT NOT NULL DEFAULT 'admin' CHECK (author_role IN ('admin', 'judge', 'steward'));
    END IF;
END $$;

-- Add author_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'author_name'
    ) THEN
        ALTER TABLE announcements ADD COLUMN author_name TEXT;
    END IF;
END $$;

-- Add priority column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'priority'
    ) THEN
        ALTER TABLE announcements ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent'));
    END IF;
END $$;

-- Add expires_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE announcements ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add is_active column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE announcements ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'announcements' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE announcements ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Ensure we have the updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
CREATE TRIGGER update_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();