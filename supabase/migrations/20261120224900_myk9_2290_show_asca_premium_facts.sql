-- =============================================================================
-- MYK9-2290 (plan-premium-completeness, Phase 5c, ASCA B2a): four show-level facts that ASCA
-- Scent Detection rules §1.5 require in a premium list and that nothing held yet.
--
--   1.5.2   sanctioning status          shows.asca_sanction_status   'pending' | 'approved'
--   1.5.9   scents used for each level  shows.scents_by_level        free text
--   1.5.19  spectators / videoing       shows.spectators_policy      'allowed' | 'not_allowed'
--   1.5.24  show photographer contact   shows.photographer_contact   optional free text
--
-- All four are nullable: NULL means "not set" and prints nothing. They are typed once on the show
-- (Edit show > Premium, ASCA shows only) and printed by the premium list in every style.
--
-- GRANTS. No new table. public.shows carries table-level grants only (authenticated and anon
-- SELECT, authenticated INSERT/UPDATE, service_role ALL; no column ACLs), so the new columns are
-- readable by anon exactly like their siblings (public premium facts are readable) and writable
-- by managers through the shows_update RLS policy, like every other show-level fact. A
-- column-level GRANT here would turn shows into a column-allowlisted table, which it is not.
--
-- REPLICATION. The shows replica pulls the whole row (select *) and writes a full row, so the
-- columns need no view or publication change; the app maps them end to end.
--
-- No backfill: every existing show reads NULL, which is "not set".
-- =============================================================================

BEGIN;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS asca_sanction_status text,
  ADD COLUMN IF NOT EXISTS scents_by_level text,
  ADD COLUMN IF NOT EXISTS spectators_policy text,
  ADD COLUMN IF NOT EXISTS photographer_contact text;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_asca_sanction_status_check;
ALTER TABLE public.shows
  ADD CONSTRAINT shows_asca_sanction_status_check
  CHECK (asca_sanction_status IS NULL OR asca_sanction_status IN ('pending', 'approved'));

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_spectators_policy_check;
ALTER TABLE public.shows
  ADD CONSTRAINT shows_spectators_policy_check
  CHECK (spectators_policy IS NULL OR spectators_policy IN ('allowed', 'not_allowed'));

COMMENT ON COLUMN public.shows.asca_sanction_status IS
  'MYK9-2290: ASCA §1.5.2 sanctioning status, pending or approved (the sanction form is filed separately). NULL = not set. Printed in the premium list.';
COMMENT ON COLUMN public.shows.scents_by_level IS
  'MYK9-2290: ASCA §1.5.9 the scents used for each level, free text. NULL = not set. Printed in the premium list.';
COMMENT ON COLUMN public.shows.spectators_policy IS
  'MYK9-2290: ASCA §1.5.19 whether spectators and videoing are allowed: allowed or not_allowed. NULL = not set. Printed in the premium list.';
COMMENT ON COLUMN public.shows.photographer_contact IS
  'MYK9-2290: ASCA §1.5.24 show photographer contact information, optional free text. NULL = none. Printed in the premium list.';

COMMIT;
