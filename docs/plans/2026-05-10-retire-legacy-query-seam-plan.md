# Retire Legacy Query Seam Plan

## Goal

Make `apps/myk9show/src/services/database/<entity>/index.ts` the only public
data-access seam for each entity. Production code and tests should stop importing
from `apps/myk9show/src/services/database/queries/*` once an entity module exists.

This follows `CONTEXT.md`: Entry, Class, Trial, Dog, Show, Armband, and related
entities each have an authoritative module under `services/database/<entity>/`.

## Current Shape

- Every entity folder under `apps/myk9show/src/services/database/` has an
  `index.ts`.
- Some entity work has already started:
  - `docs/plans/2026-05-09-entry-data-access-deepening-plan.md`
  - `docs/plans/2026-05-09-show-data-access-deepening-plan.md`
- `services/database/queries/entryQueries.ts` and `showQueries.ts` already act
  as compatibility adapters.
- Callers still import from `services/database/queries/*` in production code,
  unit tests, and E2E helper code.

## Principles

- Migrate tests as well as production code.
- Migrate by entity, not by global search-and-replace.
- Keep compatibility adapters until `rg` proves no callers remain.
- Do not move direct Supabase or replication behavior into callers to make a
  migration easier.
- If an entity module lacks a needed export, add it to that entity module rather
  than importing from `queries/*`.

## Phase 1: Inventory And Slice Order

- Status: Started.
- Run `rg "services/database/queries" apps/myk9show/src`.
- Group matches by entity:
  - Entry
  - Show
  - Class
  - Trial
  - Dog
  - User/Person
  - Armband
  - Wait List
  - smaller online-only entities such as Promo Code, Premium Template, Health,
    Pedigree, Manual Result, Training, Announcement, Onboarding Request, and
    Club Membership
- Start with Entry and Show because existing plans already define their target
  modules.
- Completed current inventory slice for legacy Entry, Show, Class, Trial, Dog,
  User, and Club query imports in active app source.

## Phase 2: Migrate Entry And Show Callers

- Status: Started.
- Continue the Entry plan:
  `docs/plans/2026-05-09-entry-data-access-deepening-plan.md`.
- Continue the Show plan:
  `docs/plans/2026-05-09-show-data-access-deepening-plan.md`.
- Update production imports, mocks, and dynamic test imports from:
  - `@/services/database/queries/entryQueries`
  - `@/services/database/queries/showQueries`
  to:
  - `@/services/database/entries`
  - `@/services/database/shows`
- Keep `entryQueries.ts` and `showQueries.ts` until no callers remain.
- Completed current Show import slice in quick integration tests, waitlist hook
  tests, and entity E2E helpers.

## Phase 3: Migrate Remaining Replicated Entities

- Status: Started.
- Move Class callers to `services/database/classes`.
- Move Trial callers to `services/database/trials`.
- Move Dog callers to `services/database/dogs`.
- Move Armband callers to `services/database/armbands`.
- Move Wait List callers to `services/database/waitlists`.
- If the entity module exposes a different function name, either migrate the
  caller intentionally or add a compatibility alias to the entity module.
- Completed current Class, Trial, Dog, User, and Club entity E2E helper import
  slice.
- Completed root `services/database/queries` barrel removal from paginated and
  optimized search hooks plus their unit-test mocks.

## Phase 4: Migrate Online-Only Entities

- For each online-only query module, decide whether it already has a matching
  entity module:
  - If yes, migrate callers to that module.
  - If no, create the entity module first, move implementation there, and leave
    the old query file as a redirect adapter.
- Prioritize modules with production callers before test-only or plan-only
  references.

## Phase 5: Retire Compatibility Adapters

- For each old query file, run:
  - `rg "services/database/queries/<file-base>" apps/myk9show/src`
  - `rg "services/database/queries/<file-base>" docs`
- Delete the compatibility adapter only when app code and active tests no longer
  import it.
- Leave historical docs untouched unless they are active tracking docs.
- Update `CONTEXT.md` only if a new domain term or exception emerges.

## Phase 6: Testing

- For each entity slice, run the focused unit tests for touched modules.
- For test import migrations, run the touched test files directly.
- Run `pnpm typecheck` after each multi-entity batch.
- Run `pnpm lint` or focused ESLint on touched TypeScript files.
- If a test runner hangs for more than 60 seconds, stop and report it.

## Exit Criteria

- `rg "services/database/queries" apps/myk9show/src` returns no production or
  active test imports that should use an entity module.
- Legacy query files are either deleted or clearly marked as temporary adapters
  with no active app callers.
- Entity modules are the only public data-access seams callers need to learn.
- Focused tests and typecheck pass for each completed slice.
