# motion-language Specification (delta)

## MODIFIED Requirements

### Requirement: Motion category rules

The system SHALL follow one learnable rule per motion category so users learn once what motion means:

- **Appear** = fade + 4–8px rise over `duration-enter`/`ease-enter` (dialogs, sheets, toasts).
- **State changed in place** = a `duration-state` color/background crossfade — never a bounce.
- **Moved** = an animated layout shift over `duration-layout`; rows never teleport.
- **Loading** = an in-place pending indicator on the control that initiated the wait, shown only for a user-initiated wait that blocks the user's next step. Rotation is CSS-only and suppressed under reduced motion. Waits the user did not initiate — background sync, replication, between-entry transitions — stay silent and SHALL NOT gain an indicator.
- **Celebration** (`confetti-fall`) = exhibitor-earned moments only (result reveal, title); never secretary/admin/judge surfaces.

#### Scenario: Entry status chip changes state

- **WHEN** an entry's status changes and its chip re-renders with a new color
- **THEN** the chip crossfades its background/text color over `duration-state` (200ms) via `transition-colors`
- **AND** it does not snap instantly and does not bounce

#### Scenario: A non-virtualized list reorders

- **WHEN** a non-virtualized myK9Show list reorders (e.g. placement recalculation)
- **THEN** affected rows animate to their new positions (Framer `layout`) rather than teleporting

#### Scenario: A user-initiated action blocks the next step

- **WHEN** the user submits a dialog action or a form and must wait for it to settle before continuing
- **THEN** the control that initiated the wait shows an in-place pending indicator
- **AND** the indicator is rendered by the shared `Button` `loading` prop rather than a locally composed spinner

#### Scenario: Background work does not announce itself

- **WHEN** replication syncs, a background query refetches, or a judge advances between entries
- **THEN** no spinner, progress bar, or syncing modal appears
- **AND** the surface's existing quiet behavior is preserved

#### Scenario: Reduced motion suppresses spinner rotation

- **WHEN** `prefers-reduced-motion: reduce` is active and a pending indicator is shown
- **THEN** the indicator does not rotate
- **AND** the pending state is still conveyed, and the control is still non-actionable

### Requirement: Motion consolidation removes duplicate and dead primitives

The system SHALL expose a single set of Framer entry-point primitives (`components/layout/FadeIn`, `components/layout/StaggeredGrid`) and SHALL NOT retain duplicate or unused motion modules. Dead motion code SHALL be removed rather than left in the tree. This extends to loading motion: competing loading and skeleton modules SHALL NOT coexist, and two distinct files SHALL NOT share the same component name.

#### Scenario: No duplicate FadeIn or dead optimistic suite

- **WHEN** the repo is grepped after this change
- **THEN** `components/common/AnimatedComponents.tsx`, `components/optimistic/`, `components/scoring/OptimisticScoreEntry.tsx`, `components/ui/DelightfulToast.tsx`, and the orphaned optimistic support modules (`hooks/useOptimisticUI.ts`, `utils/optimisticUtils.ts`, `types/optimistic-types.ts`, `services/optimistic/OptimisticUIService.ts`) no longer exist
- **AND** no source file imports any of the deleted names

#### Scenario: Live offline-scoring engine is preserved

- **WHEN** the deletions are applied
- **THEN** `hooks/useOptimisticScoring.ts` and `hooks/useOptimisticUpdate.ts` remain
- **AND** `ScoresheetPage`, `useAtShowScoresheet`, and the scoring flows that consume them still typecheck and pass their tests

#### Scenario: No duplicate loading vocabulary

- **WHEN** the repo is grepped after this change
- **THEN** `components/base/SkeletonLoaders.tsx` and `components/common/SkeletonLoaders.tsx` no longer both exist under the same exported names
- **AND** loading modules left without an importer after call sites migrate are deleted rather than retained
