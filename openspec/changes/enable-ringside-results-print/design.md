## Context

`EntryListPage` currently derives a `completedEntries` array from rows already filtered by the active Pending/Completed tab, then uses that tab-local array to gate Results Sheet. The page already receives canonical class-level `classInfo.completedEntries` from the host.

## Goals / Non-Goals

**Goals:** make one existing print option depend on canonical class-level completed count, with single and combined view coverage.

**Non-Goals:** change report rendering, print-dialog behavior, entry classification, other print options, or add navigation/UI. No persistent data or replication path changes.

## Decisions

- Read `classInfo.completedEntries` at the menu construction site. This is the same class-level accounting used by current class dialogs and avoids creating another entry-count derivation.
- Test through the page/header shim on the default Pending tab so the regression cannot pass by testing a detached helper only.
- Cover combined A/B through the same surface; the host-provided class context remains the source of truth rather than section/status-filtered rows.

## Risks / Trade-offs

- [A host omits classInfo during initial load] → default to zero, keeping print disabled until canonical data exists.
- [A test mocks tab-filtered completed rows and masks the bug] → assert the menu control from a Pending-tab render with canonical completed count set separately.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: One package-level enablement rule changes with no persistence or authorization impact, but it is show-day UI behavior.
