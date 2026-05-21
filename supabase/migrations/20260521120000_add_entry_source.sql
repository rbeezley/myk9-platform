-- Dedicated source lane for organization-report entry buckets.
-- Payment method only describes how myK9 collected money; it is not proof that
-- UKC hosted and collected an online entry.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'myk9';

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_entry_source_check;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_entry_source_check
  CHECK (entry_source = ANY (ARRAY['myk9', 'ukc_online']));

COMMENT ON COLUMN public.entries.entry_source IS
  'Source lane for official reports: myk9 = collected in myK9; ukc_online = collected by the UKC-hosted online entry lane.';
