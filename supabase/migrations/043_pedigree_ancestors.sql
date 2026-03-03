-- Migration 043: Pedigree Ancestors
-- Sprint 4: Exhibitors can track their dog's 3-generation pedigree.
-- Each row = one ancestor at a specific position in the family tree.

CREATE TABLE IF NOT EXISTS pedigree_ancestors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Position in the 3-generation tree
  position TEXT NOT NULL
    CHECK (position IN ('sire', 'dam', 'sire_grandsire', 'sire_granddam', 'dam_grandsire', 'dam_granddam')),

  -- Optional link to a platform dog (if ancestor is also registered)
  linked_dog_id UUID REFERENCES dogs(id) ON DELETE SET NULL,

  -- Identity
  registered_name TEXT NOT NULL,
  call_name TEXT,
  titles TEXT,
  breed TEXT,
  color TEXT,
  sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female')),
  date_of_birth DATE,
  photo_url TEXT,

  -- Multi-org registration numbers: {"AKC": "SS123", "UKC": "456"}
  registration_numbers JSONB DEFAULT '{}'::JSONB,

  -- Health info (freeform text)
  health_info TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One ancestor per position per dog
  UNIQUE(dog_id, position)
);

-- Indexes
CREATE INDEX idx_pedigree_ancestors_dog_id ON pedigree_ancestors(dog_id);
CREATE INDEX idx_pedigree_ancestors_owner_id ON pedigree_ancestors(owner_id);
CREATE INDEX idx_pedigree_ancestors_linked_dog_id ON pedigree_ancestors(linked_dog_id)
  WHERE linked_dog_id IS NOT NULL;

-- Reuse existing updated_at trigger function
CREATE TRIGGER pedigree_ancestors_updated_at
  BEFORE UPDATE ON pedigree_ancestors
  FOR EACH ROW EXECUTE FUNCTION update_training_updated_at();

-- RLS: owner-based CRUD
ALTER TABLE pedigree_ancestors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pedigree ancestors"
  ON pedigree_ancestors FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own pedigree ancestors"
  ON pedigree_ancestors FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own pedigree ancestors"
  ON pedigree_ancestors FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own pedigree ancestors"
  ON pedigree_ancestors FOR DELETE
  USING (auth.uid() = owner_id);
