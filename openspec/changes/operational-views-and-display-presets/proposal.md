## Why

myK9Show already has useful filters and view modes, but they are easy to lose, inconsistent between management surfaces, and not yet packaged around the secretary’s recurring work. Linear’s durable filtered views suggest a focused improvement: let a secretary return to “Needs check-in,” “Unpaid,” “Missing information,” or “Today’s classes” without rebuilding the view every time.

This supports fall 2026 launch readiness by reducing repeated setup during high-stress show preparation and show-day work. It strengthens existing Entry Management, Class Management, and Show Workbench surfaces rather than adding another dashboard. It does not duplicate a page: the existing management surface remains the owner of the work, while a view preset only remembers how that surface is filtered and displayed.

## What Changes

- Define a typed operational-view contract for filters, scope, grouping, visible columns, and display density.
- Add curated secretary/steward presets to existing management surfaces, beginning with Entries and Classes.
- Keep supported view state in normalized URL parameters so filtered views can be refreshed, bookmarked, and shared within the same show scope.
- Add a small personal “save this view” capability for supported filter/display combinations, stored locally until a cross-device/shared-view requirement is separately designed.
- Preserve the current surface owner and selection semantics; changing a view clears active row selection before another bulk action can run.
- Keep view state non-blocking and usable from already-loaded/offline data.

### Non-goals

- No new reporting dashboard, command center, or duplicate Entry/Class Management page.
- No arbitrary SQL-like filter builder in the first release.
- No cross-user shared-view database model or new schema.
- No change to entry/class status semantics, mutation paths, or offline replication.

## Capabilities

### New Capabilities

- `operational-views`: Curated and personal view presets that preserve supported filters and display choices inside existing management surfaces.

### Modified Capabilities

None. Existing filter classifiers and management-page requirements remain authoritative.

## Impact

- Affects `useEntryManagementFilters`, Entry Management URL normalization, Class Management filters, and the existing Show Workbench navigation surface.
- Adds shared TypeScript view-state types, preset definitions, URL serialization/normalization, and local preference storage.
- Requires focused tests for URL round trips, invalid parameters, preset scope, selection clearing, permissions, and offline/cached rendering.
- Tracked separately from `MYK9-47`; this change consumes the action/selection contracts but does not expand the bulk-action implementation scope.
