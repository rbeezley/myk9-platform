## Why

Fall 2026 launch readiness depends on the secretary being able to keep a show moving when the venue has poor or no connectivity. The launch-blocking scenario is a secretary at the show desk who must accept a day-of-show entry for a dog that is not already in the system. Today the entry row can use replicated local creation, but the exhibitor and dog creation path still relies on online people/dog writes before the entry can exist. That makes a normal show-day situation feel like a failure at exactly the wrong moment.

This change makes the existing secretary late-entry workflow locally durable: create the exhibitor, create the dog, preserve registration details, select classes, record desk payment, and save day-of entries on the current device. Sync can finish later.

This does not duplicate an existing page. The existing surface is the show desk / secretary late-entry registration wizard. A link is not enough because the linked workflow currently depends on online writes; the missing capability is lower-level offline persistence and dependency-ordered replay behind the same surface.

## What Changes

- Add a narrow show-desk offline person queue for locally-created exhibitors, without introducing broad people-directory replication.
- Add dependency-aware offline dog creation so dog rows can be queued behind local person creation and entries can depend on queued dog creation.
- Persist dog registration details as local pending intents so the show desk does not lose registry data captured offline.
- Route secretary late-entry, non-card submission through replicated day-of entry creation instead of the online registration submission path.
- Keep normal exhibitor registration, online create flows, and card checkout behavior unchanged outside secretary late-entry mode.
- Use calm offline language and existing surfaces so the secretary sees local work as saved, not broken.

Non-goals:

- No new standalone offline-entry page.
- No second registration wizard or duplicate show-desk workflow.
- No broad offline people directory or duplicate-person merge tooling.
- No authoritative offline registry duplicate detection.
- No offline card checkout.
- No armband collision reconciliation across multiple offline devices in this slice.

## Capabilities

### New Capabilities

- `offline-show-desk-late-entry`

### Modified Capabilities

None.

## Impact

- Affects myK9Show secretary late-entry flow, quick-create exhibitor/dog components, app replication services, and registration submission routing.
- Adds focused IndexedDB/local queue persistence for show-desk-created people and pending dog registrations.
- Adds tests for offline queue dependency order, local-first create paths, offline late-entry submission, and regression behavior for existing online paths.
- Updates launch tracking when implementation is complete.
