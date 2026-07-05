## 1. Phase 1 — Delete dead & duplicate motion code

- [x] 1.1 Grep-audit each deletion target across code AND docs (`grep --include="*.md"` for every name), and re-confirm the live/dead import graph from design.md D1/D2. Record any doc references to fix.
- [x] 1.2 Delete leaf consumers first: `components/scoring/OptimisticScoreEntry.tsx`, `components/ui/DelightfulToast.tsx`, `components/common/AnimatedComponents.tsx` (wholesale — zero importers).
- [x] 1.3 Delete the now-orphaned optimistic support cluster: `components/optimistic/` (all files), `hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`. Re-grep after each to confirm zero live importers.
- [x] 1.4 Verify the LIVE engine is untouched: `hooks/useOptimisticScoring.ts` + `hooks/useOptimisticUpdate.ts` still present; `ScoresheetPage`, `useAtShowScoresheet`, `pages/scoring/types.ts` still import them.
- [x] 1.5 Remove the two `useReducedMotion` re-export shims (`features/heritage/hooks/useReducedMotion.ts`, `features/magazine/hooks/useReducedMotion.ts`); re-point callers (`heritage/landing/sections/RosterSection.tsx`, heritage/magazine feature `index.ts` re-exports, `features/heritage/__tests__/useReducedMotion.test.ts`) to `features/_shared/hooks/useReducedMotion`.
- [x] 1.6 Fix any doc references found in 1.1; `pnpm typecheck` + `pnpm lint` clean.

## 2. Phase 2 — Motion tokens + spec doc

- [x] 2.1 Add `transitionDuration` (`micro` 150ms, `state` 200ms, `enter` 250ms, `layout` 350ms) and `transitionTimingFunction` (`ease-enter` `cubic-bezier(0.16, 1, 0.3, 1)`, `ease-exit` `ease-in`) under `theme.extend` in `apps/myk9show/tailwind.config.js`.
- [x] 2.2 Link the plan's motion-spec table from `DESIGN.md` (docs-only edit) as the human-readable source of truth.

## 3. Phase 3 — Fix ringside SuccessToast (bug + motion)

- [x] 3.1 Add a `.success-toast` rule via plain shipped CSS in the ringside stylesheet (fixed bottom-center; fade + 4–8px rise over 250ms enter; fade-out leave; `@media (prefers-reduced-motion: reduce)` disables transform/opacity but keeps visibility). No framer-motion in `packages/ringside`.
- [x] 3.2 Move the auto-dismiss timer to the owning parent state (`EntryListPage` / `CombinedEntryListDialogs`): clear on unmount, reset on rapid consecutive saves (drive dismissal from hook/state, not a component-body `setTimeout`).
- [x] 3.3 Audit the ringside scoring save path for an acknowledgment cue; if none exists, add a ~300ms CSS check-draw/background flash on the scored row using the same CSS approach.
- [x] 3.4 Verify CSS delivery in-browser (preview/`/at-show`) — the rendered toast, not the source diff (#432 footgun check).

## 4. Phase 5 — Status-change + reorder motion

- [x] 4.1 Added `transition-colors duration-state motion-reduce:transition-none` to the shared `CheckInStatusBadge` (show-day status chip; colors applied via CSS-var inline styles that change with status) so status changes crossfade in place.
- [x] 4.2 Applied Framer `layout="position"` to `EntryCardGrid` cards (non-virtualized card grid, stable `entryId` keys), `duration-layout` timing, gated on `useReducedMotion`. Results TABLE view left alone (Framer `layout` unreliable on `<tr>`; drag reorder already handled by `@dnd-kit`).
- [x] 4.3 Virtualized lists (`VirtualScrollList`, `EntitySidebar`, `DogSelectionStepEnhanced`) deliberately EXCLUDED from `layout` per the guard; the chosen target (`EntryCardGrid`) is non-virtualized. Guard rationale documented in `reorderLayoutMode` + design D6.
- [x] 4.4 Ringside reorder: VERIFIED `@dnd-kit` already provides it (`SortableEntryCard` applies `useSortable` `transform`+`transition`). No change needed; ringside stays framer-free per the non-goal.

## 5. Testing

- [x] 5.1 Source-text unit test pinning the token names/values in `tailwind.config.js` (`feedback_source_text_regression_tests`).
- [x] 5.2 Ringside `SuccessToast` tests: renders message + visibility toggle; fake-timer auto-dismiss; rapid-retrigger reset; unmount clears timer. (`window.matchMedia` already mocked in `src/test/setup.ts`.)
- [x] 5.3 Reduced-motion gating asserted via `reorderLayoutMode` (false when reduced-motion → instant reposition); toast gates via the CSS `motion-reduce:` variant.
- [x] 5.4 Unit tests for the extracted pure helper `reorderLayoutMode` (3 cases: motion allowed / reduced / null).
- [x] 5.5 Grep proves zero remaining imports of every deleted name; `pnpm typecheck` + `pnpm lint` (0 warnings) green; 374 vitest green across all changed areas (app touched 71, ringside EntryList 113, at-show 190) — full suite runs in CI (6.2).
- [x] 5.6 [ADDED] Rebuilt `@myk9/ringside` (`pnpm --filter @myk9/ringside build`) before the app-level at-show suite so it ran against fresh `dist` (`feedback_rebuild_package_for_app_tests`); 190 at-show tests green.

## 6. Ship gate

- [ ] 6.1 `/simplify` pass on the diff, then commit.
- [ ] 6.2 Open PR (Summary cites `Tracked in openspec change: motion-consistency`); CI green.
- [ ] 6.3 Code review (code-reviewer subagent) + Codex second opinion (user-visible + shared-package change) per CLAUDE.md; resolve findings.
- [ ] 6.4 Squash-merge from the main repo dir; update `OPEN-TODOS.md` motion-consistency line on completion.
