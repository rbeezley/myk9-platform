-- MYK9-2549: retire the legacy no-club request paths (owner decision 2026-11-28,
-- MYK9-2527 option 1). Every new-club request now carries the club it made, through
-- request_new_club() (MYK9-2046). Removed:
--   * the sign-up trigger zz_materialize_club_access_request on auth.users and its
--     function, which filed a pending no-club request from sign-up metadata
--     (intended_roles / requested_club_name; no app code sends either);
--   * insert_club_access_request_from_signup(uuid, uuid, jsonb), its only caller;
--   * both submit_club_access_request overloads (the 3-argument one only raised).
--
-- Order matters: the trigger and its function go before the function they call, or
-- every non-anonymous sign-up would raise. No CASCADE, so a dependency we missed
-- fails the migration instead of silently dropping something. handle_new_user and
-- the other auth.users triggers are untouched. club_access_requests rows stay.

DROP TRIGGER IF EXISTS zz_materialize_club_access_request ON auth.users;

DROP FUNCTION IF EXISTS public.materialize_club_access_request_from_auth_user();

DROP FUNCTION IF EXISTS public.insert_club_access_request_from_signup(uuid, uuid, jsonb);

DROP FUNCTION IF EXISTS public.submit_club_access_request(text, text, text, jsonb);

DROP FUNCTION IF EXISTS public.submit_club_access_request(text, text, text);
