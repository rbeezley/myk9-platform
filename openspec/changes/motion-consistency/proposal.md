## Why

Motion in myK9Show is inconsistent and partly broken: a ringside save confirmation (`SuccessToast`) renders as an unstyled bare `<div>` because its `.success-toast` class has no rule anywhere in the repo; a large "optimistic UI" animation suite (`components/optimistic/*` + its support hooks/services) is dead code imported by nothing live; there are two competing `FadeIn` primitives; and durations/easings are ad hoc per component so users never learn a consistent visual language. For a fall-2026 launch that lives or dies on show-day trust, a save you can't see acknowledged is a reliability defect, and inconsistent motion raises cognitive load exactly when a secretary is under pressure.

## What Changes

- **Delete the dead optimistic-UI motion cluster** (self-referential, zero live importers — verified by grep): `components/optimistic/` (all files), `components/scoring/OptimisticScoreEntry.tsx`, `hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`, and `components/ui/DelightfulToast.tsx`. **Do NOT touch** the live offline-scoring engine `hooks/useOptimisticScoring.ts` + `hooks/useOptimisticUpdate.ts` (used by `ScoresheetPage`/`useAtShowScoresheet`) — a separately-named system.
- **Delete `components/common/AnimatedComponents.tsx` wholesale** (zero importers; its would-be consumers already import from `layout/FadeIn`/`layout/StaggeredGrid`). `layout/FadeIn.tsx` + `layout/StaggeredGrid.tsx` remain the only Framer entry-point primitives.
- **Remove the two `useReducedMotion` re-export shims** (`features/heritage/hooks/`, `features/magazine/hooks/`) and re-point callers at the canonical `features/_shared/hooks/useReducedMotion`.
- **Add a motion spec as design tokens** in `tailwind.config.js`: durations (`micro` 150ms, `state` 200ms, `enter` 250ms, `layout` 350ms) and easings (`ease-enter` `cubic-bezier(0.16,1,0.3,1)`, `ease-exit` `ease-in`). The plan doc is the human-readable source of truth, linked from `DESIGN.md`.
- **Fix the ringside `SuccessToast` bug** with CSS-only keyframes (fixed bottom-center, fade + rise over 250ms, auto-dismiss fade-out), `motion-reduce`-gated, with the auto-dismiss timer lifecycle owned by parent state (clears on unmount, resets on rapid consecutive saves). **No framer-motion in `packages/ringside`.**
- **Add state-change + reorder motion**: entry status chips get a 200ms `transition-colors` crossfade; non-virtualized myK9Show list reorders get Framer `layout`; virtualized lists (react-window) fall back to the in-place crossfade to avoid FLIP-on-recycled-node corruption.
- **Non-goals** (below) are enforced to avoid adding surface area.

## Capabilities

### New Capabilities
- `motion-language`: The app's shared motion contract — the canonical duration/easing tokens, the rules for how each motion category (appear, in-place state change, layout move, loading, celebration) must behave, reduced-motion gating, and the shared-package constraint (CSS-only motion in `packages/ringside`/`scoring-ui`/`ui`; no new animation libraries). Includes the ringside save-acknowledgment (`SuccessToast`) requirement.

### Modified Capabilities
<!-- None — no existing spec's requirements change; status-display chips gain a motion requirement but that is authored as the new motion-language capability's status-change rule to keep one motion contract in one place. -->

## Impact

- **Deletions (myK9Show app):** `components/optimistic/`, `components/scoring/OptimisticScoreEntry.tsx`, `hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`, `components/ui/DelightfulToast.tsx`, `components/common/AnimatedComponents.tsx`, and the two `useReducedMotion` shims. Net line reduction; no runtime behavior lost (all orphaned).
- **Config:** `tailwind.config.js` gains `transitionDuration`/`transitionTimingFunction` tokens (additive, non-breaking). `DESIGN.md` gains a motion-spec link.
- **Shared package:** `packages/ringside/src/pages/EntryList/components/SuccessToast.tsx` + a co-located/shipped stylesheet; ringside is already inside the host app's Tailwind `content` globs (verified), but CSS delivery is verified in-browser per the #432 footgun. Parent state in `EntryListPage`/`CombinedEntryListDialogs` owns the dismiss timer.
- **User-visible motion:** status chips crossfade instead of snapping; reordered rows animate instead of teleporting (non-virtualized only). Changes user-visible behavior → Codex review ON per project convention.
- **[ADDED] Offline-first impact: none — and one explicit preservation.** This change touches no `@myk9/replication` table, query, or mutation flow. The single offline-sensitive adjacency is the *live* offline-first scoring engine (`hooks/useOptimisticScoring.ts` + `hooks/useOptimisticUpdate.ts`), which is deliberately **preserved untouched** (design D2); only the *separately-named, dead* optimistic-UI suite is deleted. A spec scenario asserts the live engine and its consumers still pass, so show-day offline scoring is unaffected.
- **Duplication question:** This does not add a surface — it *consolidates* scattered/duplicate motion code (removes a second `FadeIn`, deletes an entire dead suite, collapses shims) and fixes one live bug. A link to an existing surface is not applicable because the work is deletion + a shared token contract, not a new page. This tightens the single coherent workflow rather than fragmenting it.
- **Explicitly out of scope:** Phase 4 of the source plan (the 163-file spinner→skeleton loading-state sweep) — it ships incrementally as separate PRs and is not part of this change.
