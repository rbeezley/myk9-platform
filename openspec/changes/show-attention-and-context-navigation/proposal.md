## Why

Linear makes work visible through focused views, contextual links, and clear relationships between objects. myK9Show needs the same clarity for show operations: when something needs attention, the user should see why and land on the existing surface that fixes it; when viewing a class, entry, dog, or person, the user should be able to move through its show context without hunting through navigation.

This supports fall 2026 launch readiness by reducing secretary uncertainty and shortening the path from “something needs attention” to “it is fixed.” It builds on the existing class readiness and entry-attention work rather than creating a new inbox or command center.

This does not duplicate existing pages. Workbench, Class Details, Entry Management, Show Desk, and detail surfaces remain owners of their concerns. The change adds actionable routing and compact related links between those owners.

## What Changes

- Add an actionable “Needs attention” summary to the existing show orientation/workbench surface, using canonical entry/class attention classifiers.
- Route every attention signal to the existing owner surface with show, trial, class, and filter context preserved.
- Add compact related-context links/breadcrumbs to existing detail surfaces: Show → Trial → Class → Entry → Dog → Person where the relationship is known and useful.
- Preserve permissions, offline/cached rendering, and honest partial states.
- Add tests proving attention counts agree with destination results and related links do not leak across show scope.

### Non-goals

- No new inbox, queue, graph page, command center, or duplicate management list.
- No second attention classifier or manually maintained health grade.
- No generic activity stream, comments system, or relationship editor.
- No new database relationship model; use existing foreign keys, loaded projections, and route helpers.

## Capabilities

### New Capabilities

- `attention-and-context-navigation`: Actionable attention summaries and compact related links across existing show-management surfaces.

### Modified Capabilities

None. The existing `entry-attention-routing` and `class-operational-readiness` contracts remain authoritative and are consumed rather than redefined.

## Impact

- Extends existing Show Workbench/readiness presentation, Class Details, Entry Management, trial/class detail, dog, and people context links.
- Reuses `features/entry-operations/attentionClassification`, Class Details readiness helpers, existing route builders, and replication-backed/read-only query data.
- Requires focused classifier/count-to-destination tests, scope/permission tests, and secretary/steward browser verification.
- Should be tracked as a follow-up to the existing Class & Entry Operational Clarity project, not folded into `MYK9-47`.
