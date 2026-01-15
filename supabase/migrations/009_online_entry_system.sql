-- =============================================================================
-- Migration 009: Online Entry System
-- =============================================================================
-- Adds tables, functions, and RLS policies for the online entry system:
-- - Exhibitor profiles (links auth users to people)
-- - Entry carts (shopping cart with expiration)
-- - Entry cart items (individual entries in cart)
-- - Waitlist entries (waitlist management)
-- - Helper functions for availability checking and waitlist management
-- - Auth trigger for automatic person/exhibitor creation on signup
-- =============================================================================

-- =============================================================================
-- SCHEMA MODIFICATIONS
-- =============================================================================

-- Add auth_user_id to people table (links Supabase auth to person records)
ALTER TABLE people
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS people_auth_user_id_idx ON people(auth_user_id);

-- Add expires_at to user_roles for temporary role assignments
ALTER TABLE user_roles
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_roles_expires_at_idx ON user_roles(expires_at);

-- =============================================================================
-- DEFAULT ROLES
-- =============================================================================
-- Insert default roles if they don't exist

INSERT INTO roles (name, description, is_system)
VALUES
  ('exhibitor', 'Dog owners who enter shows through the platform', TRUE),
  ('club_admin', 'Manages club profile and creates shows', TRUE),
  ('trial_secretary', 'Manages entries, armbands, and results for assigned shows', TRUE),
  ('judge', 'Scores entries for assigned classes', TRUE),
  ('platform_admin', 'Full system access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- EXHIBITOR PROFILES
-- =============================================================================
-- Links Supabase auth users to the people table with subscription info

CREATE TABLE IF NOT EXISTS exhibitor_profiles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),

  -- Defaults for entry forms
  default_handler_id UUID REFERENCES people(id),

  -- Premium subscription (synced from stripe_subscriptions)
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'pro')),
  subscription_expires_at TIMESTAMPTZ,

  -- Stripe integration (links to existing stripe_customers table via stripe_customer_id)
  stripe_customer_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS exhibitor_profiles_auth_user_id_idx ON exhibitor_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS exhibitor_profiles_person_id_idx ON exhibitor_profiles(person_id);
CREATE INDEX IF NOT EXISTS exhibitor_profiles_stripe_customer_id_idx ON exhibitor_profiles(stripe_customer_id);

-- Add foreign key to stripe_customers if the column matches
-- Note: stripe_customer_id in stripe_customers is TEXT, so we reference by value not FK
-- This allows exhibitor_profiles to exist before stripe_customers record

-- =============================================================================
-- ENTRY CARTS
-- =============================================================================
-- Shopping cart for entries before checkout (30-minute expiration)

CREATE TABLE IF NOT EXISTS entry_carts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  exhibitor_id UUID NOT NULL REFERENCES exhibitor_profiles(id) ON DELETE CASCADE,
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,

  -- Cart status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'abandoned', 'expired')),

  -- Timeout (prevent indefinite holds on class spots)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),

  -- Totals (calculated)
  subtotal_cents INTEGER DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,

  -- Stripe (links to existing stripe_orders table after checkout)
  stripe_checkout_session_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entry_carts_exhibitor_id_idx ON entry_carts(exhibitor_id);
CREATE INDEX IF NOT EXISTS entry_carts_show_id_idx ON entry_carts(show_id);
CREATE INDEX IF NOT EXISTS entry_carts_status_idx ON entry_carts(status);
CREATE INDEX IF NOT EXISTS entry_carts_expires_at_idx ON entry_carts(expires_at);

-- =============================================================================
-- ENTRY CART ITEMS
-- =============================================================================
-- Individual entries within a cart

