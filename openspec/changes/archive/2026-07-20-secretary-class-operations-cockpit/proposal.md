## Why

Show Desk has strong offline-first actions and class state, but it presents them as several equally weighted queues, recommendations, and tree controls. On show day, a secretary is coordinating multiple classes that are simultaneously preparing, running, scoring, and closing out, so the interface must make the next work for each class immediately legible without replacing the canonical management pages.

This supports fall 2026 launch readiness by improving the highest-risk secretary/show-day workflow while preserving the trusted replication, permission, mutation, and reporting paths already in production code.

## What Changes

- Re-project the existing Show Desk as a concurrent class-operations cockpit whose default view preserves schedule/workstream continuity and shows each class's durable status, progress, blockers, location context when known, and one primary next action.
- Keep cross-class exceptions prominent and route them to the existing canonical owner surface or an existing local Show Desk filter; do not duplicate Entry Management, Class Management, Reports, Results Control, or `/at-show` workflows.
- Keep one stable schedule layout with quick filters for In progress, attention, and closeout; do not add alternate Area or Stage layouts until validation proves they answer a missing question.
- Make the Class lifecycle badge an offline-safe manual control for Shows using paper scoring, while keeping physical Class completion separate from score-entry completion.
- Use sport-aware location language: scent work uses named search areas, while obedience, conformation, and agility may use numbered rings. Missing area data remains visibly unknown; judge is never mislabeled as a ring.
- Treat only durable or safely computed facts as authoritative workflow state. Printing becomes authoritative only after staff explicitly confirms a Paperwork Print; opening a report or browser print dialog does not count.
- Record offline-safe, append-only Paperwork Print history by document type and Report Scope, including actor, time, included records, correction/void state, and the relevant document snapshot for later staleness checks.
- Default every report to the Show, Trial, or Class page that invoked it. Keep Reports as the single canonical renderer and allow deliberate scope changes there.
- Deduplicate Armband Labels to one Dog/Armband per included Show day, while keeping Result Labels one-per-Entry/result.
- Preserve every canonical show-management section and exception path. Show phase may influence landing and emphasis, but never hides required work.
- Validate desktop and tablet concepts against realistic concurrent scent-work and ring-sport scenarios before applying implementation tasks.
- Non-goals: no new management page, dialog, or drawer; no replacement of canonical owner workflows; no `classes.ring_number` shortcut; no automatic print-click-as-completion state; no operational-area database or replication change until a later approved prototype proves it necessary.

## Capabilities

### New Capabilities

- `secretary-class-operations-cockpit`: Defines the class-centered operational projection, view modes, state-truth rules, sport-aware area language, orientation behavior, and scenario acceptance criteria for Show Desk.
- `paperwork-print-coordination`: Defines staff-confirmed print/reprint history, offline coordination, corrections, broader-scope coverage, document-specific staleness, and preparation reminders.
- `context-scoped-reports`: Defines Show/Trial/Class report-scope inheritance and the distinct Armband Label and Result Label inclusion rules.

### Modified Capabilities

- `secretary-show-workbench-guidance`: Extends Show Desk guidance from individual signals and next actions to a coherent concurrent-class cockpit while preserving canonical destinations and touch-width discoverability.

## Impact

- Primary future implementation area: `apps/myk9show/src/features/show-map/`, `ShowDeskPanel`, the shared Show Map workbench state, and the Show Desk page's class projection.
- Existing replication-backed class and entry reads/mutations remain authoritative and unchanged unless a separately approved operational-area model is later added.
- Paperwork Print coordination adds a small replicated entity and append-only mutation path; simultaneous confirmations remain separate records and require no conflict dialog.
- Existing Entry Management, Class Management, Reports, Results Control, Submit Results, and `/at-show` routes remain canonical owners and receive filtered deep links rather than duplicated controls.
- Focused unit tests will cover the pure cockpit projection and state-truth rules; component tests and desktop/tablet scenario walks will cover orientation, touch access, offline-safe actions, and return-context preservation.
