-- Create basic RLS policies for core tables
-- Phase 1.4 Enhancement: Security Foundation
-- Created: 2025-01-25

-- Helper function to check if user is authenticated
CREATE OR REPLACE FUNCTION auth.user_id() RETURNS UUID AS $$
  SELECT auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Dogs table policies
-- Users can see all dogs (public information)
CREATE POLICY "Dogs are viewable by everyone" ON dogs
  FOR SELECT USING (true);

-- Users can only insert dogs they own
CREATE POLICY "Users can insert their own dogs" ON dogs
  FOR INSERT WITH CHECK (owner_id = auth.user_id());

-- Users can only update dogs they own
CREATE POLICY "Users can update their own dogs" ON dogs
  FOR UPDATE USING (owner_id = auth.user_id());

-- Users can only delete dogs they own
CREATE POLICY "Users can delete their own dogs" ON dogs
  FOR DELETE USING (owner_id = auth.user_id());

-- People table policies
-- Users can see all people (public directory)
CREATE POLICY "People are viewable by everyone" ON people
  FOR SELECT USING (true);

-- Users can only insert their own profile
CREATE POLICY "Users can insert their own profile" ON people
  FOR INSERT WITH CHECK (user_id = auth.user_id());

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile" ON people
  FOR UPDATE USING (user_id = auth.user_id());

-- Users can only delete their own profile
CREATE POLICY "Users can delete their own profile" ON people
  FOR DELETE USING (user_id = auth.user_id());

-- Shows table policies
-- Everyone can view published shows
CREATE POLICY "Published shows are viewable by everyone" ON shows
  FOR SELECT USING (status IN ('published', 'in_progress', 'completed'));

-- Only club secretaries can insert shows for their club
CREATE POLICY "Club secretaries can create shows" ON shows
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role IN ('secretary', 'admin')
      AND club_id = shows.club_id
    )
  );

-- Only club secretaries can update their club's shows
CREATE POLICY "Club secretaries can update their shows" ON shows
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role IN ('secretary', 'admin')
      AND club_id = shows.club_id
    )
  );

-- Only admins can delete shows
CREATE POLICY "Only admins can delete shows" ON shows
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role = 'admin'
    )
  );

-- Clubs table policies
-- Everyone can view clubs
CREATE POLICY "Clubs are viewable by everyone" ON clubs
  FOR SELECT USING (true);

-- Only admins can insert clubs
CREATE POLICY "Only admins can create clubs" ON clubs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role = 'admin'
    )
  );

-- Only club secretaries and admins can update clubs
CREATE POLICY "Club officials can update clubs" ON clubs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role IN ('secretary', 'admin')
      AND (club_id = clubs.id OR role = 'admin')
    )
  );

-- Only admins can delete clubs
CREATE POLICY "Only admins can delete clubs" ON clubs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE user_id = auth.user_id() 
      AND role = 'admin'
    )
  );

-- Entries table policies
-- Users can see their own entries
CREATE POLICY "Users can view their own entries" ON entries
  FOR SELECT USING (
    dog_id IN (
      SELECT id FROM dogs WHERE owner_id = auth.user_id()
    )
  );

-- Show secretaries can see all entries for their shows
CREATE POLICY "Show secretaries can view show entries" ON entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes c
      JOIN show_trials st ON c.trial_id = st.id
      JOIN shows s ON st.show_id = s.id
      JOIN people p ON p.club_id = s.club_id
      WHERE c.id = entries.class_id
      AND p.user_id = auth.user_id()
      AND p.role IN ('secretary', 'admin')
    )
  );

-- Users can create entries for dogs they own
CREATE POLICY "Users can create entries for their dogs" ON entries
  FOR INSERT WITH CHECK (
    dog_id IN (
      SELECT id FROM dogs WHERE owner_id = auth.user_id()
    )
  );

-- Users can update their own entries before the show starts
CREATE POLICY "Users can update their pending entries" ON entries
  FOR UPDATE USING (
    dog_id IN (
      SELECT id FROM dogs WHERE owner_id = auth.user_id()
    )
    AND status = 'pending'
  );

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_dogs_owner_id ON dogs(owner_id);
CREATE INDEX IF NOT EXISTS idx_people_user_id ON people(user_id);
CREATE INDEX IF NOT EXISTS idx_shows_club_id ON shows(club_id);
CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);
CREATE INDEX IF NOT EXISTS idx_entries_dog_id ON entries(dog_id);
CREATE INDEX IF NOT EXISTS idx_entries_class_id ON entries(class_id);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_shows_club_status ON shows(club_id, status);
CREATE INDEX IF NOT EXISTS idx_entries_dog_status ON entries(dog_id, status);

-- Add comment explaining RLS
COMMENT ON TABLE dogs IS 'Dogs table with RLS enabled. Users can only modify dogs they own.';
COMMENT ON TABLE people IS 'People table with RLS enabled. Users can only modify their own profile.';
COMMENT ON TABLE shows IS 'Shows table with RLS enabled. Only club officials can modify shows.';
COMMENT ON TABLE clubs IS 'Clubs table with RLS enabled. Only admins can create/delete clubs.';
COMMENT ON TABLE entries IS 'Entries table with RLS enabled. Users can only create/modify entries for their dogs.';