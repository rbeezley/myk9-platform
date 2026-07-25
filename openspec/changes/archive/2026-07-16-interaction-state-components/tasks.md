# Tasks — interaction-state components

Five sequential PRs. PR 1 carries the correctness fix and ships first even if the rest slips.

## 0. Setup

- [ ] 0.1 Run `bash scripts/bootstrap-worktree.sh` — this worktree reports `node_modules missing`; app tests and typecheck will not run without it.
- [ ] 0.2 Confirm the branch is off current `origin/main` and that `openspec/specs/contrast-token-system/spec.md` exists (proves post-archive main; the contrast matrix test must be present to extend).
- [ ] 0.3 Read `apps/myk9show/src/styles/__tests__/semantic-token-contrast.test.ts` to learn the matrix shape before adding tokens to it.

## 1. PR 1 — state contract, fan-out, and the double-submit fix

- [ ] 1.1 Add `--selected-*` and `--disabled-*` semantic tokens to `apps/myk9show/src/index.css`, following the existing convention of an inline comment carrying the contrast rationale.
- [ ] 1.2 Specify the existing `--shadow-card`, `--shadow-ring`, `--shadow-card-hover` elevation tokens (values exist; contract does not).
- [ ] 1.3 Extend `semantic-token-contrast.test.ts` to cover every new token in light and dark. **Write this test before the tokens are consumed** — it is the gate that keeps new state colors inside `contrast-token-system`.
- [ ] 1.4 Add `loading?: boolean` to `packages/ui/src/components/Button`. Sets `disabled`, renders a CSS spinner, sets `aria-busy="true"`, preserves the accessible name. CSS-only motion and `motion-reduce:` gating — `packages/ui` must not gain framer-motion (`motion-language` constraint).
- [ ] 1.5 Change `Button`'s focus ring to the canonical `ring-2 ring-ring ring-offset-2`, replacing `ring-primary/30 ring-offset-1`.
- [ ] 1.6 Add `selected?: boolean` and `interactive?: boolean` to `packages/ui/src/components/Card`, ring from `--ring`. Selected state must not be conveyed by color alone.
- [ ] 1.7 Unit-test `Button`: `loading` disables + shows spinner + `aria-busy`; absent `loading` renders no pending affordance; a second click while `loading` dispatches no second call; reduced-motion suppresses rotation.
- [ ] 1.8 Unit-test `Card`: `selected` renders the ring; selection is not color-only.
- [ ] 1.9 Fix `apps/myk9show/src/components/base/BaseEntityDialog.tsx` to destructure and honor `submitDisabled` and `maxWidth` — currently declared in `BaseEntityDialogProps` and silently dropped. Add a regression test asserting `submitDisabled` actually disables the submit control.
- [ ] 1.10 Add an explicit `destructive?: boolean` to `DialogFooterButtons`, replacing the label string-match (`saveLabel.toLowerCase().includes('delete')`). Keep the inference as a deprecated fallback only if a caller still depends on it; otherwise remove. Test that "Remove" and "Discard" render destructive when declared.
- [ ] 1.11 Thread `loading` through `DialogFooterButtons` and `BaseEntityDialog` so pending state reaches callers via the default path (design decision "Fan-out over opt-in").
- [ ] 1.12 Write failing double-submit regression tests **first** for the ~12 unguarded destructive dialogs: `DeletePersonDialog`, `ClassDetailsPage/DeleteClassDialog`, `ClassDetailsPage/DeleteEntryDialog`, `ClassEntriesTable/components/DeleteDialog`, `TrialManagementDialogs`, `TemplateActions`, `TemplateList`, `RoleListPage`, `UserRoleManagementPage`, `TemplateManagementPage`. Assert the mutation dispatches exactly once on a double press. Use `src/test/utils/testUtils.tsx`, not raw `render`.
- [ ] 1.13 Fix those dialogs so 1.12 passes, via the shared `loading` prop.
- [ ] 1.14 Migrate the 22 dialogs that hand-roll a spinner in the confirm button to `loading`.
- [ ] 1.15 Verify no `// INTENT:` interaction-state site was altered — re-check `ShowMapRunOrderMenu.tsx:44` (disabled at 0/1 entries) specifically, since it is a dialog-adjacent disabled rationale that already meets the bar.
- [ ] 1.16 `pnpm --filter @myk9/ui build` — app tests run against built `dist`; skipping this silently tests the old primitive.
- [ ] 1.17 `pnpm typecheck` (never raw `tsc`), `pnpm lint`, `cd apps/myk9show && pnpm test`. If typecheck passes suspiciously fast on new files, clear the incremental `tsbuildinfo` and re-run.
- [ ] 1.18 Open PR. Run `codex review --commit <SHA>` — this PR changes shared primitives, gates, and state, which is squarely in the Codex-review-default-on category. Address findings, wait for CI green, merge from the **main** repo directory (never from this worktree).

## 2. PR 2 — fold `enhanced-dialog` into `dialog.tsx`

