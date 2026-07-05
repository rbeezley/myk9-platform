## Context

Source plan: `docs/plan-motion-consistency.md` (audit dated 2026-07-03). This change implements **Phases 1, 2, 3, and 5** of that plan. Phase 4 (spinner→skeleton loading-state sweep across ~163 files) is explicitly excluded and ships separately.

Pre-implementation grep audit (2026-07-04, this worktree) **corrected two of the plan's stated findings** — the design below reflects the verified tree, not the plan's prose:

1. **Two distinct "optimistic" systems exist.** The dead cluster is self-referential and larger than the plan listed; the live offline-scoring engine is a differently-named, actively-used set. Verified importer graph:
   - **DEAD (delete):** `components/optimistic/*` (7 files) → `components/scoring/OptimisticScoreEntry.tsx` (only consumer of the suite) → `hooks/useOptimisticUI.ts` (only outside-consumer is `optimistic/index.ts`) → `utils/optimisticUtils.ts` (only consumers are the optimistic cluster) → `types/optimistic-types.ts` (consumers all dead) → `services/optimistic/OptimisticUIService.ts` (consumers all dead). `components/ui/DelightfulToast.tsx` has zero importers.
   - **LIVE (keep, do NOT delete):** `hooks/useOptimisticScoring.ts` (consumed by `pages/scoring/ScoresheetPage.tsx`, `features/at-show/useAtShowScoresheet.ts`, `pages/scoring/types.ts`) and its dependency `hooks/useOptimisticUpdate.ts`. Names are confusingly similar — deletion must be import-graph-driven, never name-driven.
2. **`components/common/AnimatedComponents.tsx` has zero importers.** The plan's "merge into `layout/` and re-point 3 consumers" is unnecessary: `DashboardGreeting`, `ShowCardGrid`, and `JudgeDashboard` already import from `layout/FadeIn`/`layout/StaggeredGrid` directly. So this is a clean wholesale delete, not a merge.

Two other verified facts:
- **Ringside is already in the host Tailwind `content` globs** (`apps/myk9show/tailwind.config.js` line 13: `../../packages/ringside/src/**/*.{js,ts,jsx,tsx}`), so Tailwind utility classes authored in ringside source *do* generate. The #432 footgun is therefore not currently triggered — but the acceptance check remains the rendered toast in-browser, not the source diff.
- **`SuccessToast` has no timer of its own today.** It is a pure `isVisible`-prop component; the auto-dismiss (if any) is owned by the parent (`EntryListPage` / `CombinedEntryListDialogs`). The timer-lifecycle work lives in that parent state.

## Goals / Non-Goals

**Goals:**
- One learnable motion language: canonical duration/easing tokens, referenced everywhere.
- Fix the live ringside save-confirmation bug (unstyled `.success-toast`).
- Delete dead/duplicate motion code without touching the live offline-scoring engine.
- Status-change crossfade + reorder motion, with a react-window virtualization guard.
- Every animation gates on reduced motion.

**Non-Goals:**
- Phase 4 spinner→skeleton sweep (separate, incremental).
- No new animation libraries; no framer-motion in `packages/ringside`/`scoring-ui`/`ui`.
- No parallax, scroll-jacking, hover-scaling cards, ambient loops, or stagger beyond ~6 items.
- Confetti stays exhibitor-only (unchanged; not re-scoped here).
- No new page/dialog/sheet surface — this is deletion + a token contract + one bug fix.

## Decisions

**D1 — Delete by import graph, in dependency order.** Remove leaf consumers first (`OptimisticScoreEntry.tsx`, `DelightfulToast.tsx`, `AnimatedComponents.tsx`), then the now-orphaned support modules (`components/optimistic/`, `hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`). After each removal, re-grep to confirm zero remaining importers before proceeding. `pnpm typecheck` is the backstop — a missed live import fails the build. Follow `feedback_grep_docs_before_deletion` (grep `--include="*.md"` for each deleted name) and `feedback_audit_route_liveness`.

**D2 — Keep the live scoring engine untouched.** `useOptimisticScoring` / `useOptimisticUpdate` are explicitly preserved. A spec scenario asserts they remain and their consumers still pass — this is the guardrail against a name-driven over-delete.

**D3 — Motion tokens as Tailwind theme extension.** Add `transitionDuration` (`micro`/`state`/`enter`/`layout`) and `transitionTimingFunction` (`ease-enter`/`ease-exit`) under `theme.extend` in `tailwind.config.js`. Additive, non-breaking. A source-text unit test pins the token names/values (`feedback_source_text_regression_tests`). `DESIGN.md` links the plan's spec table as the human-readable source of truth (docs-only edit, in-scope for the change).

**D4 — Ringside toast: plain shipped CSS, parent-owned timer.** Style `SuccessToast` via a CSS rule the package ships and the host already imports (ringside stylesheet), not a fresh Tailwind-only class — plain CSS is immune to the content-glob footgun regardless of glob state. Fixed bottom-center; fade + 4–8px rise over 250ms on enter; fade-out on leave; `@media (prefers-reduced-motion: reduce)` disables the transform/opacity animation but keeps visibility. The auto-dismiss timer is driven from the owning parent hook/state (not a fire-and-forget `setTimeout` in the component body): it clears on unmount and resets on rapid consecutive saves. Acceptance is the rendered toast in preview/`/at-show`, not the diff.

**D5 — Status-change crossfade via Tailwind, not JS.** Entry status chips add `transition-colors duration-state` so a color change animates in place. Pure CSS — no hook, no re-render cost, auto-honored by `motion-reduce` where applied.

**D6 — Reorder motion with a hard virtualization guard.** Apply Framer `layout` only to **non-virtualized** myK9Show lists. Virtualized lists (react-window: `components/common/virtual/VirtualScrollList.tsx`, `EntitySidebar.tsx`, `DogSelectionStepEnhanced.tsx`) get the 200ms in-place crossfade instead — FLIP animation on recycled DOM nodes animates between unrelated entries. Per-list verification is part of acceptance. Ringside reorder uses CSS `transition` on transform only where the existing DnD library (`SortableEntryCard`/`@dnd-kit`) already exposes it — verify before adding.

**D7 — Two reduced-motion mechanisms stay; a third is forbidden.** The `_shared` CSS hook and Framer's own `useReducedMotion` both remain canonical (by design). We only delete the two *re-export shims* and re-point their callers (`heritage/landing/sections/RosterSection.tsx`, the heritage/magazine feature `index.ts` re-exports, and `features/heritage/__tests__/useReducedMotion.test.ts`).

## Risks / Trade-offs

- **Over-delete risk (highest):** confusing names could delete the live scoring engine. Mitigation: D1 dependency-order + re-grep, D2 preservation scenario, `pnpm typecheck` backstop, full app vitest run before PR.
- **Ringside CSS delivery:** if the chosen CSS route relies on a Tailwind class that isn't generated, the toast stays unstyled. Mitigation: prefer plain shipped CSS (D4) + in-browser acceptance check, not source inspection.
- **Timer lifecycle:** naive `setTimeout` in the component would leak or truncate on rapid saves. Mitigation: parent-owned timer with clear-on-unmount + reset-on-retrigger; fake-timer test covers both.
- **Virtualized reorder corruption:** applying `layout` to a recycled list would visibly corrupt. Mitigation: D6 guard + per-list check.
- **Docs referencing deleted components:** stale `.md`/`DESIGN.md` mentions. Mitigation: grep docs before deletion.
