## Why

Results visibility/release and self check-in currently share one page even though they belong to different moments: check-in is show-day coordination, while results verification and release are closeout work. Separating those concerns makes the secretary workflow easier to scan and supports fall 2026 launch readiness without adding another page.

## What Changes

- Move the existing show-, trial-, class-, and selected-class bulk self check-in controls into the existing Show Desk Tools surface.
- Keep result visibility presets, release readiness, class selection, release, and unrelease controls on the existing Results route.
- Rename the “Results & Check-In” navigation label, page heading, help-directory entry, and closeout link to “Results”.
- Reuse the established settings queries and mutations; do not add a new route, drawer, dialog, or persistence path.
- Preserve Submit Results as a separate closeout step and keep Show Desk closeout as the single hub that sequences Results, Reports, and Submit Results.
- Add focused unit coverage for the relocated self check-in hierarchy and navigation labels.

Duplication answer: this change removes a mixed, duplicated concern instead of creating a new surface. A link alone is insufficient because it would continue sending a show-day self check-in task to an end-of-show Results page. The existing Show Desk Tools drawer is the canonical show-day home and can host the controls directly.

Non-goals:

- Merging Results and Submit Results into one page.
- Adding a fourth closeout entry point or a new self check-in route.
- Changing self check-in cascade semantics, result readiness rules, submission history, or failed-send logging.
- Optimizing the override tree beyond the refactor needed to render one concern at a time.

## Capabilities

### New Capabilities

- `secretary-results-checkin-workflow`: Defines ownership and navigation for self check-in, Results, and Submit Results across Show Desk and closeout.

### Modified Capabilities

- `secretary-show-workbench-guidance`: Show Desk Tools gains the existing self check-in controls as a show-day responsibility.

## Impact

- myK9Show Results Control, Show Desk Tools, shared results/check-in override components, show-management navigation, admin help metadata, and focused tests.
- No database, API, RBAC, replication, or route-path changes.
- Existing `useShowSettings`, trial/class override queries, and established mutations remain the source of truth.
