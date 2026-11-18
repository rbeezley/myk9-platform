-- MYK9-1944: ask once whether to show results publicly.
--
-- When a class's results are released and an exhibitor's dog placed, the app
-- asks "Show your results publicly?" once per ACCOUNT. Either answer is
-- remembered here so the question is not repeated on another device or for a
-- later placement. NULL = never answered.
--
-- This column records only that the question was answered. It never decides
-- who sees a result: that stays with exhibitor_profiles.results_public and the
-- server views (MYK9-969), unchanged.
--
-- Grants: exhibitor_profiles has no column-level ACLs and the self-only UPDATE
-- policy (exhibitor_profiles_update) already covers every column the owner may
-- write, so a new column needs no GRANT. anon holds no grant on the table
-- (20260730220000).
--
-- NOT PUSHED by the authoring agent.

BEGIN;

ALTER TABLE public.exhibitor_profiles
  ADD COLUMN IF NOT EXISTS results_public_prompt_answered_at timestamptz;

COMMENT ON COLUMN public.exhibitor_profiles.results_public_prompt_answered_at IS
  'MYK9-1944: when the account answered the one-time "Show your results publicly?" prompt (yes or keep private). NULL = never asked. Does not affect visibility; results_public does.';

COMMIT;