CREATE TABLE IF NOT EXISTS entry_cart_items (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES entry_carts(id) ON DELETE CASCADE,

  -- Entry details
  dog_id UUID NOT NULL REFERENCES dogs(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  handler_id UUID REFERENCES people(id),

  -- Fees
  entry_fee_cents INTEGER NOT NULL,

  -- Options
  jump_height TEXT,
  special_requests TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entry_cart_items_cart_id_idx ON entry_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS entry_cart_items_dog_id_idx ON entry_cart_items(dog_id);
CREATE INDEX IF NOT EXISTS entry_cart_items_class_id_idx ON entry_cart_items(class_id);

-- Prevent duplicate entries in same cart (same dog in same class)
CREATE UNIQUE INDEX IF NOT EXISTS entry_cart_items_unique_dog_class_idx
  ON entry_cart_items(cart_id, dog_id, class_id);

-- =============================================================================
-- WAITLIST ENTRIES
-- =============================================================================
-- Track waitlist positions when classes are full

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exhibitor_id UUID NOT NULL REFERENCES exhibitor_profiles(id) ON DELETE CASCADE,
  dog_id UUID NOT NULL REFERENCES dogs(id),
  handler_id UUID REFERENCES people(id),

  -- Position (1 = first on waitlist)
  position INTEGER NOT NULL,

  -- Status
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired')),

  -- When offered a spot
  offered_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_entries_class_id_idx ON waitlist_entries(class_id);
CREATE INDEX IF NOT EXISTS waitlist_entries_exhibitor_id_idx ON waitlist_entries(exhibitor_id);
CREATE INDEX IF NOT EXISTS waitlist_entries_status_idx ON waitlist_entries(status);

-- Unique position per class (only for active waitlist entries)
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_class_position_idx
  ON waitlist_entries(class_id, position)
  WHERE status = 'waiting';

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public.has_role() - Efficient role checking for RLS policies
-- -----------------------------------------------------------------------------
-- Uses SECURITY DEFINER for performance (avoids context switching)
-- Handles club_id scoping and expiration

CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = role_name
      AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- check_class_availability() - Returns available spots and waitlist position
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_class_availability(p_class_id UUID)
RETURNS TABLE (
  available_spots INTEGER,
  is_available BOOLEAN,
  waitlist_position INTEGER,
  entry_limit INTEGER,
  confirmed_count INTEGER
) AS $$
DECLARE
  v_class_limit INTEGER;
  v_confirmed_count INTEGER;
  v_waitlist_count INTEGER;
BEGIN
  -- Get class limit
  SELECT c.entry_limit INTO v_class_limit
  FROM classes c
  WHERE c.id = p_class_id;

  -- Default to 0 if no limit set
  v_class_limit := COALESCE(v_class_limit, 0);

  -- Count confirmed entries (various confirmed statuses)
  SELECT COUNT(*) INTO v_confirmed_count
  FROM entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing')
    AND e.deleted_at IS NULL;

  -- Count active waitlist entries
  SELECT COUNT(*) INTO v_waitlist_count
  FROM waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  -- Calculate results
  available_spots := GREATEST(0, v_class_limit - v_confirmed_count);
  is_available := available_spots > 0;
  waitlist_position := v_waitlist_count + 1;
  entry_limit := v_class_limit;
  confirmed_count := v_confirmed_count;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_class_availability(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- add_to_waitlist() - Thread-safe waitlist position assignment
-- -----------------------------------------------------------------------------
-- Uses advisory lock to prevent race conditions when multiple exhibitors
-- join the waitlist simultaneously

CREATE OR REPLACE FUNCTION add_to_waitlist(
  p_class_id UUID,
  p_exhibitor_id UUID,
  p_dog_id UUID,
  p_handler_id UUID DEFAULT NULL
) RETURNS waitlist_entries AS $$
DECLARE
  next_position INTEGER;
  new_entry waitlist_entries;
BEGIN
  -- Lock the class row to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  -- Get next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
  FROM waitlist_entries
  WHERE class_id = p_class_id AND status = 'waiting';

  -- Insert new entry
  INSERT INTO waitlist_entries (class_id, exhibitor_id, dog_id, handler_id, position)
  VALUES (p_class_id, p_exhibitor_id, p_dog_id, p_handler_id, next_position)
  RETURNING * INTO new_entry;

  RETURN new_entry;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION add_to_waitlist(UUID, UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- AUTH TRIGGER - Automatic Person/Exhibitor Creation
-- =============================================================================
-- Creates person record and exhibitor_profile when new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_person_id UUID;
  exhibitor_role_id UUID;
BEGIN
  -- Get the exhibitor role ID
  SELECT id INTO exhibitor_role_id FROM roles WHERE name = 'exhibitor';

  -- Create person record from auth metadata
  INSERT INTO people (
    first_name,
    last_name,
    email,
    phone,
    auth_user_id
  ) VALUES (
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.id
  )
  RETURNING id INTO new_person_id;

  -- Create exhibitor profile
  INSERT INTO exhibitor_profiles (
    person_id,
    auth_user_id
  ) VALUES (
    new_person_id,
    NEW.id
  );

  -- Assign exhibitor role (if role exists)
  IF exhibitor_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (new_person_id, exhibitor_role_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users (only if it doesn't exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Create generic updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Exhibitor profiles
DROP TRIGGER IF EXISTS exhibitor_profiles_updated_at ON exhibitor_profiles;
CREATE TRIGGER exhibitor_profiles_updated_at
  BEFORE UPDATE ON exhibitor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Entry carts
DROP TRIGGER IF EXISTS entry_carts_updated_at ON entry_carts;
CREATE TRIGGER entry_carts_updated_at
  BEFORE UPDATE ON entry_carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Waitlist entries
DROP TRIGGER IF EXISTS waitlist_entries_updated_at ON waitlist_entries;
CREATE TRIGGER waitlist_entries_updated_at
  BEFORE UPDATE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE exhibitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- EXHIBITOR PROFILES - Users can manage their own profile
-- -----------------------------------------------------------------------------

CREATE POLICY "users_select_own_profile" ON exhibitor_profiles
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "users_update_own_profile" ON exhibitor_profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- Platform admins can see all profiles
CREATE POLICY "admins_select_all_profiles" ON exhibitor_profiles
  FOR SELECT USING (has_role('platform_admin'));

CREATE POLICY "admins_manage_all_profiles" ON exhibitor_profiles
  FOR ALL USING (has_role('platform_admin'));

-- -----------------------------------------------------------------------------
-- ENTRY CARTS - Users can manage their own carts
-- -----------------------------------------------------------------------------

CREATE POLICY "users_select_own_carts" ON entry_carts
  FOR SELECT USING (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_carts" ON entry_carts
  FOR INSERT WITH CHECK (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_update_own_carts" ON entry_carts
  FOR UPDATE USING (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_delete_own_carts" ON entry_carts
  FOR DELETE USING (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Platform admins can see all carts
CREATE POLICY "admins_manage_all_carts" ON entry_carts
  FOR ALL USING (has_role('platform_admin'));

-- -----------------------------------------------------------------------------
-- ENTRY CART ITEMS - Access via cart ownership
-- -----------------------------------------------------------------------------

CREATE POLICY "users_select_own_cart_items" ON entry_cart_items
  FOR SELECT USING (
    cart_id IN (
      SELECT ec.id FROM entry_carts ec
      JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
      WHERE ep.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_cart_items" ON entry_cart_items
  FOR INSERT WITH CHECK (
    cart_id IN (
      SELECT ec.id FROM entry_carts ec
      JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
      WHERE ep.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_update_own_cart_items" ON entry_cart_items
  FOR UPDATE USING (
    cart_id IN (
      SELECT ec.id FROM entry_carts ec
      JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
      WHERE ep.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_delete_own_cart_items" ON entry_cart_items
  FOR DELETE USING (
    cart_id IN (
      SELECT ec.id FROM entry_carts ec
      JOIN exhibitor_profiles ep ON ep.id = ec.exhibitor_id
      WHERE ep.auth_user_id = auth.uid()
    )
  );

-- Platform admins can manage all cart items
CREATE POLICY "admins_manage_all_cart_items" ON entry_cart_items
  FOR ALL USING (has_role('platform_admin'));

-- -----------------------------------------------------------------------------
-- WAITLIST ENTRIES - Users can manage their own waitlist entries
-- -----------------------------------------------------------------------------

CREATE POLICY "users_select_own_waitlist" ON waitlist_entries
  FOR SELECT USING (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_waitlist" ON waitlist_entries
  FOR INSERT WITH CHECK (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Users can delete waitlist entries before an offer is made
CREATE POLICY "users_delete_own_waitlist" ON waitlist_entries
  FOR DELETE USING (
    exhibitor_id IN (
      SELECT id FROM exhibitor_profiles WHERE auth_user_id = auth.uid()
    )
    AND status = 'waiting'  -- Can only delete if not yet offered
  );

-- Trial secretaries can manage waitlist for their shows
CREATE POLICY "secretaries_manage_waitlist" ON waitlist_entries
  FOR ALL USING (
    class_id IN (
      SELECT c.id FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE has_role('trial_secretary', s.club_id)
    )
  );

-- Platform admins can manage all waitlist entries
CREATE POLICY "admins_manage_all_waitlist" ON waitlist_entries
  FOR ALL USING (has_role('platform_admin'));

-- -----------------------------------------------------------------------------
-- SHOWS - Exhibitors see published shows
-- -----------------------------------------------------------------------------
-- Note: Adds to existing policies, doesn't replace them

DROP POLICY IF EXISTS "exhibitors_see_published_shows" ON shows;
CREATE POLICY "exhibitors_see_published_shows" ON shows
  FOR SELECT USING (
    (
      -- Public shows (accepting entries or later statuses)
      status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
      -- Or user is club admin
      OR has_role('club_admin', club_id)
      -- Or user is trial secretary for this club
      OR has_role('trial_secretary', club_id)
      -- Or platform admin
      OR has_role('platform_admin')
    )
    -- Respect soft delete
    AND deleted_at IS NULL
  );

-- -----------------------------------------------------------------------------
-- CLASSES - Exhibitors see classes for visible shows
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "exhibitors_see_classes" ON classes;
CREATE POLICY "exhibitors_see_classes" ON classes
  FOR SELECT USING (
    (
      -- Class belongs to a visible show
      trial_id IN (
        SELECT t.id FROM trials t
        JOIN shows s ON s.id = t.show_id
        WHERE s.status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
      )
      -- Or user is club admin
      OR trial_id IN (
        SELECT t.id FROM trials t
        JOIN shows s ON s.id = t.show_id
        WHERE has_role('club_admin', s.club_id)
      )
      -- Or user is trial secretary
      OR trial_id IN (
        SELECT t.id FROM trials t
        JOIN shows s ON s.id = t.show_id
        WHERE has_role('trial_secretary', s.club_id)
      )
      -- Or platform admin
      OR has_role('platform_admin')
    )
    AND deleted_at IS NULL
  );

-- -----------------------------------------------------------------------------
-- ENTRIES - Exhibitors can view/update their own entries
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "exhibitors_see_own_entries" ON entries;
CREATE POLICY "exhibitors_see_own_entries" ON entries
  FOR SELECT USING (
    (
      -- Own entries (as handler or dog owner)
      handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
      OR dog_id IN (
        SELECT d.id FROM dogs d
        JOIN people p ON p.id = d.owner_id
        WHERE p.auth_user_id = auth.uid()
      )
      -- Or trial secretary for this show
      OR class_id IN (
        SELECT c.id FROM classes c
        JOIN trials t ON t.id = c.trial_id
        JOIN shows s ON s.id = t.show_id
        WHERE has_role('trial_secretary', s.club_id)
      )
      -- Or platform admin
      OR has_role('platform_admin')
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "exhibitors_update_own_entries" ON entries;
CREATE POLICY "exhibitors_update_own_entries" ON entries
  FOR UPDATE USING (
    -- Can update own entries
    (
      handler_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
      OR dog_id IN (
        SELECT d.id FROM dogs d
        JOIN people p ON p.id = d.owner_id
        WHERE p.auth_user_id = auth.uid()
      )
    )
    -- Only before show starts (not confirmed/checked-in/competing/completed)
    AND entry_status NOT IN ('confirmed', 'checked-in', 'competing', 'completed')
    AND deleted_at IS NULL
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
