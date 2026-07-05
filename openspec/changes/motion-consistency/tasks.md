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

- [ ] 4.1 Add `transition-colors duration-state` to entry status chips so status color changes crossfade in place (no bounce).
- [ ] 4.2 Apply Framer `layout` to non-virtualized myK9Show list rows (placement recalc / app-surface run order). Per-list check that the list is NOT react-window-virtualized before wiring.
- [ ] 4.3 For virtualized lists (`VirtualScrollList`, `EntitySidebar`, `DogSelectionStepEnhanced`), use the 200ms in-place crossfade fallback instead of `layout` (FLIP-on-recycled-node guard).
- [ ] 4.4 Ringside reorder: add CSS `transition` on transform only where the existing DnD library (`SortableEntryCard`/`@dnd-kit`) already exposes it — verify before adding.

## 5. Testing

- [x] 5.1 Source-text unit test pinning the token names/values in `tailwind.config.js` (`feedback_source_text_regression_tests`).
- [x] 5.2 Ringside `SuccessToast` tests: renders message + visibility toggle; fake-timer auto-dismiss; rapid-retrigger reset; unmount clears timer. (`window.matchMedia` already mocked in `src/test/setup.ts`.)
- [ ] 5.3 Reduced-motion gating assertion where a hook decision is involved (reorder/crossfade fallback path).
- [ ] 5.4 Unit tests for any pure helpers extracted in Phase 5.
- [ ] 5.5 Grep proves zero remaining imports of every deleted name; full myK9Show `vitest` + `pnpm typecheck` + `pnpm lint` green.
- [ ] 5.6 [ADDED] If any app-level test exercises the changed ringside code, rebuild the shared package first (`pnpm --filter @myk9/ringside build`) so app vitest runs against fresh `dist` (`feedback_rebuild_package_for_app_tests`); ringside-package-local tests run against source and need no rebuild.

## 6. Ship gate

- [ ] 6.1 `/simplify` pass on the diff, then commit.
- [ ] 6.2 Open PR (Summary cites `Tracked in openspec change: motion-consistency`); CI green.
- [ ] 6.3 Code review (code-reviewer subagent) + Codex second opinion (user-visible + shared-package change) per CLAUDE.md; resolve findings.
- [ ] 6.4 Squash-merge from the main repo dir; update `OPEN-TODOS.md` motion-consistency line on completion.
