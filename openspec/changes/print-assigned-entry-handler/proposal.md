## Why

Check-in sheets and run orders can name a dog's owner even when the entry assigns a different handler. Gate staff need the printed person to match the entry, including while offline.

## What Changes

- Project assigned handler identity once at the entry read boundary, with owner fallback only when no handler is assigned.
- Use a dedicated local projected read for at-show queues so unrelated online enrichment cannot delay them.
- Apply the projection to the existing check-in, run-order, and organization print paths.
- Test real entry shapes, initial hydration, offline reads, and an assigned handler who differs from the owner.

## Non-Goals

No new report, page, handler assignment flow, or print layout. The existing surfaces are corrected in place; duplicating them would fragment the workflow.

## Capability

`show-day-print-identity`: operational printouts show the assigned entry handler and use the owner only for an unassigned entry.
