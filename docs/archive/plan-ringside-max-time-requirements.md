# Ringside max time and class requirements, modelled on myK9Q

> **Status:** Complete

myK9Q (`myK9Qv3`) handles max time and class requirements in a way judges like. This plan brings its proven flow into myK9Show's ringside, on top of the offline-first, server-checked foundation from MYK9-1086 (#2901, #2903). myK9Q is a template, not a spec: where myK9Show is already better it stays as it is.

## What myK9Show keeps (already better than myK9Q)

- Typed rule ranges in `sport_class_rules` (`max_time_seconds_fixed/min/max`) instead of parsing free text such as "1 - 3 minutes".
- Range checked offline on the device (`maxTimeRule.ts`, rule cached on the class with a staleness check) and again on the server in `ringside_update_class`.
- Saves queue offline through `replicatedClassesTable.updateClass`; myK9Q's dialogs need signal.
- No invented 3:00: a class with no time shows "Not set".
- UKC times match the rulebook (migration 20261010235300).

## Duplication check

No new surfaces. Each part extends a surface that exists: the ringside Set Max Time dialog, the entry list's open/tap flow, the scoresheet timer, and the Requirements dialog, which reuses the secretary `ClassRequirementsPanel` rather than building a second one.

## Parts

| Part | Issue     | Priority | Scope                                                                                                                                                |
| ---- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | MYK9-1098 | High     | Per-area max times: one input per area, `ringside_update_class` accepts area 2/3 times, the AKC live scoresheet times each area against its own max. |
| 2    | MYK9-1099 | High     | Prompt for max time before the first dog; auto-apply fixed rulebook times; scoresheet notice names the judge, not the secretary.                     |
| 3    | MYK9-1100 | Medium   | Ringside Requirements dialog reuses `ClassRequirementsPanel`; its max time row opens Set Max Time.                                                   |
| 4    | MYK9-1101 | Medium   | Set Max Time shows the allowed range, 30-second quick picks, and fixed times read-only.                                                              |
| 5    | MYK9-1102 | Low      | 30-second warning as a per-rule setting instead of hardcoded off for Master.                                                                         |
| 6    | MYK9-1103 | Low      | ASCA multi-area classes get one max time per area, like AKC (owner decision 2026-10-11; no area-count choice or split).                              |

Shipped 2026-10-11 as #2905 (part 1), #2907 (parts 2 and 4), #2908 (part 3) and #2909 (parts 5 and 6); migrations 20261011195300 and 20261011211700 pushed. Review restructures: the per-area decision moved into the entry-list data adapter; the ringside rulebook-time write was deleted (class creation sets it); the block stays at the list when it opens (owner decision).

## myK9Q references

- `src/components/dialogs/MaxTimeDialog.tsx`: per-area inputs, smart typing, quick picks (`:294-312`), fixed-time badge (`:655-677`), combined A/B save (`:513-520`).
- `src/pages/EntryList/EntryList.tsx:187-226, 337-363, 982-987`: forced prompt on load and on dog tap; cancel goes back.
- `src/utils/organizationUtils.ts:60-165`: fixed-time registries and auto-apply.
- `src/components/dialogs/ClassRequirementsDialog.tsx`: the requirements layout judges know.
- `src/pages/scoresheets/hooks/useStopwatch.ts` and `useEntryNavigationHelpers.ts:434-478`: per-area timer limit.
- `src/components/dialogs/AreaCountSelectionDialog.tsx:68-80`: ASCA area split.

## Testing phase

Each part is complete only when its tests pass:

- Part 1: dialog tests for per-area inputs and all-or-none save; `ringside_update_class` behavioral SQL test extended for area 2/3 (auth tiers, range, OCC); scoresheet test that area 2 stops at its own max; offline queue replay test.
- Part 2: entry-list tests for the prompt on open and on dog tap, no prompt when set or completed, fixed time auto-applied offline with no dialog.
- Part 3: Requirements dialog renders the shared panel from replicated data with the network off; max time row opens Set Max Time only for users who can set it.
- Part 4: range text and quick picks rendered from the cached rule; fixed class shows read-only time.
- Browser walk at phone width of a multi-area AKC class and a UKC class on staging before closing parts 1-4.
