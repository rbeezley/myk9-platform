-- MYK9-570 slice 1 — junior handler: date of birth + registry-issued junior number on the person.
--
-- Owner decision (Richard, 2026-09-18, on the issue): junior status is DERIVED from the
-- handler's date of birth and the trial date under the registry's age rule, never a
-- hand-set flag that goes stale. Juniors also carry a registry-issued junior handler
-- number, stored beside the date of birth so the official forms can print it.
--
-- This migration changes NO money. The per-show junior FEE is slice 2 (its own issue).
--
-- Why one jsonb instead of three columns: the number is registry-issued and only SOME
-- registries issue one (AKC does — "AKC Junior Handler number", Ch.3 §10 / glossary p.13;
-- UKC runs an optional "UKC Junior program" membership and issues no number per se; ASCA
-- issues nothing). A keyed map keeps the shape open without three mostly-null columns, and
-- the CHECK below pins the keys to the same closed set as `RegistryId` in
-- apps/myk9show/src/features/registries/types.ts ('AKC' | 'UKC' | 'ASCA'). All three must
-- be changed together.
--
-- PII: `date_of_birth` is personal data about a possibly-minor handler. It must never reach
-- `anon`. Verified against the live database before writing this file — `public.people`
-- carries NO table-level grant to `anon`, only column-scoped SELECT on
-- (id, first_name, last_name, email) from 20260725170000 / 20260725180000 / 20260730220000,
-- so a newly added column is unreachable by `anon` by construction. The REVOKE and the
-- assertion below make that intent explicit rather than incidental.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS junior_handler_numbers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.people.date_of_birth IS
  'MYK9-570: the handler''s date of birth. Junior status is derived from this and the trial '
  'date under the registry rule (see features/registries/juniorHandlerPolicy.ts); there is '
  'deliberately no is_junior flag. PII — never granted to anon.';

COMMENT ON COLUMN public.people.junior_handler_numbers IS
  'MYK9-570: registry-issued junior handler numbers, keyed by registry id '
  '(AKC | UKC | ASCA), values are text. Empty object when the person has none. '
  'Keys mirror RegistryId in features/registries/types.ts.';

-- A date of birth before 1900 is a typo, not a handler. `current_date` is not IMMUTABLE so
-- the upper bound cannot be expressed here; the UI rejects a future date.
ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_date_of_birth_plausible;
ALTER TABLE public.people
  ADD CONSTRAINT people_date_of_birth_plausible
  CHECK (date_of_birth IS NULL OR date_of_birth > DATE '1900-01-01');

-- Keys ⊆ {AKC, UKC, ASCA} and every value is a JSON string.
-- `v - array[...]` removes those keys; an empty remainder proves the key set is a subset.
-- The per-key type tests are exhaustive precisely BECAUSE the key set is closed — a
-- set-returning `jsonb_each` is not allowed in a CHECK, and a subquery is not either.
ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_junior_handler_numbers_shape;
ALTER TABLE public.people
  ADD CONSTRAINT people_junior_handler_numbers_shape
  CHECK (
    jsonb_typeof(junior_handler_numbers) = 'object'
    AND junior_handler_numbers - ARRAY['AKC', 'UKC', 'ASCA'] = '{}'::jsonb
    AND (NOT junior_handler_numbers ? 'AKC'
         OR jsonb_typeof(junior_handler_numbers -> 'AKC') = 'string')
    AND (NOT junior_handler_numbers ? 'UKC'
         OR jsonb_typeof(junior_handler_numbers -> 'UKC') = 'string')
    AND (NOT junior_handler_numbers ? 'ASCA'
         OR jsonb_typeof(junior_handler_numbers -> 'ASCA') = 'string')
  );

-- Explicit, not incidental. A column-level REVOKE against a role that holds no column grant
-- is a no-op today; it exists so that a future blanket column GRANT on people has to argue
-- with this line. (LESSON grant-never-narrows: a GRANT can never narrow an earlier GRANT,
-- so the narrowing has to be written down.)
REVOKE ALL (date_of_birth, junior_handler_numbers) ON public.people FROM anon;

-- Re-affirm the anon allowlist unchanged. Two reasons this line is not redundant:
-- (1) it states, in one place, the complete set of `people` columns `anon` may read, so the
--     REVOKE above cannot be misread as narrowing the public show pages' judge embeds;
-- (2) apps/myk9show/src/test/database/anonEntriesGrantContract.test.ts replays every
--     GRANT/REVOKE in file order and conservatively treats ANY revoke on a table as
--     clearing it, so without this the model would report the embed grants as dropped.
-- Sources of the allowlist: 20260725170000 (id, first_name, last_name),
-- 20260725180000 (email), 20260730220000 (codified). Nothing is added here.
GRANT SELECT (id, first_name, last_name, email) ON public.people TO anon;

-- The `authenticated` half of the same decision, unchanged: `authenticated` has
-- held table-wide arwd on `people` since 111_restrict_people_select_to_authenticated,
-- and RLS (four TO authenticated policies; people_select admits the person's own
-- row plus show managers) is what scopes it. Restated because a migration that
-- grants on an EXISTING table must say where both API roles stand — see
-- apps/myk9show/src/test/database/migrationGrantDecisionContract.test.ts.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;

-- Existing RLS is the row guard and is unchanged: every policy on `people` is
-- TO authenticated (people_select admits the person's own row plus show managers via
-- is_show_manager()), so a secretary building paperwork can read a handler's date of birth
-- and nobody else can. No new policy, no new grant to authenticated (it already holds arwd).

-- Fail the push rather than silently publish a minor's date of birth to the public web.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.people', 'SELECT') THEN
    RAISE EXCEPTION
      'anon holds table-level SELECT on public.people — people.date_of_birth would be readable by anon. Re-scope that grant to columns before adding PII.';
  END IF;
  IF has_column_privilege('anon', 'public.people', 'date_of_birth', 'SELECT') THEN
    RAISE EXCEPTION 'anon can SELECT people.date_of_birth; it must not.';
  END IF;
  IF has_column_privilege('anon', 'public.people', 'junior_handler_numbers', 'SELECT') THEN
    RAISE EXCEPTION 'anon can SELECT people.junior_handler_numbers; it must not.';
  END IF;
END $$;
