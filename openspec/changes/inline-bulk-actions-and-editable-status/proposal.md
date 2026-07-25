## Why

> Original request: “Could we do the same type of thing for myk9show. We could do it for entries and classes and trials and dogs and people. The other thing I like is you can click a badge tag and change it right there. Could we do something like that also? We could do that for status or check-in.”

myK9Show has several common operational changes—check-in, entry status, class status, and similar state updates—spread across row actions, buttons, and dialogs. A consistent Linear-inspired selection bar and editable status control would let secretaries and stewards make routine changes in place, reducing navigation and preserving the target feeling from `docs/INTENT.md`: “That was easy” and “I’ve got this under control.”

This supports fall 2026 launch readiness by making high-frequency show-day work faster and more legible before real users depend on the app. It also consolidates existing actions instead of adding another management destination.

This does not duplicate an existing page. Entry Management remains the owner of broad entry work, Show Desk remains the owner of show-day check-in, Class Details remains the owner of class work, and existing dog/people/trial pages remain their owners. The new pattern is a shared interaction layer inside those existing surfaces; links alone would not remove the repeated multi-step path of selecting each row or opening a dialog for a simple state change.

## What Changes

- Add a reusable selection model for supported management lists: row selection, select-all-visible, selection clearing, filtered-view scope, and a floating/anchored action bar showing the selected count.
- Reuse and standardize the existing three-dot per-row action menus for single-object actions; do not add a second single-object Actions button or new action surface.
- Add contextual bulk actions to existing Entries, Classes, Trials, Dogs, and People management surfaces, gated by role and entity state.
- Add an inline editable-state control for status and check-in badges. A badge that can change state becomes an accessible button that opens a compact popover/menu, without navigating to another page or opening a full dialog for routine changes.
- Route all persistent show-day mutations through the existing offline-first replication/mutation paths and preserve partial-success feedback for bulk operations.
- Provide clear pending, success, failure, and undo/recovery behavior without adding routine confirmation dialogs.
- Keep action definitions entity-specific and permission-aware; do not create one mixed-entity command center or a generic action menu with unrelated operations.
- Roll out first to Entries and Classes, then extend the same contracts to Trials, Dogs, and People after the shared behavior is proven.

### Non-goals

- No new universal admin page, command center, or cross-entity selection across entries/classes/trials/dogs/people.
- No replacement of Entry Management, Show Desk, Class Details, scoring, or existing detail surfaces.
- No full inline editing of arbitrary fields; this change is limited to explicitly supported state fields such as status and check-in.
- No new database status taxonomy, status history system, or bulk mutation API unless implementation evidence shows an existing path cannot safely support the interaction.
- No hover-only affordance, gesture-only interaction, or mobile pattern that depends on small targets.

## Capabilities

### New Capabilities

- `bulk-selection-actions`: Shared selection behavior and contextual bulk action bars inside existing entity management surfaces.
- `inline-state-editing`: Accessible inline editing for supported status/check-in badges with optimistic/offline-safe persistence and recovery feedback.

### Modified Capabilities

None. Existing show-day and status specifications remain the owners of the underlying state semantics and authorization rules; these new capabilities define how existing operations are exposed and grouped in the UI.

## Impact

- Affects myK9Show management-list components and their existing row/action abstractions for entries, classes, trials, dogs, and people.
- Reuses existing mutation and replication layers, including check-in and class/entry status writers; no direct PostgREST writes may be introduced for core offline-required work.
- Adds shared UI/state utilities for selection, action availability, inline state menus, bulk result aggregation, and undo/retry feedback.
- Requires focused unit/component tests plus a secretary/steward browser walk covering filtered selection, keyboard/touch use, permissions, offline behavior, and partial bulk failures.
- Requires product/tracking updates when implementation completes, with PR review and CI green before the change is archived.
