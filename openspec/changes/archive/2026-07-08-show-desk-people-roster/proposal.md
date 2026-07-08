## Why

The Show Desk does not yet give staff a fast person-at-the-table lookup for armband numbers, entered classes, dog names, direct check-in, and messaging. Adding this supports fall 2026 launch readiness by tightening a secretary/show-day workflow without creating another page or rebuilding existing entry management.

## What Changes

- Add a `People at show` tool inside the existing Show Desk Tools drawer.
- Default the tool to an all-exhibitors roster with search by exhibitor name, dog name, and armband.
- Show an advisory presence dot for each exhibitor using the existing show presence roster when available.
- Use accordion exhibitor rows that expand in place to show class rows with armband, dog, class, ring/time, status, and eligible direct check-in actions.
- Add `Check in all eligible` for current show-day active accepted rows for the selected person.
- Add `Message` routing directly to the existing secretary conversation surface.
- Add `Manage entries` routing to the existing Entry Management surface filtered to the selected exhibitor/person.
- Add a wider drawer mode for roster-style Show Desk tools while preserving compact width for ordinary tools.
- Non-goal: do not add a new route, standalone page, separate messaging hub, or duplicate Entry Management controls for payment, scratch, move-up, refund, or broad bulk operations.

## Capabilities

### New Capabilities

- `show-desk-people-roster`: Staff can use the Show Desk Tools drawer as a person-focused exhibitor roster with presence, class/armband lookup, narrow direct check-in, and links into existing messaging and entry-management surfaces.

### Modified Capabilities

- None.

## Impact

- Affected app area: `apps/myk9show` Show Desk / show details tooling, secretary entry data, message routing, and show presence display.
- Persistent show-day check-in mutations must continue through the existing offline-first replicated check-in update path.
- The roster should reuse existing message store/thread behavior and existing Entry Management navigation rather than adding new persistence or communication systems.
- Focused tests are required for roster derivation, search/filtering, accordion behavior, check-in eligibility/actions, routing, and drawer width behavior.
