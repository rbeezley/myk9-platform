-- MYK9-2281: drop the retired shows.uses_landing_page column (MYK9-2054 retired the switch).
-- Checked before writing: no view, function (trigger functions included) or policy references it
-- (live database, 0/0/0), and no later migration recreates a dependency. Queued writes from an older
-- tab still carry the column; the replication executor strips it (RETIRED_COLUMNS), so they land.
ALTER TABLE public.shows DROP COLUMN IF EXISTS uses_landing_page;
