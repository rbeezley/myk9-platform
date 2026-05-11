# People CRUD Full Audit Plan

## Scope

Audit People CRUD in `apps/myk9show` for secretary and site admin roles:

- List/search/filter People surfaces.
- Create people, including required-field validation.
- Read/detail surfaces and relationship fields.
- Edit and cancel edit.
- Delete/soft-delete cancel and confirm paths.
- Capture console errors and failed network requests during the walk.

## Evidence Pass

- Start `pnpm dev:show` on `localhost:5173`.
- Sign in with existing e2e secretary and admin accounts from `apps/myk9show/src/test/e2e/helpers/testUsers.ts`.
- Record findings from the live browser walk before changing behavior.
- Classify each issue as UI/UX, stale cache, permission mismatch, or RLS/schema gap.

## Fix Pass

- Read the actual People components/hooks and schema/policies before editing.
- Gate UI permissions to match RLS instead of exposing actions that fail.
- For RLS fixes, add a new migration only after confirming current remote migration state and request confirmation before pushing.
- Keep changes scoped to People CRUD unless the walk exposes a blocking shared helper bug.

## Testing Phase

- Add or update focused Vitest coverage for any pure helpers or changed component behavior.
- Add a Playwright E2E spec under `apps/myk9show/src/test/e2e/entities/peopleUI.spec.ts`.
- Run the focused unit tests and the People E2E spec.
- Run `pnpm typecheck` if source files change.
