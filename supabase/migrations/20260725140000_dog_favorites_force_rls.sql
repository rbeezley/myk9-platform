-- dog_favorites — FORCE row level security.
--
-- 20260725120000_dog_favorites.sql enabled RLS but did not force it. ENABLE
-- exempts the table OWNER from its own policies; FORCE subjects the owner too.
-- The repo treats that as an invariant — see
-- apps/myk9show/src/test/database/forceRlsInvariant.test.ts ("leaves no
-- repository-owned RLS-enabled public table unforced"), which parses every
-- migration and fails CI on any public table that enables RLS without forcing
-- it. That test caught this one.
--
-- Applied as a separate migration rather than by editing 20260725120000, which
-- had already been pushed to the remote — amending an applied migration leaves
-- the file and the database out of sync.

ALTER TABLE public.dog_favorites FORCE ROW LEVEL SECURITY;
