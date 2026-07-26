-- MYK9-90 / dog-identity-normalization section 1 — primary registration flag.
--
-- Identity (registered name, breed, variety, registration number) lives on
-- dog_registrations, not on dogs. Organization-scoped surfaces read the
-- registration for that organization. Generic surfaces have no organization in
-- context and need a stable, explainable choice: the dog's PRIMARY registration.
-- See openspec/changes/dog-identity-normalization/design.md § Decision 2.
--
-- GRANTS. This adds a column to an EXISTING table, so the project's
-- ALTER DEFAULT PRIVILEGES anon trap (which applies to newly CREATEd tables)
-- does not fire here. Verified against the applied database 2026-07-25:
--   select unnest(relacl)::text from pg_class
--     where oid = 'public.dog_registrations'::regclass;
--   -> postgres, authenticated, service_role only. anon holds NO grant.
-- New columns inherit table-level privileges, so is_primary is reachable by
-- authenticated/service_role and unreachable by anon with no further action.
-- The explicit column grant/revoke below records that intent rather than
-- leaving it implicit.

ALTER TABLE public.dog_registrations
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dog_registrations.is_primary IS
  'Owner-settable. At most one primary registration per dog (enforced by dog_registrations_one_primary_per_dog). Surfaces with no sanctioning organization in context resolve registered name, breed, and variety from this row. Application resolvers fall back to the earliest-created registration when a dog has no row marked primary, so an unset flag is never an error.';

-- Backfill: the earliest-created registration per dog becomes primary. created_at
-- is nullable, so NULLS LAST keeps undated rows from winning; id breaks ties so
-- the result is deterministic and satisfies the partial unique index below.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY dog_id ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM public.dog_registrations
)
UPDATE public.dog_registrations AS d
SET is_primary = true
FROM ranked AS r
WHERE d.id = r.id
  AND r.rn = 1
  AND d.is_primary IS DISTINCT FROM true;

-- At most one primary per dog. Partial index: rows with is_primary = false are
-- unconstrained, so a dog may have many non-primary registrations.
CREATE UNIQUE INDEX IF NOT EXISTS dog_registrations_one_primary_per_dog
  ON public.dog_registrations (dog_id)
  WHERE is_primary;

GRANT SELECT (is_primary), INSERT (is_primary), UPDATE (is_primary)
  ON public.dog_registrations TO authenticated;
GRANT SELECT (is_primary), INSERT (is_primary), UPDATE (is_primary)
  ON public.dog_registrations TO service_role;
REVOKE ALL (is_primary) ON public.dog_registrations FROM anon;
