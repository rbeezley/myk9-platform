# interaction-state-components Specification

## ADDED Requirements

### Requirement: Shared primitives own the five interaction states

The system SHALL express selected, disabled, loading, error, and focus through the shared `packages/ui` primitives rather than per-caller styling. `Button` SHALL accept a `loading` prop; `Card` SHALL accept `selected` and `interactive` props. Components SHALL NOT hand-roll a state treatment that a shared primitive already exposes.

#### Scenario: Button renders a pending action

- **WHEN** a `Button` receives `loading={true}`
- **THEN** it renders a spinner and is disabled
- **AND** its accessible name still resolves, and it exposes `aria-busy="true"`

#### Scenario: Loading is opt-in, never implicit

- **WHEN** a `Button` is not passed `loading`
- **THEN** it renders no spinner and no pending affordance
- **AND** a caller that deliberately shows no pending indicator is not required to opt out of one

#### Scenario: Card expresses selection

- **WHEN** a `Card` receives `selected={true}`
- **THEN** its selection ring renders from the `--ring` token
- **AND** the selected state is conveyed by more than color alone

#### Scenario: No hand-rolled bypass of an existing state hook

- **WHEN** the repo is grepped after this change
- **THEN** no `apps/myk9show/src` file pairs `disabled={...pending...}` with a locally rendered `animate-spin` inside a `Button`
- **AND** call sites that previously did so pass `loading` instead

#### Scenario: Pending state reaches callers through the default path

- **WHEN** a dialog renders its actions through `DialogFooterButtons` or `BaseEntityDialog`
- **THEN** its pending state routes through the shared `Button` `loading` prop without the caller opting in
- **AND** a caller that already passes a pending flag to those components gets the indicator without changing its own code

#### Scenario: A declared prop is never silently dropped

- **WHEN** a shared dialog component declares a prop in its props interface
- **THEN** that prop changes behavior when passed
- **AND** `BaseEntityDialog` honors `submitDisabled` and `maxWidth` rather than accepting and discarding them

### Requirement: One canonical focus ring

The system SHALL express focus with exactly one spelling: `ring-2 ring-ring ring-offset-2`. Focus SHALL derive its color from the `--ring` token. Components SHALL NOT introduce alternate ring widths, opacities, offsets, or raw palette ring colors.

#### Scenario: Focus ring is uniform across primitives

- **WHEN** any shared primitive receives keyboard focus
- **THEN** it renders `ring-2 ring-ring ring-offset-2`
- **AND** `Button`'s previous `ring-primary/30 ring-offset-1` no longer appears in the codebase

#### Scenario: Raw palette ring colors are gone

- **WHEN** the repo is grepped for `ring-blue-`, `ring-primary/`, `ring-offset-1`, `ring-offset-4`, and `ring-offset-0` in `apps/myk9show/src`
- **THEN** no state-conveying match remains outside a documented `// INTENT:` exception

#### Scenario: Focus is visible on touch

- **WHEN** an interactive element is reached without a pointer
- **THEN** its focus treatment is visible without hover
- **AND** no interaction depends on hover to reveal state

### Requirement: Semantic tokens back every interaction state

The system SHALL define selected and disabled state values as semantic tokens in `apps/myk9show/src/index.css` alongside the existing token layer, and SHALL specify the elevation tokens `--shadow-card`, `--shadow-ring`, and `--shadow-card-hover` that exist today without a contract. Interaction-state tokens SHALL be verified by `apps/myk9show/src/styles/__tests__/semantic-token-contrast.test.ts`. A parallel token system SHALL NOT be introduced.

#### Scenario: New state tokens enter the contrast matrix

- **WHEN** a selected or disabled state token is added
- **THEN** `semantic-token-contrast.test.ts` covers it in both light and dark themes
- **AND** it meets the thresholds `contrast-token-system` already sets

#### Scenario: Elevation is specified

- **WHEN** a surface conveys elevation
- **THEN** it uses `--shadow-card`, `--shadow-ring`, or `--shadow-card-hover`
- **AND** no component defines an ad hoc box-shadow to convey the same distinction

#### Scenario: Error color routes through the token

- **WHEN** an element conveys an error or destructive state
- **THEN** it uses `destructive` tokens rather than a raw `red-NNN` palette class

### Requirement: A destructive dialog action cannot be submitted twice

The system SHALL prevent a destructive dialog action from being dispatched more than once per confirmation. This guard SHALL live in the shared confirm primitive (`AlertDialogAction`), not in each caller, so every call site inherits it and a new dialog cannot forget it. Independently, a dialog action that triggers a mutation SHOULD show pending feedback (a separate concern satisfied by the `Button` `loading` prop where the dialog exposes a pending flag). A disabled dialog action SHALL have a rationale the user can determine without guessing.

#### Scenario: Destructive confirm is pressed twice

- **WHEN** the confirm button of a destructive dialog is pressed and pressed again before the mutation settles
- **THEN** the mutation is dispatched exactly once
- **AND** the button is disabled and shows pending feedback after the first press

