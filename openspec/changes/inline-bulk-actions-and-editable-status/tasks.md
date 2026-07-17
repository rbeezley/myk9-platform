# Tasks — Inline Bulk Actions and Editable Status

## 1. Shared typed action layer (no behavior change)

- [x] 1.1 Confirm `status-icon-grammar` (MYK9-52) merge status; note the `StatusIcon` import path for slice 4 (blocks 4.2 only)
- [x] 1.2 Define `EntityAction<T>` type and resolver module (`toRowActions`, `toBulkActions` with `{eligible, selected}` counts) alongside `components/ui/RowActionMenu`
- [x] 1.3 Express the entry domain's actions as `EntityAction` definitions, porting `bulkActionEligibility.ts` predicates into `applicableWhen` (keep exports for any external callers)
- [x] 1.4 Write characterization tests for current `EntryRowActionMenu` + `EntryBulkActionMenu` (menu items, eligibility narrowing, dispatched handlers) BEFORE refit
- [x] 1.5 Refit `EntryRowActionMenu` and `EntryBulkActionMenu` onto the resolver; characterization tests must pass unchanged
- [x] 1.6 Unit tests for the resolver: eligibility projection, eligible-of-selected counts, `unavailableReason` on zero-eligible
- [x] 1.7 Verify: `cd apps/myk9show && pnpm vitest run src/components/entries/management` + `pnpm typecheck`

## 2. Class Management selection migration

- [x] 2.1 Verify the `updateClass` write seam is replication-backed; if not, route class bulk through `replicatedClassesTable` or scope class bulk accordingly (document decision in design.md)
- [x] 2.2 Replace `ClassManagementPage` local selection (`useState<string[]>`, `toggleClassSelection`, `selectAllFiltered`, "Select all filtered" button) with `useBulkSelection` (`pruneToItems: true`) + header/indeterminate checkbox
- [x] 2.3 Define class-domain `EntityAction` definitions (status change, delete) and render the bulk bar/menu from the shared resolver
- [x] 2.4 Convert class bulk handlers to `Promise.allSettled` over per-item mutations with structured `{succeeded, failed}` outcome; remove `window.confirm` for undo-covered transitions only (delete keeps its dialog until 4.x undo policy applies — delete is destructive, retains confirmation)
- [x] 2.5 Component tests: selection pruning on filter change, indeterminate header, bulk dispatch outcomes, double-fire latch
- [x] 2.6 Verify: `cd apps/myk9show && pnpm vitest run src/pages/secretary` (class mgmt tests) + `pnpm typecheck && pnpm lint`

## 3. Honest dispatch everywhere + surface opt-ins

- [x] 3.1 Build the shared bulk-outcome helper: `Promise.allSettled` fold, partial-failure summary toast with per-item reasons, retry-failed that re-runs `applicableWhen` and reports newly ineligible items as skipped; in-flight latch via `useRef`
- [x] 3.2 Adopt the helper in Entry Management bulk handlers (`handleEnrollmentBulkStatusChange`, `handleEnrollmentBulkCheckIn`) replacing `Promise.all`
- [x] 3.3 Admin Users: wire bulk role and bulk status to the real mutations used by single-user actions; delete any action with no real mutation (remove `setTimeout` stubs in `useBulkActions.ts`)
- [x] 3.4 Dogs: opt `DogsTableView` into `DataTable` native selection bridged to `useBulkSelection`; add dog `EntityAction` definitions (status change active/retired/deceased via `updateDog`, soft-delete via `useDeleteDogMutation`) + bulk bar
- [x] 3.5 People (admin Users surface per design open question): ensure bulk delete reports per-item `MK001` failures with human-readable "owns registered dogs" reason
- [x] 3.6 Replace legacy `ThreeDotMenu` on `DogListRow` with `RowActionMenu` (consistency sweep; delete legacy wrappers if no consumers remain)
- [x] 3.7 Tests: outcome helper unit tests (partial failure, retry-skip, latch), dogs/people selection + bulk component tests, admin Users de-stub tests
- [x] 3.8 Verify: `cd apps/myk9show && pnpm vitest run src/components/admin src/components/dogs` + `pnpm typecheck && pnpm lint`

## 4. Inline status editing + undo

- [x] 4.1 Extract the shared `showUndoToast` helper from the inlined show-map sonner pattern (time-boxed, action button); migrate show-map scratch/move-up undo toasts onto it
- [ ] 4.2 Inline entry-status edit popover on Entry Management: badge (rendered via `StatusIcon` from MYK9-52) becomes a button opening eligible frequent transitions resolved from entry `EntityAction` definitions; 44px touch targets, focusable items
- [x] 4.3 Implement undo dispatch: inverse transition through `updateSecretaryLifecycleStatus` seam with supersession check (current status must equal the status our action produced, else "changed by someone else"); never call `restore_entry_status`
- [x] 4.4 Offline honesty: queued-offline messaging; enqueue inverse only where local queue ordering is guaranteed, otherwise withhold undo with explicit messaging
- [x] 4.5 Bulk undo: revert succeeded subset item-by-item, each with supersession check
- [x] 4.6 Remove routine confirmation dialogs ONLY for undo-covered simple transitions; retain reason/note/complex-input dialogs (reject-with-reason, withdraw/refund)
- [x] 4.7 Tests: undo supersession (mismatch aborts), offline-queued behavior, bulk undo subset, window expiry, dialog-retention matrix
- [x] 4.8 Verify: `cd apps/myk9show && pnpm vitest run src/hooks src/components/entries` + `pnpm typecheck && pnpm lint`

## 5. Verification and merge gate

- [x] 5.1 Full checks: `pnpm typecheck && pnpm lint`; `cd apps/myk9show && pnpm test`
- [x] 5.2 OpenSpec validation: `pnpm openspec validate inline-bulk-actions-and-editable-status`
- [x] 5.3 Tablet browser verification (secretary/steward): keyboard focus through badge popover and bulk menus, 44px touch targets, permission gating (non-managers see no selection/bulk), offline queued bulk change + honest messaging, forced partial failure (people `MK001` or rejected mutation) showing summary + retry — capture screenshots as documented evidence
- [ ] 5.4 PR with browser evidence; Codex review (behavior-changing: default ON); CI green; merge
- [ ] 5.5 Update Linear MYK9-47 (auto-completes on `myk9-47-*` PR merge — re-open until final PR if multiple slices ship separately); archive this change via `/opsx:archive`
