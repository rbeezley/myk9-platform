# Components Rest Batched Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate MYK9-346 through MYK9-353 in dependency-safe batches, prioritizing show-day data integrity and offline reliability before lower-risk cleanup.

**Architecture:** Each batch has a disjoint write set and an independently testable acceptance gate. P1 fixes land before dead-code deletion; MYK9-350 starts with a consolidation decision because `personRolesService` is shared by user creation and editing. MYK9-351 uses a database transaction boundary rather than client-side delete-plus-insert sequencing.

**Tech Stack:** TypeScript, React, Vitest, Playwright, TanStack Query, Supabase/Postgres RPCs and migrations, pnpm.

**Spec:** `docs/qa/bug-audit-components-rest-2026-09-02.md` at baseline `96adec8dc`.

## Global Constraints

- Work in a linked feature worktree, never the primary checkout on `main`.
- Read `docs/INTENT.md` before UX-facing changes.
- Use replication-backed paths for persistent offline data; do not bypass them with direct Supabase reads.
- Preserve `PerformanceCharts`, `offline-checkin/*`, `sync/SyncMonitoringDashboard/`, `SlideOverPanel`, and `panels/edit/*`.
- Re-read current source and re-run import scans immediately before MYK9-353 deletions; PRs #1973/#1974 may have changed dog importers.
- Run focused tests after every batch; run `pnpm typecheck`, `pnpm lint`, and `pnpm qa:code-quality-ratchet` before closing the relevant issue.

## Batch order

| Order | Batch | Issues | Parallelism | Why |
| --- | --- | --- | --- | --- |
| 0 | Coordination and baseline | all | one coordinator | Resolve the MYK9-350 consolidation choice and capture current branch/PR overlap before workers edit. |
| 1 | Protect unsynced work | MYK9-348 | one worker | Prevents irreversible show-day data loss and establishes safe cache boundaries for later cleanup. |
| 2 | Offline identity gate | MYK9-347 | one worker | Restores exhibitor access during cold offline boot; independent of the form and cache code. |
| 3 | Show Edit validation | MYK9-346 | one worker | Restores Nationals persistence and makes entry-limit validation visible and savable. |
| 4 | Role-surface consolidation or scoped repair | MYK9-350 | one worker after Batch 0 | Avoids fixing a redundant surface if the canonical role-management link can replace it. |
| 5 | Atomic judge qualification save | MYK9-351 | one worker, migration review required | Requires explicit authorization and a transaction boundary. |
| 6 | Inclusive local show dates | MYK9-352 | one worker | Isolated low-risk date classification fix. |
| 7 | Dead-code cleanup, in deletion batches | MYK9-353 | one worker per sequential deletion batch | Deletion is safest after live P1/P2 paths and shared imports have stabilized. |

## Batch 0: Coordination and baseline

**Files:** No source edits. Review `docs/qa/bug-audit-components-rest-2026-09-02.md`, Linear MYK9-346–353, current `main`, and active PRs touching `components/`.

- [ ] Confirm the implementation work starts from a fresh feature worktree and record `git branch --show-current` plus `git rev-parse --git-dir --git-common-dir`.
- [ ] For MYK9-350, decide whether `BasicInfoTab` should link to the canonical role-management surface (preferred) or retain the panel and scope its service writes. Do not silently choose both.
- [ ] Record any files changed by active PRs #1973/#1974 before the dead-code batch.

## Batch 1: MYK9-348 — protect unsynced work

**Subagent scope:** `apps/myk9show/src/components/preferences/DataSettings.tsx`, its tests, and the smallest shared cache helper needed to inspect replication and offline scoring queues. Do not modify replication behavior outside the cache guard.

**Required behavior:** Replace blanket `localStorage.clear()` and blanket IndexedDB deletion with explicit disposable-key/database lists. Before clearing, count `REPLICATION_STORES.PENDING_MUTATIONS` and `useOfflineScoringStore.getState().syncQueue`; block and name the pending count when either is nonzero. Use the existing destructive-confirmation pattern and copy that identifies what is removed.

- [ ] Add the pure guard test first: pending mutations or pending scores blocks; both queues empty allows clearing.
- [ ] Add a component test proving a non-empty outbox does not call `deleteDatabase` or reload.
- [ ] Add an allowed-path test proving disposable caches are cleared while `myK9_Replication`, auth, settings, and pending-work stores remain intact.
- [ ] Implement the minimal guard and explicit allowlists.
- [ ] Run the focused DataSettings tests and relevant offline/replication tests.
- [ ] Verify manually or with a browser test that the confirmation names unsynced changes.

**Acceptance gate:** A pending `PENDING_MUTATIONS` row or offline score prevents clearing; an empty queue permits only the named disposable caches to be removed; no blanket storage/database sweep remains.

## Batch 2: MYK9-347 — offline onboarding gate

