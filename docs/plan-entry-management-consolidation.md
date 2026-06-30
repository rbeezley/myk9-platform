# Plan: Entry Management Consolidation

> Status: Complete

## Problem

`EntryManagementPage.tsx` sits at the 500-line ceiling and still owns trial/class
scope details that belong behind a smaller module interface: trial class lookup,
breadcrumb naming, and roster-row shaping.

## Duplication Question

This does not create a new Entry Management surface. It moves existing
trial-scope implementation behind a module that the page can call, keeping the
same URL, tabs, and actions.

## Phase 1

- [x] Extract trial class lookup and roster/breadcrumb shaping into an
      `useEntryManagementTrialScope` module.
- [x] Keep visual behavior unchanged.
- [x] Add focused unit tests for roster row shaping and breadcrumb labels.
- [x] Run the focused new test plus existing Entry Management page tests.

## [ADDED] Invariants

- Keep the same route, tabs, URL params, secretary-only access check, and Entry
  action handlers.
- Preserve the existing load-error and action-error separation: load failures
  replace main content; action failures remain an inline alert.
- Preserve the trial/class filter behavior, including the class-filtered roster
  and fallback labels like `Trial 2`.
- Keep the query count equivalent to the old page: the new module wraps the
  existing `useShowTrials`, `useClassesByTrialQuery`, and `useTrialEntries`
  calls instead of adding parallel fetch paths.

## [ADDED] Rollback / Recovery

This slice has no schema, route, environment, or shared-system changes. Rollback
is a plain `git revert` of the branch commit. Because behavior is preserved and
the extracted module is only called by `EntryManagementPage`, reverting restores
the old inline page logic without data migration or feature-flag cleanup.

## [ADDED] Operational Notes

- No database migration.
- No Supabase push or function deploy.
- No environment variable changes.
- No new user-facing surface.

## Testing

- `pnpm exec vitest run src/hooks/useEntryManagementTrialScope.test.ts`
- `pnpm exec vitest run src/pages/secretary/__tests__/EntryManagementPage.roster.test.tsx src/pages/secretary/__tests__/EntryManagementPage.errorState.test.tsx src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx`
- `pnpm typecheck`
- `pnpm lint`

## [ADDED] Validation Profile

- Risk: low
- Validation: focused
- Rationale: This is a one-app structural extraction with no behavior, schema,
  auth, payment, or shared-system changes; focused unit/page coverage plus
  typecheck and lint is enough before CI.
