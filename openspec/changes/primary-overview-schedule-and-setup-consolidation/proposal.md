## Why

The current Setup tab is a peer-level collection of judges, venue, and schedule information that is already repeated on the show Overview and, operationally, on Show Desk. This makes the secretary choose between multiple versions of the same show facts while exhibitors lack a concise schedule on the primary show page. Consolidating the projections supports fall 2026 launch readiness by reducing navigation and preserving one clear place for each job.

## What Changes

- Make the show Overview the primary audience-facing landing surface for both exhibitors and show managers.
- Add a compact, read-only Overview schedule grouped by trial date and trial number, with the next/upcoming classes visible at a glance and a link to the existing complete Classes view.
- Keep Show Desk as the secretary’s operational schedule: stable class order, status, attention, scoring, printing, and closeout actions remain there.
- Move schedule editing access to the Overview schedule surface for authorized managers without creating a second schedule editor.
- Rehome judges, officials, and venue/map information into compact Overview sections; preserve the existing venue directions and judge data.
- Remove Setup from the visible top-level management navigation and retain `/shows/:showId/setup` as a compatibility redirect until all deep links are migrated.
- Keep `/at-show` unchanged as the show-day ringside surface.

### Non-goals

- Do not create a new Schedule page, dashboard, or duplicate class/entry workflow.
- Do not change Show Desk’s class-level operational behavior or its filters.
- Do not change exhibitor authorization, ringside access, or replication behavior.
- Do not remove the underlying judges, venue, officials, or schedule editing capabilities.

## Capabilities

### New Capabilities

- `primary-show-overview-schedule`: Concise, trial-grouped schedule and compact show details on the primary Overview surface for exhibitors and managers.

### Modified Capabilities

- `secretary-show-workbench-guidance`: Setup is no longer a visible peer section; its retained capabilities and schedule-editing destinations must remain discoverable from Overview and existing deep links.

## Impact

- Affected UI: `ShowOverviewTab`, show management navigation, Setup routing, schedule overview components, and Overview-focused tests.
- Affected routing: `/shows/:showId/setup` becomes a compatibility redirect or non-primary route; existing Show Desk and Classes routes remain canonical owner surfaces.
- Affected copy and accessibility labels: schedule grouping, trial/date labels, and manager edit affordances must use plain show terminology and meet existing touch/contrast requirements.
- No database migration is expected. Existing replicated schedule, trial, class, judge, and venue data remain the source of truth.
