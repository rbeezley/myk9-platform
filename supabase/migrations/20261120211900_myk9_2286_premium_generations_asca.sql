-- MYK9-2286: log an ASCA premium's download. Migration 188 limited premium_generations.org to
-- ('AKC','UKC'), so for an ASCA premium the insert failed its CHECK and was only console-logged.
-- Drop and re-add the constraint by name (an inline column check is named
-- <table>_<column>_check); nothing else changes, and no new table, so no new grants.
alter table public.premium_generations
  drop constraint premium_generations_org_check;

alter table public.premium_generations
  add constraint premium_generations_org_check
  check (org in ('AKC', 'UKC', 'ASCA'));
