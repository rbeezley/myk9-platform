# Show Map Score Class Menu Design

## Goal

Make class scoring discoverable from the secretary Show Map even when a class has not been marked started, and fix the refresh regression where `Mark Class Started` does not persist as an active class state.

## Product Intent

This supports the Trial Secretary feeling of "That was easy" from `docs/INTENT.md`: the class row should not hide scoring behind an implicit lifecycle step. It also supports show-day reliability from `docs/goals/fall-2026-launch-readiness.md` by making class status durable after refresh.

## Scope

- Keep the existing primary class lifecycle action:
  - Not-started classes show `Mark Class Started`.
  - Active classes show `Score Class`.
- Add `Score Class` to the class row three-dot menu for not-started classes when a class scoring URL is available.
- Link the menu action to the existing paper scoring class route.
- Do not create a new scoring page, panel, or duplicated scoring workflow.
- Fix the persistence path so a class marked started remains active after data is reloaded.

## Architecture

The Show Map already owns class row actions in `apps/myk9show/src/features/show-map/showMapActions.ts`. The new menu affordance should be added there by reusing the existing `score-class` action id and the existing class-level scoring route. The primary action behavior stays unchanged because the not-started class remains lifecycle-first.

The persistence bug should be fixed in the status normalization path rather than by bypassing replication. `markShowMapClassStarted` already writes through `replicatedClassesTable.updateClass`; the refresh failure should be covered with a mapper-level regression test proving persisted database statuses such as `in_progress` read back as active UI statuses.

## Testing

- Add a Show Map action test proving a not-started class exposes both `Mark Class Started` and secondary `Score Class`.
- Add a status mapper regression proving `in_progress` reads back as `In Progress`.
- Run the focused Vitest files for the changed code.

## Non-Goals

- No database migration.
- No direct Supabase read or mutation in the Show Map flow.
- No redesign of the class row, scoring screen, or workbench layout.
