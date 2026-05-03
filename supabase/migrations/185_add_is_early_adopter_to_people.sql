-- Add early-adopter flag to people.
-- Set to true manually via Supabase dashboard for early adopters;
-- useSubscriptionGate treats is_early_adopter=true as equivalent to an
-- active premium subscription (bypasses BlurGate without a paid plan).
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS is_early_adopter BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.people.is_early_adopter IS
  'When true, grants free premium-tier access to dog management tools (title tracking, training journal, health records, pedigree). Set manually for early adopter launch; retained permanently as a reward for joining early.';
