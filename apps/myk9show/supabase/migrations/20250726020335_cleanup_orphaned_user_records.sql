-- Cleanup orphaned user records that don't have corresponding auth.users
-- These are leftover mock data records with user_id = NULL

-- Delete orphaned records (those without user_id linking to auth.users)
DELETE FROM public.user 
WHERE user_id IS NULL;

-- Add a comment for tracking
COMMENT ON TABLE public.user IS 'User profiles table - cleaned up orphaned mock data on 2025-07-26';