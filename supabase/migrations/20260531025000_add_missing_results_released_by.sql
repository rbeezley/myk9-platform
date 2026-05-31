-- Repair live schema drift surfaced by regenerated Supabase types.
-- The app has used this audit column since migration 100, but the linked
-- project schema did not expose it during Phase 3 type regeneration.

alter table public.classes
  add column if not exists results_released_by uuid references auth.users(id);