**Subagent scope:** `apps/myk9show/src/hooks/useExhibitorProfile.ts`, `apps/myk9show/src/components/exhibitor/ExhibitorOnboardingChecker.tsx`, and their tests. Do not alter role loading or onboarding creation behavior.

- [x] Add a hook test for `status: 'pending', fetchStatus: 'paused', profile: undefined`, asserting `needsOnboarding` is false.
- [x] Add settled-query tests proving a successful `null` profile still requires onboarding and a successful profile does not.
- [x] Implement the smallest completeness gate using the full query result; a paused or otherwise unresolved query is unknown, not absence.
- [x] Add or extend `test/e2e/offline-cold-boot.spec.ts` for an exhibitor who stays on the requested route during cold offline boot.
- [x] Run the focused hook/checker tests and the offline cold-boot E2E.

**Acceptance gate:** Reverting the completeness condition fails the paused-query unit test or the cold-boot E2E; no route-change loop redirects an onboarded exhibitor while the profile query is unresolved.

## Batch 3: MYK9-346 — Show Edit Fees validation

**Subagent scope:** `apps/myk9show/src/lib/validation.ts`, `components/panels/edit/ShowEditFeesTab.tsx`, `ShowEditForm.tsx` only if required by the existing form API, and focused Show Edit tests. Do not refactor `EditPanelWrapper` globally.

- [ ] Add a schema regression test asserting `showSchemas.edit.safeParse(showToFormData({ isNationals: true })).data.isNationals === true`.
- [ ] Add a component test that enters `2` into Max Entries Per Dog, saves, and asserts `onSave` receives `2` as a number.
- [ ] Add a component test that clears an entry-limit field to empty and asserts the saved value is `undefined` rather than `''`.
- [ ] Add field-error coverage for an invalid value through the existing `FormField`/`getFieldProps` path.
- [ ] Add `isNationals: z.boolean().optional()` and parse entry-limit input values to `number | undefined`.
- [ ] Run the affected Show Edit vitest files, then typecheck and lint.

**Acceptance gate:** Nationals survives schema parsing; both entry-limit fields save as numbers or `undefined`; invalid input displays an error and does not silently no-op.

## Batch 4: MYK9-350 — role-surface decision and repair

**Preferred path:** Remove/demote the redundant Role Management block from `BasicInfoTab.tsx` and link to the canonical `ManageUserRolesDialog` surface with the appropriate person context. Confirm the canonical surface preserves club/show scope and audit behavior before deleting the old calls.

**Fallback path if the panel is intentionally retained:** Modify `personRolesService.ts` and its callers so reads include scope, revokes target the selected role row or explicit scope predicate, grants provide required `club_id`, and all Supabase errors reach the UI. Because `UserCreationPanel.tsx` also calls the service, inspect and test that caller in the same batch.

- [ ] Add a regression test with two scoped secretary grants proving an edit/revoke cannot remove the other scope.
- [ ] Add a failed-grant test proving the check-violation is surfaced rather than swallowed.
- [ ] Implement only the selected consolidation or scoped-repair path.
- [ ] Run role-management/RBAC tests and inspect the relevant RLS migration (`102`).

**Acceptance gate:** There is one canonical role-management path, or the retained path is scope-aware and error-visible; no mass revoke or silent `club_id` failure remains.

## Batch 5: MYK9-351 — atomic judge qualification save

**Subagent scope:** `apps/myk9show/src/components/panels/edit/JudgeQualificationPanel.tsx`, the judge database service/client wrapper, and one new Supabase migration/RPC. Do not combine this with role-service changes.

- [ ] Inventory the current `judge_qualifications` RLS policies and panel permissions before writing SQL.
- [ ] Add a database-level test or migration verification that an insert failure rolls back the preceding delete and preserves the original rows.
- [ ] Define a `SECURITY DEFINER` replacement RPC with explicit caller authorization matching the intended panel permissions; validate every replacement row before deleting existing rows.
- [ ] Call the RPC from the panel and invalidate/refetch qualification queries on both success and failure.
- [ ] Add a panel/service test proving a second-row failure leaves the original qualification set intact and the UI refetches true state.
- [ ] Run migration verification, focused qualification tests, typecheck, and lint from the worktree.

**Acceptance gate:** Replacement is all-or-nothing under a real database transaction; authorization is explicit; failure cannot leave zero rows or stale UI.

## Batch 6: MYK9-352 — inclusive local show dates

**Subagent scope:** `apps/myk9show/src/components/clubs/ClubDetails/useClubDetailsState.ts` and focused date/component tests. Modify `utils/date-format.ts` only if the existing helper cannot represent the required inclusive end-of-day semantics.

- [ ] Add timezone-controlled tests for `America/Chicago`: the show remains upcoming at 19:30 the evening before its end date and at 23:00 on the end date.
- [ ] Add a test proving a long-lived component does not freeze the current time for the entire tab lifetime.
- [ ] Use the repository's local date helper and treat the `endDate` as inclusive through the local end of day.
- [ ] Run focused Club Details/date tests plus typecheck and lint.

