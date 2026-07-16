# Nightly Review Fixes — 2026-07-16

> **Status:** Active

## Scope

Fix the five unresolved issues from the 2026-07-16 nightly commit review:

1. Remove production Vercel credentials from automatic CI promotion and require explicit production release preflight.
2. Preserve dog identity on cold direct at-show scoresheet loads.
3. Make the Phase 1 verifier cover both automatic release targets.
4. Align E2E setup/fixtures with per-role credentials.
5. Preserve class context from Class Details to Manage Entries.

## Implementation

- Replace the automatic production deployment path with tokenless `staging-release` and `guides-release` ref promotion.
- Add a manual exact-SHA production workflow with an unprivileged preflight and protected production environment.
- Extend source verification and fixtures for both workflows and the guides target.
- Use projected `dogCallName`/`dogBreed` fields as scoring fallbacks and cover a missing dog replica.
- Resolve per-role E2E passwords and update the legacy fixture/setup contract.
- Pass `classId` through the shared entry-management route and add a navigation regression test.

## Testing phase

- Run focused Vitest files for scoring identity, Class Details navigation, and Phase 1 verification.
- Run E2E credential helper tests and TypeScript/lint checks for the app.
- Run YAML/source-contract assertions and `git diff --check`.
- Review the final diff for unrelated changes and verify no automatic workflow references `VERCEL_TOKEN`.
