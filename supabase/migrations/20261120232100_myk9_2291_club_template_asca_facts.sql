-- =============================================================================
-- MYK9-2291 (plan-premium-completeness, Phase 5c, ASCA B2b): two club-level facts that ASCA
-- Scent Detection rules §1.5 require in a premium list, entered once on the club premium template.
--
--   1.5.18  limited-mobility concerns   club_premium_templates.limited_mobility_notes  free text
--   1.5.22  RV hook-up amenities        club_premium_templates.rv_hookup_notes         free text
--
-- Both are nullable: NULL means "not set" and prints nothing. They print on an ASCA premium only.
--
-- GRANTS. No new table. public.club_premium_templates carries table-level grants only
-- (authenticated SELECT/INSERT/UPDATE/DELETE, anon none, 20260730220000; no column ACLs; RLS
-- "club members can manage premium templates", forced), so the new columns follow their siblings
-- exactly and no anon access is added. No column-level GRANT: that would turn the table into a
-- column-allowlisted one, which it is not.
--
-- The table's permissions are restated explicitly below (they change nothing: they are what the
-- table already has, per pre_rule_table_grants_test.sql). Effective ACLs are asserted by
-- supabase/tests/myk9_2291_club_template_asca_facts_test.sql.
--
-- No backfill: every existing template reads NULL, which is "not set".
-- =============================================================================

BEGIN;

ALTER TABLE public.club_premium_templates
  ADD COLUMN IF NOT EXISTS limited_mobility_notes text,
  ADD COLUMN IF NOT EXISTS rv_hookup_notes text;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.club_premium_templates TO authenticated;
REVOKE ALL ON TABLE public.club_premium_templates FROM anon;

COMMENT ON COLUMN public.club_premium_templates.limited_mobility_notes IS
  'MYK9-2291: ASCA §1.5.18 concerns for handicapped or limited-mobility handlers or dogs, free text. NULL = not set. Printed in an ASCA premium list.';
COMMENT ON COLUMN public.club_premium_templates.rv_hookup_notes IS
  'MYK9-2291: ASCA §1.5.22 RV hook-up amenities and availability (if the facility is an RV park), free text. NULL = none. Printed in an ASCA premium list.';

COMMIT;