**Acceptance gate:** The show appears in upcoming shows through the end of its final local calendar day and then moves to past shows.

## Batch 7: MYK9-353 — sequential dead-code deletion

Do not dispatch these deletion sets concurrently because several share barrels, type-only imports, and mount files. Before each set, run an importer scan against the current tree and stop if a live importer appears.

### 7A: Panel stack

Delete the unreachable panel-stack subsystem and its mounts: `PanelManager.ts`, `PanelStack.tsx`, `PanelContext.tsx`, `context.ts`, `hooks.ts`, `EntityCreationPanel.tsx`, `PanelTestComponent.tsx`, `entities/**`, and the three `PanelProvider`/two `PanelStack` mounts. Keep `SlideOverPanel` and `panels/edit/*`; update test mocks only when they reference removed modules.

### 7B: Sync orphans

Move or inline the `SyncStatus` type before deleting its source dependency. Delete only non-monitoring sync components and preserve `sync/SyncMonitoringDashboard/` and `/admin/sync`. Re-scan `components/conflict/*`, dead dog/user cards, barrels, dynamic imports, and route tables before removal.

### 7C: Offline orphans

Move `BackupInfo` and `ExportOptions` out of `OfflineDataManager` and update `services/offline/BackupService.ts` before deleting orphaned `components/offline/*`. Never delete `components/offline-checkin/*`, and ensure the MYK9-348 explicit cache policy does not depend on deleted components.

### 7D: Providers, common, and standalone rows

Delete only confirmed zero-importer files such as the unused provider/search chain and standalone rows. Trim `common/LazyComponents.tsx` to live exports; do not delete the module because `VenuePinMap`, `ShowCalendar`, and `ShowsMapView` are live. Re-grep dog rows immediately before deleting them.

For every 7.x set:

- [ ] Capture the pre-delete `rg` importer scan.
- [ ] Delete only rows with no live importer, handling type-only escapes first.
- [ ] Run affected tests, `pnpm typecheck`, `pnpm lint`, and `pnpm qa:code-quality-ratchet`.
- [ ] Capture the post-delete scan and verify all routes/mounts named in the audit still resolve.

**Final acceptance gate:** Every deleted symbol has zero remaining source importers; all explicitly live surfaces remain; the code-quality ratchet, typecheck, lint, and affected tests pass from the same worktree.

## MYK9-364 residual cleanup — 2026-09-03

Request: `implement MYK9-364`. Status: Complete — merged in [PR #2000](https://github.com/rbeezley/myk9-platform/pull/2000), commit `1edc2f1e`; Linear is Done.
This follows Batch 7's deletion workflow without a new OpenSpec change because it
only removes a bounded, confirmed-unmounted residue and stale source-test entries.

- [x] Verify all 15 standalone modules and the three-file LazyDogCard chain against
      source imports, exported symbols, barrels, route tables, and dynamic loaders.
      No live consumers found; WorkflowStepContent still mounts DogSelectionStepEnhanced.
- [x] Delete the 18 issue-listed modules and remove the AdvancedSearch and
      InfiniteDogSelectionStep entries from the icon-only-button source guard.
- [x] Testing: run the affected source guard and live dog-selection tests, then
      `pnpm typecheck`, `pnpm lint`, and `pnpm qa:code-quality-ratchet`.
- [x] Verify no remaining source references to the removed modules or exports;
      inspect the final diff for changes outside the issue scope.
- [x] Record verification and branch evidence in Linear; keep the issue open until merge.

Evidence from `codex/myk9-364`: 18 modules deleted (4,340 component lines),
zero remaining source references, 5 focused test files / 14 tests passing with
shuffled order, all 26 typecheck tasks passing, lint passing with 18 warnings in
untouched files, and code-quality ratchet passing without a baseline update.
The E2E typecheck gate reported 59 known diagnostics against 62 baselined, zero
new. Typecheck and ratchet required execution outside the sandbox for tsx's local
IPC socket. Final diff review and `git diff --check` passed.

Independent Codex and Claude Code reviews approved with no blocking findings;
Claude also ran 97 source-guard tests successfully. All required CI checks passed,
including Quality Checks, Test, A11y smoke, and E2E PR Smoke.

## Final integration

- [ ] Review the combined diff for unrelated changes and confirm each Linear issue's acceptance criteria has evidence.
- [ ] Run the full relevant app checks once after all batches: `pnpm typecheck`, `pnpm lint`, affected Vitest suites, and `pnpm qa:code-quality-ratchet`.
- [ ] Reconcile active PR overlap and re-run the MYK9-353 importer scan before opening or updating the cleanup PR.
- [ ] Update Linear only after its evidence gate passes; keep MYK9-350 open if the consolidation decision or canonical-surface verification remains unresolved.
