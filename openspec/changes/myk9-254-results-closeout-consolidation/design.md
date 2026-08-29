## Context

See `proposal.md` for motivation. `ResultsControlPage` currently owns all three visibility-settings queries and renders `PresetSelector`, `ShowCheckinToggle`, and one `OverrideTree` that couples visibility selectors, self check-in switches, and release-selection checkboxes. `ShowWorkbenchShowDeskPage` already has a wide Tools drawer and uses the same show/trial/class scope needed by the check-in cascade. Submit Results and Show Desk closeout already provide the correct sequencing links.

The settings hooks use the established React Query/PostgREST path. This change does not introduce another storage or mutation path. The relocated tool must isolate loading/error state so a settings outage cannot block Show Desk's replicated schedule and entry workflows.

## Goals / Non-Goals

**Goals:**

- Let the override hierarchy render exactly one concern at a time while retaining one shared implementation.
- Make Show Desk the owner of self check-in configuration and Results the owner of visibility/release.
- Preserve calm, touch-safe secretary interactions and truthful read failures.

**Non-Goals:**

- Reworking the settings tables or adding them to replication in this change.
- Merging Results with Submit Results.
- Changing cascade, release, submission, or authorization semantics.

## Decisions

### Render the shared override tree by facet

Add an explicit `facet` mode to the existing override tree. Visibility mode renders preset selectors, visibility status/reset, and selection checkboxes for result operations. Check-in mode renders switches plus check-in status/reset and selection checkboxes for bulk self check-in operations.

This preserves one trial/class hierarchy and one set of mutation handlers. Separate visibility and check-in trees were rejected because they would recreate the duplication that the current unified tree removed. Rendering both facets in both places was rejected because it would duplicate product ownership.

Split the current page-fixed bulk bar by responsibility: Results retains preset/release/unrelease actions, while the Self check-in tool gets an inline selected-class bar for enable/disable. A fixed bar inside the Tools drawer was rejected because it would compete with Show Desk chrome and obscure content.

### Wrap self check-in data and presentation in a Show Desk tool component

Create a focused Self check-in tool component that owns the three existing settings queries, truthful loading/error/retry presentation, the show-level toggle, and the check-in-mode override tree. `ShowWorkbenchShowDeskPage` supplies only show/trial/class identity data and inserts the component into the existing Tools list.

Keeping query state inside the tool prevents the parent Show Desk page from becoming unavailable when settings fail. Reusing the Results page's state through cross-page context was rejected because it couples unrelated routes and provides no durable offline benefit.

### Keep routes stable and change user-facing ownership labels

Retain `/results-control` and `/submit-results` for compatibility. Rename only navigation, headings, closeout copy, help metadata, and tests from “Results & Check-In” to “Results”. The Results route continues linking forward to Submit Results.

Route merging was rejected because MYK9-254 records that the two closeout stages are sequential rather than duplicates, and the prior correctness repair already communicates their dependency.

## Risks / Trade-offs

- [The shared override tree and bulk actions gain conditional rendering complexity] → Use a narrow discriminated prop contract and facet-specific tests that prove forbidden controls are absent in each mode.
- [Settings remain online-oriented while the controls move into a show-day surface] → Keep this change on the established hooks, isolate failures to the tool, preserve cached data when available, and do not block replicated Show Desk workflows. Track any replication migration separately because it changes persistence architecture.
- [Users familiar with the old page may look for check-in under Results] → The canonical management label becomes Results, while Self check-in is named directly in Show Desk Tools and its summary copy.
- [Large shows can make the override hierarchy expensive] → Avoid performance refactors in this change; preserve the existing component and existing memoization behavior, with optimization left to a focused follow-up.

## Migration Plan

1. Ship the component refactor and label changes together so no navigation state points to mixed content.
2. Verify Results and Show Desk Tools at mobile and desktop widths with focused unit tests and a browser re-walk.
3. Roll back the commit if the relocated hierarchy blocks Show Desk; route paths and stored settings remain unchanged, so no data rollback is required.