- [ ] 2.1 Move `bg-card dark:bg-card`, `text-foreground`, and `border border-border` from `EnhancedDialogContent`/`Header`/`Title` directly into `dialog.tsx`'s `DialogContent`/`DialogHeader`/`DialogTitle`.
- [ ] 2.2 Delete `apps/myk9show/src/components/ui/dialog/enhanced-dialog.tsx` and remove the aliasing re-export from `components/ui/dialog/index.ts`.
- [ ] 2.3 Assert zero pixel change: dialogs still resolve `--card` (not `--background`) in light and dark. This step touches ~88 dialogs through the barrel — it is the highest blast radius in the change.
- [ ] 2.4 `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test`. Verify the dialog surface in the running app across light and dark before opening the PR.
- [ ] 2.5 Open PR, Codex review, CI green, merge from the main repo directory.

## 3. PR 3 — delete the shadow token layer

- [ ] 3.1 Migrate the 8 consumers of `utils/designTokens.ts` off `buildClasses` to `Button` variants and semantic Tailwind classes: `base/EntityCard.tsx`, `base/ValidatedForm.tsx`, `base/SkeletonLoaders.tsx`, `common/EntityCardContainer.tsx`, `common/Breadcrumb.tsx`, `layout/AppHeader.tsx`, `layout/SimpleHeader.tsx`.
- [ ] 3.2 Delete `apps/myk9show/src/components/base/FormDialog.tsx` — zero callers since `35c3a1d4b`, broken `FormData`/`Object.fromEntries` contract, nothing to salvage. It is the 8th consumer.
- [ ] 3.3 Delete `apps/myk9show/src/utils/designTokens.ts` and `apps/myk9show/docs/style-guides/design-tokens.json`.
- [ ] 3.4 Grep to prove no importer of either path remains, and that no untested mirror of state values exists.
- [ ] 3.5 `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test`.
- [ ] 3.6 Open PR, Codex review, CI green, merge from the main repo directory.

## 4. PR 4 — ring unification

- [ ] 4.1 Replace the 7 ring spellings across 279 occurrences / 127 files with the canonical `ring-2 ring-ring ring-offset-2`. Worst offenders first: `pages/SignUpPage.tsx` (10), `features/show-map/ShowMapStructureTable.tsx` (7), `components/landing/ClubOnboardingForm.tsx` (7), `pages/SmartSignInPage.tsx` (6).
- [ ] 4.2 Preserve the `// INTENT:` sites: `ShowMapStructureTable.tsx:206` (roving tab stop — the tree owns one focus target), `ShowMapStructureTable.tsx:133` (modal reorder mode), `ShowMapSortableEntryRow.tsx:95` (`touchAction: 'none'`), `ShowDeskAdaptiveHeader.tsx:377`. Leave the comments in place.
- [ ] 4.3 Grep to prove no `ring-blue-`, `ring-primary/`, `ring-offset-1`, `ring-offset-4`, or `ring-offset-0` state match remains outside a documented exception.
- [ ] 4.4 Verify focus is visible without hover on a touch viewport (INTENT: no hover-only interactions).
- [ ] 4.5 `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test`, plus the axe smoke gate.
- [ ] 4.6 Open PR, Codex review, CI green, merge from the main repo directory.

## 5. PR 5 — colour sweep and loading collapse

- [ ] 5.1 Resolve the two same-named `SkeletonLoaders.tsx` (`components/base/` and `components/common/`) into one module first — the name collision is a live footgun and blocks clean migration.
- [ ] 5.2 Collapse the redundant loading modules into the surviving skeleton module + `Button loading`. Delete any left without an importer, including `DelightfulLoading.tsx` (3 importers) if it does not survive on merit.
- [ ] 5.3 Sweep 370 raw `red-NNN` classes across 135 files to `destructive`. Worst offenders: `pages/admin/TemplateManagementPage.tsx` (14), `components/templates/secretary/RunOrderBoard.tsx` (9), `components/common/SyncStatusIndicator.tsx` (8), `components/templates/secretary/ClassScheduleView.tsx` (7), `components/sync/EntryCountReconciliation.tsx` (7), `components/entries/EntrySyncStatusBar.tsx` (7).
- [ ] 5.4 Confirm no loading indicator was added to a silent surface — `ReplicationSyncProvider.tsx:589,660` intent preserved, judge between-entry transitions still spinner-free, no sync progress bar.
- [ ] 5.5 `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test`, axe smoke gate.
- [ ] 5.6 Open PR, Codex review, CI green, merge from the main repo directory.

## 6. Close out

- [ ] 6.1 Verify every spec scenario has a corresponding passing test or a grep-provable assertion. Any scenario without one is a spec that lied.
- [ ] 6.2 Update `OPEN-TODOS.md` if this work closes a tracked line; verify state before editing rather than assuming.
- [ ] 6.3 Move MYK9-16 to Done in Linear **only after** all five PRs merge — priority is importance, not readiness, and the board is trusted here.
- [ ] 6.4 Run `/opsx:archive` to archive the change and sync the `motion-language` delta into `openspec/specs/motion-language/spec.md`. Fill the archive's injected "TBD Purpose" placeholder rather than leaving it.
- [ ] 6.5 Remove the worktree **before** deleting the branch, and run the removal from a path that still exists.
