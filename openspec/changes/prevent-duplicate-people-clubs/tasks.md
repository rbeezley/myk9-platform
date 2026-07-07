## 1. Data Inventory and Database Guardrails

- [x] 1.1 Inventory live duplicate clubs with a read-only normalized-name query and document the query in the migration.
- [x] 1.2 Add immutable SQL helper(s) for normalizing club names.
- [x] 1.3 Add a migration guard that fails clearly if existing live club duplicates would block the unique index.
- [x] 1.4 Add a partial unique index for normalized live club names.
- [x] 1.5 Add `create_or_reuse_club` RPC behavior that mirrors current club-create authorization and returns an existing matching club when authorized.
- [x] 1.6 Confirm `people_email_unique` remains the exact people identity guardrail and add/adjust comments or contract tests if needed.

## 2. Shared Identity Helpers

- [x] 2.1 Add TypeScript helpers for normalized club identity comparison and likely club candidate scoring from loaded clubs.
- [x] 2.2 Add TypeScript helpers for normalized people identity comparison and likely person candidate scoring from loaded people.
- [x] 2.3 Add duplicate error translation for club exact-identity conflicts and people email conflicts.
- [x] 2.4 Keep helper thresholds conservative so weak people/club matches remain advisory and do not block creation.

## 3. Existing Surface Integration

- [x] 3.1 Update the club database/query create path to use duplicate-aware club creation while preserving cache invalidation.
- [x] 3.2 Wire the show wizard host-club inline create flow to reuse/select an existing exact club.
- [x] 3.3 Wire `ClubCreationPanel` to surface likely club candidates and resolve them inside the panel.
- [x] 3.4 Replace `CreateExhibitorDialog` mock duplicate detection with real loaded or queried people data.
- [x] 3.5 Centralize person duplicate behavior used by `UserCreationPanel`, `CreateExhibitorDialog`, and show-wizard official creation.
- [x] 3.6 Keep all resolution inside existing creation surfaces; do not add new pages, sheets, or duplicate-management navigation.

## 4. Tests

- [x] 4.1 Add focused tests for club normalization and likely club candidate scoring.
- [x] 4.2 Add focused tests for person normalization and likely person candidate scoring.
- [x] 4.3 Add focused tests for duplicate error translation.
- [x] 4.4 Add focused tests for duplicate-aware club create handling.
- [x] 4.5 Add component or hook tests proving existing-surface duplicate UX uses real data, not mock records.
- [x] 4.6 Run focused test files for changed utilities, hooks, and components.
- [x] 4.7 Run `pnpm typecheck` or a narrower TypeScript check if the full suite is impractical.

## 5. Verification and Shipping

- [x] 5.1 Run `pnpm openspec validate --changes prevent-duplicate-people-clubs`.
- [x] 5.2 Run the club duplicate inventory query or dry-run before requesting approval for any shared database push.
- [x] 5.3 Update `OPEN-TODOS.md` when the implementation closes the people/clubs parked scope or splits remaining merge-tooling work.
- [x] 5.4 Commit the implementation branch.
- [x] 5.5 Open a PR with `Tracked in openspec change: prevent-duplicate-people-clubs` and verification evidence.
- [ ] 5.6 Confirm CI/review status before merge; do not archive until the PR is merged.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change touches a Supabase migration, club creation behavior, existing person/club creation surfaces, and duplicate handling in secretary-facing workflows.
