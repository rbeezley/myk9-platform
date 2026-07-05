## ADDED Requirements

### Requirement: Canonical motion tokens

The system SHALL define motion durations and easings once as design tokens in `tailwind.config.js` and reference them from all animated UI. New animations MUST NOT hardcode duration or easing values outside these tokens.

The tokens SHALL be:

- `duration-micro` = 150ms (hover, focus, pressed states)
- `duration-state` = 200ms (in-place status/color/toggle crossfade)
- `duration-enter` = 250ms (dialogs, sheets, toasts entering)
- `duration-layout` = 350ms (row reorder, expand/collapse, list layout shift)
- `ease-enter` = `cubic-bezier(0.16, 1, 0.3, 1)` (anything appearing)
- `ease-exit` = `ease-in` (anything leaving)

#### Scenario: Tokens exist in the Tailwind config

- **WHEN** the Tailwind theme is inspected (or a source-text test reads `tailwind.config.js`)
- **THEN** `theme.extend.transitionDuration` contains `micro` (150ms), `state` (200ms), `enter` (250ms), `layout` (350ms)
- **AND** `theme.extend.transitionTimingFunction` contains `enter` (`cubic-bezier(0.16, 1, 0.3, 1)`) and `exit` (`ease-in`), yielding the utilities `duration-micro`/`duration-state`/`duration-enter`/`duration-layout` and `ease-enter`/`ease-exit`

#### Scenario: New motion references a token, not a literal

- **WHEN** a developer adds a new animation to a myK9Show component
- **THEN** it uses a `duration-*`/`ease-*` token (Tailwind utility or theme value)
- **AND** it does not introduce a new hardcoded duration/easing literal

### Requirement: Motion category rules

The system SHALL follow one learnable rule per motion category so users learn once what motion means:

- **Appear** = fade + 4–8px rise over `duration-enter`/`ease-enter` (dialogs, sheets, toasts).
- **State changed in place** = a `duration-state` color/background crossfade — never a bounce.
- **Moved** = an animated layout shift over `duration-layout`; rows never teleport.
- **Celebration** (`confetti-fall`) = exhibitor-earned moments only (result reveal, title); never secretary/admin/judge surfaces.

#### Scenario: Entry status chip changes state

- **WHEN** an entry's status changes and its chip re-renders with a new color
- **THEN** the chip crossfades its background/text color over `duration-state` (200ms) via `transition-colors`
- **AND** it does not snap instantly and does not bounce

#### Scenario: A non-virtualized list reorders

- **WHEN** a non-virtualized myK9Show list reorders (e.g. placement recalculation)
- **THEN** affected rows animate to their new positions (Framer `layout`) rather than teleporting

### Requirement: Reduced-motion is always honored

Every animation SHALL be disabled or reduced when the user prefers reduced motion — Framer components via Framer's `useReducedMotion`, CSS via the canonical `features/_shared/hooks/useReducedMotion` hook or a `motion-reduce:` Tailwind variant. A single canonical reduced-motion hook SHALL exist for CSS-driven styles; re-export shim modules of it SHALL NOT exist.

#### Scenario: Reduced-motion preference set

- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** entering/leaving/reorder/state animations are suppressed or reduced to an instant change
- **AND** the underlying state change (content, color, position) is still fully applied

#### Scenario: No reduced-motion re-export shims remain

- **WHEN** the repo is grepped for `features/heritage/hooks/useReducedMotion` and `features/magazine/hooks/useReducedMotion`
- **THEN** neither shim file exists and all former callers import `features/_shared/hooks/useReducedMotion` directly

### Requirement: Ringside save confirmation is visible and self-dismissing

The ringside entry-list save confirmation (`SuccessToast`) SHALL render as a styled, visible toast (fixed bottom-center, fade + rise in over `duration-enter`, auto-dismiss fade-out) rather than an unstyled bare element. Its motion SHALL be delivered with CSS keyframes/transitions only — `packages/ringside` MUST NOT depend on framer-motion. The auto-dismiss timer SHALL be owned by parent state: it clears on unmount and resets on rapid consecutive saves so a second save within the dismiss window is not cut short and no timer leaks.

#### Scenario: Save confirmation shown

- **WHEN** a run-order/save action on the ringside entry list succeeds
- **THEN** a visibly styled toast appears fixed at bottom-center with a fade + rise animation (Tailwind utilities on the markup — the ringside styling idiom — using the shared `duration-enter`/`ease-enter` motion tokens)
- **AND** it is not a bare unstyled `<div>` — it carries resolvable styling (surface, position, motion), not a semantic class with no matching rule

#### Scenario: Rapid consecutive saves

- **WHEN** two saves occur within the auto-dismiss window
- **THEN** the toast stays visible for the second save (its dismiss timer resets)
- **AND** unmounting the toast clears the pending dismiss timer (no leak, no state update after unmount)

#### Scenario: Reduced motion in ringside

- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** the toast appears/disappears without the fade/rise animation but the message is still shown and still auto-dismisses

### Requirement: Motion consolidation removes duplicate and dead primitives

The system SHALL expose a single set of Framer entry-point primitives (`components/layout/FadeIn`, `components/layout/StaggeredGrid`) and SHALL NOT retain duplicate or unused motion modules. Dead motion code SHALL be removed rather than left in the tree.

#### Scenario: No duplicate FadeIn or dead optimistic suite

- **WHEN** the repo is grepped after this change
- **THEN** `components/common/AnimatedComponents.tsx`, `components/optimistic/`, `components/scoring/OptimisticScoreEntry.tsx`, `components/ui/DelightfulToast.tsx`, and the orphaned optimistic support modules (`hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`) no longer exist
- **AND** no source file imports any of the deleted names

#### Scenario: Live offline-scoring engine is preserved

- **WHEN** the deletions are applied
- **THEN** `hooks/useOptimisticScoring.ts` and `hooks/useOptimisticUpdate.ts` remain
- **AND** `ScoresheetPage`, `useAtShowScoresheet`, and the scoring flows that consume them still typecheck and pass their tests

### Requirement: Shared-package and library constraints

Motion added to shared packages (`packages/ringside`, `packages/scoring-ui`, `packages/ui`) SHALL use CSS keyframes/transitions only. The change SHALL NOT add any new animation library, and SHALL NOT add framer-motion to any shared package.

#### Scenario: No new animation dependency

- **WHEN** dependency manifests are inspected after this change
- **THEN** no new animation library is added anywhere
- **AND** `packages/ringside`, `packages/scoring-ui`, and `packages/ui` still have no framer-motion dependency
