-- MYK9-1299 (step 3) / MYK9-312: remove the inert promo-code feature from the database.
--
-- No screen creates, validates or redeems a promo code (client layer removed in #3172).
-- Live catalog before this migration: 0 rows in public.promo_codes; 0 entries with a
-- non-null entries.promo_code_id; the only FK into promo_codes is
-- entries.entries_promo_code_id_fkey; no view depends on promo_codes.
--
-- DELIBERATELY KEPT: the column public.entries.promo_code_id (and its index
-- entries_promo_code_id_fk_idx). Three views still project it, and CREATE OR REPLACE VIEW
-- cannot remove a column:
--   * public.view_authenticated_entry_results
--   * public.view_authenticated_entry_results_replication
--   * public.view_entry_with_results
-- A follow-up issue drops the column together with the next rebuild of those views.
-- Only the FK constraint is dropped here, leaving a plain, always-NULL uuid column.
--
-- No CASCADE: dropping promo_codes also removes its own indexes (including
-- promo_codes_show_id_fk_idx), policies and grants, and nothing else depends on it.

DROP FUNCTION IF EXISTS public.validate_promo_code(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.increment_promo_usage(UUID);

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_promo_code_id_fkey;

DROP TABLE IF EXISTS public.promo_codes;
