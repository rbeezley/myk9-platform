# Health Timeline Export Plan

## Scope

- Add a working `Export Timeline` action in `HealthTimeline`.
- Keep the format simple and complete: CSV with stable, human-readable columns.
- Keep empty exports calm by producing a header-only CSV instead of blocking the action.

## Implementation

- Convert health events into CSV rows in `HealthTimeline`.
- Use the existing shared export utility to download the file.
- Name the file with the dog id and current date.

## Testing

- Add focused tests for exporting populated health events.
- Add focused tests for exporting an empty timeline with headers.
- Run the focused Vitest file and report results.
