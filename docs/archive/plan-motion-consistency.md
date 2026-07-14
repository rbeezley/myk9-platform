# Motion Consistency — one motion language across myK9Show + ringside

> **Status:** Complete

**Goal:** every animation in the app communicates a state change, uses the same durations/easings, and respects `prefers-reduced-motion` — so users learn once what motion means and it never surprises them.

**Audit date:** 2026-07-03. Findings below are verified against the working tree, not assumed.

**Completion date:** 2026-07-05. Phases 1-3 and 5 shipped in [#1143](https://github.com/rbeezley/myk9-platform/pull/1143). Phase 4 shipped incrementally in [#1152](https://github.com/rbeezley/myk9-platform/pull/1152), [#1153](https://github.com/rbeezley/myk9-platform/pull/1153), [#1154](https://github.com/rbeezley/myk9-platform/pull/1154), and final sweep [#1157](https://github.com/rbeezley/myk9-platform/pull/1157). The plan is fully implemented; remaining `animate-spin` usage is limited to inline/action/progress contexts allowed by the motion spec.

---

## Audit findings

### Already solid (do not rebuild)

| Surface | State |
| --- | --- |
| shadcn primitives (`dialog`, `sheet`, `alert-dialog`, `popover`, `dropdown-menu`, `tooltip`) | All six have `animate-in`/`animate-out` enter-exit classes. Overlay motion is centralized — any component using these primitives inherits it. |
| Route transitions | `PageTransition` ([PageTransition.tsx](../apps/myk9show/src/components/common/PageTransition.tsx)) is wired into **all** route groups (public, secretary, judge, club-admin, at-show, admin) and gates on `useReducedMotion`. |
| Reduced-motion hooks | Already consolidated: `features/heritage/hooks/useReducedMotion.ts` and `features/magazine/hooks/useReducedMotion.ts` are re-export **shims** of the canonical `features/_shared/hooks/useReducedMotion.ts`. Not duplicates. |
| Tailwind keyframes | `slide-up`, `shimmer`, `confetti-fall`, `pulse-border`, `accordion-down/up` defined in [tailwind.config.js](../apps/myk9show/tailwind.config.js). |

Two reduced-motion mechanisms coexist by design: the `_shared` hook for CSS-driven premium styles, and Framer Motion's own `useReducedMotion` inside motion components (`FadeIn`, `StaggeredGrid`, `PageTransition`). Both are canonical; don't unify them — just never write a third.

### Gaps and defects

1. **Dead animation code (delete, don't fix).** The entire `components/optimistic/` suite (`SuccessConfirmation`, `UndoToast`, `RollbackNotification`, `ProgressOverlay`, `OptimisticUpdateIndicator`) is consumed only by `components/scoring/OptimisticScoreEntry.tsx`, which is itself imported nowhere. `components/ui/DelightfulToast.tsx` also has zero consumers. **`SuccessConfirmation` is NOT wired into any real scoring flow** — the answer to "is save acknowledgment built?" is no.
2. **Ringside `SuccessToast` is unstyled — a live bug.** [SuccessToast.tsx](../packages/ringside/src/pages/EntryList/components/SuccessToast.tsx) renders `<div className="success-toast">`, and **no `.success-toast` rule exists anywhere in the repo**. The "Run order updated successfully" confirmation on `EntryListPage` and `CombinedEntryListDialogs` renders as a bare unstyled div.
3. **Loading states are the biggest inconsistency.** 163 files use `animate-spin` spinners; 19 use `Skeleton`; 2 use `shimmer`. Users see three different "loading" languages depending on the page.
4. **Duplicate motion primitives.** `components/common/AnimatedComponents.tsx` exports its own `FadeIn` competing with `components/layout/FadeIn.tsx`; across `FadeIn` + `StaggeredGrid` + `AnimatedComponents` there are only **3 consuming files** total (`DashboardGreeting`, `ShowCardGrid`, `JudgeDashboard`).
5. **No motion spec.** Durations and easings are ad hoc per component; nothing documents what "our" motion is.
6. **No status-change or reorder motion.** Entry status chips swap instantly; rows teleport when run order / placements recalculate.
7. **Ringside packages are Framer-free** (`packages/ringside`, `scoring-ui`, `ui` have no framer-motion dep). Any motion added there must be CSS keyframes/transitions — do not add the dependency.

---

## Motion spec (source of truth)

Add these as Tailwind theme tokens in `tailwind.config.js` (`transitionDuration` / `transitionTimingFunction`) and reference them everywhere; never hardcode new durations.

| Token | Value | Use |
| --- | --- | --- |
| `duration-micro` | 150ms | hover, focus, pressed states |
| `duration-state` | 200ms | status-chip crossfade, toggle, chip color change |
| `duration-enter` | 250ms | dialogs, sheets, toasts entering |
| `duration-layout` | 350ms | row reorder, expand/collapse, list layout shifts |
| `ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) | anything appearing |
| `ease-exit` | `ease-in` | anything leaving |

Rules users can learn:

- **Appear = fade + 4–8px rise, `duration-enter`/`ease-enter`.** Same for every dialog, sheet, toast.
- **State changed in place = 200ms color/background crossfade.** Never a bounce.
- **Things moved = animated layout shift, `duration-layout`.** Rows never teleport.
- **Loading = skeleton with `shimmer`.** Spinners (`animate-spin`) only for inline pending states inside buttons.
- **Celebration (`confetti-fall`) only for exhibitor-earned moments** (result reveal, title). Never secretary/admin/judge surfaces.
- **Everything gates on reduced motion** — Framer components via framer's `useReducedMotion`, CSS via the `_shared` hook or a `motion-reduce:` Tailwind variant.

---

## Phases

### Phase 1 — Delete dead motion code

- Delete `components/optimistic/` (5 components + `types/optimistic-types.ts` + `utils/optimisticUtils.ts` if orphaned), `components/scoring/OptimisticScoreEntry.tsx`, `components/ui/DelightfulToast.tsx`.
- Merge `AnimatedComponents.tsx` into the `layout/` primitives: keep `layout/FadeIn.tsx` + `layout/StaggeredGrid.tsx` as the only Framer entry-point primitives; re-point the 3 consumers; delete the rest of `AnimatedComponents.tsx` exports that have no consumers.
- Follow `feedback_grep_docs_before_deletion`: grep `--include="*.md"` for each deleted name; follow `feedback_audit_route_liveness` before treating anything as dead.
- **[ADDED] Remove the `useReducedMotion` re-export shims.** `features/heritage/hooks/useReducedMotion.ts` and `features/magazine/hooks/useReducedMotion.ts` exist only for import-path stability, which pre-launch convention says we don't need. Delete both shims, re-point the callers (`heritage/landing/sections/RosterSection.tsx` and the `heritage`/`magazine` feature `index.ts` re-exports) directly at `features/_shared/hooks/useReducedMotion`, and update `features/heritage/__tests__/useReducedMotion.test.ts` to import the canonical path.
- **Tests:** existing suite green; grep proves zero remaining imports.

### Phase 2 — Motion tokens + spec doc

- Add duration/easing tokens to `tailwind.config.js` per the spec table.
- Add the spec table to `docs/` as the reference section of this plan (this file is the source of truth; link it from `DESIGN.md`).
- **Tests:** a source-text unit test pinning the token names in `tailwind.config.js` (per `feedback_source_text_regression_tests`).

### Phase 3 — Fix ringside save feedback (bug + motion)

- Style `.success-toast` (or replace the class with co-located CSS in the ringside stylesheet): fixed bottom-center, fade+rise in over 250ms, auto-dismiss fade-out. **CSS keyframes only — no framer-motion in `packages/ringside`.**
- Gate with `motion-reduce` / the media query.
- **[ADDED] CSS delivery from a shared package is the footgun that caused this bug — verify it explicitly.** Prefer plain CSS (a stylesheet the package already ships and the host imports) over Tailwind utility classes: Tailwind classes written in `packages/*` source only generate if the package path is in the host app's `content` globs (`feedback_shared_pkg_tailwind_scan`, #432). Whichever route is taken, the acceptance check is the rendered toast in the browser (preview/`/at-show`), not the source diff.
- **[ADDED] Timer lifecycle:** the auto-dismiss must clear its timeout on unmount and reset it on rapid consecutive saves (two reorders inside the dismiss window must not cut the second toast short or leak a timer). Drive dismissal from the owning hook/state, not a fire-and-forget `setTimeout` in the component body.
- Audit the scoring save path in ringside for an acknowledgment cue; if none, add a 300ms check-draw or background flash on the scored entry row using the same CSS approach.
- **Tests:** unit test that `SuccessToast` renders message + visibility toggle; fake-timer test for auto-dismiss + rapid-retrigger reset; visual check via preview. (`window.matchMedia` is already mocked in `src/test/setup.ts` for reduced-motion assertions.)

### Phase 4 — Loading-state convergence (largest, incremental)

- Policy: page/section loads use `Skeleton` (+`shimmer`); `animate-spin` allowed only inside buttons/inline pending.
- Sweep the 163 spinner files **by role surface, highest-traffic first**: secretary workbench/entries → at-show ringside host pages → exhibitor browse/entry → admin. Convert full-page/section spinners to skeletons; leave legitimate inline button spinners.
- **[ADDED] Skeletons replace the *pending* state only.** Error and empty states stay distinct — a query error must still render its error UI, never a skeleton that shimmers forever. When converting a page, confirm all three states (pending/error/empty) remain reachable and visually distinct.
- This phase can ship as several small PRs; do not block Phases 1–3 on it.
- **Tests:** per converted page, assert skeleton renders during pending query state (custom `testUtils.tsx` render).

### Phase 5 — Status-change + reorder motion

- Entry status chips: 200ms background/color transition on status change (Tailwind `transition-colors duration-state`).
- myK9Show list reorders (placement recalc, run order in app surfaces): Framer `layout` prop on rows.
- **[ADDED] Virtualization guard — check before wiring `layout`.** react-window is in use (`components/common/virtual/VirtualScrollList.tsx`, `EntitySidebar.tsx`, `DogSelectionStepEnhanced.tsx`); FLIP-based `layout` animation is incompatible with row recycling (recycled DOM nodes "animate" between unrelated entries). Apply `layout` only to non-virtualized lists; for virtualized ones, fall back to the 200ms in-place crossfade so the status change is still visible without positional animation. Per-list verification is part of this phase's acceptance.
- Ringside list reorders: CSS `transition` on transform where the DnD library exposes it (SortableEntryCard already exists — verify what `@dnd-kit`/equivalent provides before adding anything).
- **Tests:** unit tests for any extracted pure helpers; reduced-motion gating asserted where a hook decision is involved.

---

## Non-goals

- No new animation libraries; no framer-motion in shared packages.
- No parallax, scroll-jacking, hover-scaling cards, looping ambient motion.
- No stagger animations beyond ~6 items.
- Confetti stays exhibitor-only.

## Review notes

Implementation PRs here change user-visible behavior → Codex review ON per project convention. Phases are independent PRs; Phase 1 (deletions) and Phase 3 (bug fix) are the highest value-per-line.
