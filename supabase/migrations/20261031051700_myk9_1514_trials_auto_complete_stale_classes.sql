-- =============================================================================
-- MYK9-1514 — per-trial switch for the stale-class prompt.
--
-- v3's trigger rule (same judge, a different level, class in_progress, last
-- result older than 15 minutes, unscored dogs remain) now only DETECTS on the
-- judge's device and ASKS ("Mark them absent and complete the class?"). A
-- secretary turns the prompt off per trial with this column.
--
-- COLUMN. trials.auto_complete_stale_classes boolean, nullable, NO default:
-- NULL means enabled, so every existing trial keeps the prompt without a
-- backfill (no row rewrite, no updated_at bump, no replica re-pull). Only an
-- explicit false turns it off. The name is v3's, kept so a secretary's habit
-- carries over, even though nothing is completed without a tap.
--
-- GRANTS. public.trials carries table-level grants only (anon SELECT,
-- authenticated read/write through RLS, service_role all; no column ACLs, see
-- 20260725160000_anon_revoke_default_privileges.sql). A new column inherits
-- them, which is what it needs: the show's managers write it through the
-- existing trials_update RLS policy, and a harmless boolean is readable the
-- way every other trials column is. No GRANT or REVOKE is added: a REVOKE here
-- would be a column-level ACL on a table that has none, and would break the
-- replicated `select('*')` pull. Verify after push with:
--   select attname, attacl from pg_attribute
--   where attrelid = 'public.trials'::regclass and attname = 'auto_complete_stale_classes';
-- (attacl must be null.)
-- =============================================================================

ALTER TABLE public.trials
  ADD COLUMN IF NOT EXISTS auto_complete_stale_classes boolean;

COMMENT ON COLUMN public.trials.auto_complete_stale_classes IS
  'MYK9-1514: NULL or true = a judge who moves to a different level is asked whether to mark the previous class''s unscored dogs absent and complete it after 15 idle minutes; false turns the prompt off. Never completes anything by itself.';
