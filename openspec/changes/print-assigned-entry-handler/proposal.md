## Why

Check-in sheets and run orders can name a dog's owner even when the entry assigns a different handler. Gate staff need the printed person to match the entry, including while offline.

## What Changes

- Project assigned handler identity once at the entry read boundary, with owner fallback only when no handler is assigned.
- Keep at-show queues on their existing replicated read because those screens do not display handler identity.
- Apply the projection to the existing check-in, run-order, and organization print paths.
- Test real entry shapes, deferred report hydration, and an assigned handler who differs from the owner, including automated packet output.

## Non-Goals

No new report, page, handler assignment flow, or print layout. The existing surfaces are corrected in place; duplicating them would fragment the workflow.

## Capability

`show-day-print-identity`: operational printouts show the assigned entry handler and use the owner only for an unassigned entry.
