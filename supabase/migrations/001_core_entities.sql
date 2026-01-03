-- =============================================================================
-- Migration 001: Core Entities
-- =============================================================================
-- Creates the foundational tables shared by both myK9Show and myK9Q:
-- - clubs: Dog clubs and organizations
-- - people: Handlers, owners, judges, secretaries
-- - dogs: Dog records with registration info
--
-- These tables form the base of the unified myk9-platform schema.
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =============================================================================
-- CLUBS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  description TEXT,

  -- Multi-tenant support (for myK9Q license key isolation)
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS clubs_license_key_idx ON clubs(license_key);
CREATE INDEX IF NOT EXISTS clubs_name_idx ON clubs(name);

-- =============================================================================
-- PEOPLE TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),

  -- Basic info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Address
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',

  -- Profile
  profile_image TEXT,
  bio TEXT,

  -- Roles (exhibitor, judge, secretary, handler, etc.)
  roles TEXT[] DEFAULT '{}',

  -- Auth link (Supabase auth user)
  auth_user_id UUID,

  -- Multi-tenant support
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS people_auth_user_id_idx ON people(auth_user_id);
CREATE INDEX IF NOT EXISTS people_license_key_idx ON people(license_key);
CREATE INDEX IF NOT EXISTS people_email_idx ON people(email);
CREATE INDEX IF NOT EXISTS people_name_idx ON people(last_name, first_name);

-- =============================================================================
-- DOGS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS dogs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),

  -- Basic info
  name TEXT NOT NULL,  -- Registered name
  call_name TEXT,      -- Common name
  breed TEXT NOT NULL,
  sex TEXT CHECK (sex IN ('male', 'female')),
  date_of_birth DATE,

  -- Physical attributes
  color TEXT,
  height TEXT,         -- Jump height category
  weight TEXT,

  -- Registration numbers
  akc_number TEXT,
  ukc_number TEXT,
  other_registry TEXT,
  other_registry_number TEXT,
  microchip_number TEXT,

  -- Media
  image_url TEXT,

  -- Status
  spayed_neutered BOOLEAN DEFAULT FALSE,
  deceased BOOLEAN DEFAULT FALSE,
  deceased_date DATE,

  -- Ownership
  owner_id UUID REFERENCES people(id) ON DELETE SET NULL,
  co_owner_id UUID REFERENCES people(id) ON DELETE SET NULL,
  breeder_id UUID REFERENCES people(id) ON DELETE SET NULL,

  -- Multi-tenant support
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS dogs_owner_id_idx ON dogs(owner_id);
CREATE INDEX IF NOT EXISTS dogs_license_key_idx ON dogs(license_key);
CREATE INDEX IF NOT EXISTS dogs_breed_idx ON dogs(breed);
CREATE INDEX IF NOT EXISTS dogs_call_name_idx ON dogs(call_name);
CREATE INDEX IF NOT EXISTS dogs_akc_number_idx ON dogs(akc_number);

-- =============================================================================
-- DOG REGISTRATIONS TABLE (registration numbers by organization)
-- =============================================================================
CREATE TABLE IF NOT EXISTS dog_registrations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,  -- 'AKC', 'UKC', 'ASCA', etc.
  registration_number TEXT NOT NULL,
  registration_date DATE,
  verified BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one registration per org per dog
  UNIQUE(dog_id, organization)
);

-- Indexes
CREATE INDEX IF NOT EXISTS dog_registrations_dog_id_idx ON dog_registrations(dog_id);
CREATE INDEX IF NOT EXISTS dog_registrations_org_number_idx ON dog_registrations(organization, registration_number);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dogs_updated_at
  BEFORE UPDATE ON dogs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dog_registrations_updated_at
  BEFORE UPDATE ON dog_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 001: Core entities created successfully' as status;
