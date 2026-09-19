## Why

Check-in sheets and run orders currently print the dog's owner even when the entry assigns a different handler. Show-day staff need the printed handler identity to match the entry so they call the correct person at the gate, a direct fall 2026 reliability requirement.

## What Changes

- Derive printed handler identity from the entry's assigned handler, falling back to the owner only when no handler is assigned.
- Apply the same derivation to every affected check-in/run-order print projection.
- Audit the AKC entry form and gazette owner/handler output and pin correct behavior where needed.
- Add a unit test using the real entry shape with handler and owner deliberately different.
- Non-goals: redesign print layouts, change handler assignment, or create a new print surface.
- Duplication check: this corrects existing reports; a link or additional report would fragment the workflow and cannot fix incorrect content.

## Capabilities

### New Capabilities

- `show-day-print-identity`: Operational printouts show the assigned entry handler and use the owner only as an explicit fallback.

### Modified Capabilities

## Impact

- Pipeline print mapping/types/templates and focused tests; potentially existing organization-form/gazette tests only if the audit finds the same assumption.
