## Why

Check-in sheets and run orders can name a dog's owner even when the entry assigns a different handler. AKC forms, gazettes, and printed emergency packets must follow the same entry-level identity rule so the person on the paperwork matches the assigned handler, including while offline.

## What Changes

- Project assigned handler identity for the existing print paths, with owner fallback only when no handler is assigned.
- Apply the projection to printed check-in sheets, run orders, AKC forms, gazettes, and scheduled emergency packets.
- Test real entry shapes, deferred report hydration, and an assigned handler who differs from the owner, including automated packet output.

## Non-Goals

No new report, page, handler assignment flow, or print layout. Interactive Secretary Run Sheet behavior and the Show Desk people roster are explicitly out of scope and remain follow-up work; this change corrects existing printed artifacts only.

## Capability

`show-day-print-identity`: operational printouts and scheduled packets show the assigned entry handler and use the owner only for an unassigned entry.