#### Scenario: Delete dialogs are guarded

- **WHEN** any dialog whose confirm action is an `AlertDialogAction` — including `DeletePersonDialog`, `DeleteClassDialog`, `DeleteEntryDialog`, `ClassEntriesTable/components/DeleteDialog`, and `TrialManagementDialogs` — confirms a destructive action, and the action is pressed twice before the dialog closes
- **THEN** the underlying handler is invoked exactly once
- **AND** the guard is inherited from `AlertDialogAction`, not re-implemented in the dialog
- **AND** reopening the dialog resets the guard so a later, separate confirmation still works

#### Scenario: Post-action feedback is visible

- **WHEN** a dialog action completes
- **THEN** the outcome is visible to the user without requiring them to re-open the dialog to infer it

#### Scenario: Disabled action states its reason

- **WHEN** a dialog action is disabled for a reason other than a pending mutation
- **THEN** the reason is available to the user through visible copy or an accessible description

#### Scenario: Destructive styling is declared, not inferred from copy

- **WHEN** a dialog action is destructive
- **THEN** it renders the destructive variant because the caller declared it
- **AND** the variant is not inferred by string-matching the action label, so "Remove" and "Discard" are styled as destructive when they are destructive

### Requirement: One loading vocabulary

The system SHALL NOT retain competing loading modules that express the same treatment. Two distinct files SHALL NOT share the same component name. Dead loading primitives SHALL be removed rather than left in the tree.

#### Scenario: Duplicate skeleton modules are resolved

- **WHEN** the repo is grepped after this change
- **THEN** `components/base/SkeletonLoaders.tsx` and `components/common/SkeletonLoaders.tsx` no longer both exist under the same exported names
- **AND** every former caller resolves to a single skeleton module

#### Scenario: Dead loading primitives are removed

- **WHEN** a loading module has no importer after call sites migrate to `Button` `loading` or the surviving skeleton module
- **THEN** it is deleted
- **AND** no source file imports a deleted name

### Requirement: The shadow token layer is removed

The system SHALL have exactly one token layer. `apps/myk9show/docs/style-guides/design-tokens.json` and `apps/myk9show/src/utils/designTokens.ts` SHALL be removed and their consumers migrated to the CSS custom properties that `semantic-token-contrast.test.ts` verifies.

#### Scenario: Shadow tokens are gone

- **WHEN** the repo is grepped after this change
- **THEN** `utils/designTokens.ts` and `docs/style-guides/design-tokens.json` do not exist
- **AND** `components/base/FormDialog.tsx`, `components/base/EntityCard.tsx`, `components/base/ValidatedForm.tsx`, `components/base/SkeletonLoaders.tsx`, `components/common/EntityCardContainer.tsx`, `components/common/Breadcrumb.tsx`, `components/layout/AppHeader.tsx`, and `components/layout/SimpleHeader.tsx` no longer import them

#### Scenario: No second source of state values

- **WHEN** a state value (focus ring, disabled, error color) is needed
- **THEN** it resolves through the CSS custom property layer
- **AND** no untested JSON or TypeScript mirror of those values exists

### Requirement: Consolidation preserves documented intent

The system SHALL preserve interaction-state behavior marked `// INTENT:` in `apps/myk9show/src`. Consolidation SHALL NOT normalize a state treatment whose divergence is documented as deliberate, and SHALL NOT introduce a pending or loading indicator on a surface where its absence is deliberate per `docs/INTENT.md`.

#### Scenario: Intent-marked state code is untouched

- **WHEN** consolidation reaches `ShowMapStructureTable.tsx:206` (roving tab stop), `ShowMapStructureTable.tsx:133` (modal reorder mode), `ShowMapSortableEntryRow.tsx:95` (`touchAction: 'none'`), `ShowMapRunOrderMenu.tsx:44` (disabled at 0/1 entries), `ShowDeskAdaptiveHeader.tsx:377` (chip contrast/touch targets), or `ReplicationSyncProvider.tsx:589,660` (persistent failure toasts)
- **THEN** the documented behavior is preserved
- **AND** the `// INTENT:` comment remains

#### Scenario: Silent surfaces stay silent

- **WHEN** a judge scores consecutive entries, or background sync runs
- **THEN** no loading spinner, progress bar, or syncing modal is introduced
- **AND** the surface's existing quiet behavior is unchanged

#### Scenario: No new confirmation surface

- **WHEN** this change touches dialogs
- **THEN** no new confirmation dialog is added to a routine action
- **AND** the count of confirmation dialogs does not increase

#### Scenario: Removing indirection does not change pixels

- **WHEN** `enhanced-dialog.tsx`'s classes are folded into `dialog.tsx` and the wrapper is removed
- **THEN** dialogs still render `bg-card`, `text-foreground`, and `border-border` exactly as they did through the barrel alias
- **AND** no dialog background changes from `--card` to `--background` in either theme
