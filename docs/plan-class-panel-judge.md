# Class Panel Judge Picker and Schedule Bulk Edit — judges and bulk class actions on the show home

> **Status:** Active

**Linear:** [MYK9-1323](https://linear.app/myk9-platform/issue/MYK9-1323) (phase 1), [MYK9-1324](https://linear.app/myk9-platform/issue/MYK9-1324) (phase 2) · **Date:** 2026-10-22 (verified against `origin/main` @ `8df972edd`)
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary, including "The secretary's six phases" (a class is managed in "Overview's focused class panel"), and [`plan-secretary-show-home.md`](plan-secretary-show-home.md) (MYK9-956 built Select classes; this plan replaces its separate table with checkboxes on the schedule).

## Goal

Two changes on the show home, both reusing what exists:

1. A secretary assigns or swaps **one** class's judge **in the selected-class panel**, with one tap: no Edit class form, and no detour into Select classes.
2. **Bulk edit happens on the schedule itself.** Select classes stops swapping the schedule for a separate classes table; it puts checkboxes on the schedule rows the secretary is already looking at, with a bulk bar for **change status, assign judge, delete and export**. Assign judge in bulk is new; the other three move over unchanged.

Owner decisions (2026-10-22 brainstorm):

- The judge is changed in the **right panel**, not inline in the schedule row. Rows stay read-only, the same rule status follows ("the status menu is in the selected-class panel", `CockpitTrialGroup.tsx`). A row click keeps meaning "select this class".
- Reshuffling judges is click class → pick judge → click next class. One extra click per class is fine.
- Bulk edit stays, with all four actions: "if we are going to have bulk edit, might as well have them". It moves onto the schedule rows instead of a separate table.
- Checkboxes appear only in select mode, not on every row all the time, so show day stays uncluttered and a row click keeps selecting the class.

## Duplication question (CLAUDE.md § consolidate)

_Does this duplicate an existing page?_ Phase 1 adds a quick door to single-class judge assignment next to Edit class's full form; the per-row picker in the separate table goes away in phase 2, so it is a move, not a copy. Phase 2 deletes the second rendering of the show's classes on the home (the `ClassesTab` table in Select classes) and puts its bulk actions on the one schedule. Nothing new is built except bulk judge assignment, which reuses the existing picker and write.

## Current state (verified on `origin/main`, 2026-10-22)

| What                         | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schedule row shows the judge | `features/show-map/cockpit/CockpitTrialGroup.tsx` (`judgeName \|\| 'Judge not set'`, read-only)                                                                                                                                                                                                                                                                                                                                                        |
| Panel shows the judge        | `SecretaryCockpitFocusedClass.tsx` builds `facts` ("Judge …") for `FocusedClassHeader`, which takes `children`                                                                                                                                                                                                                                                                                                                                         |
| Panel class actions          | `FocusedClassSetupActions.tsx` (Edit class → `ClassEditPanel`, which has a judge field and `NoJudgesNotice`; Delete class)                                                                                                                                                                                                                                                                                                                             |
| The picker                   | `components/classes/ClassJudgeSelect.tsx`                                                                                                                                                                                                                                                                                                                                                                                                              |
| Picker data + write          | `components/shows/tabs/useSetupClassManagement.ts`: `availableJudges` (scoped to the show's registry by `selectQualifiedJudges`), `judgeIdFor` (holds the new judge until replication catches up), `assignJudge`                                                                                                                                                                                                                                       |
| The write                    | `services/database/judges/reads.ts` `upsertClassJudgeAssignment` → `replicatedJudgeAssignmentsTable.replaceClassAssignment` + `touchClassForJudgeSync`. Already offline-queued.                                                                                                                                                                                                                                                                        |
| Select classes mode          | `?select=classes` → `HomeClassSelection.tsx` → `SetupClassesSection.tsx` → `ClassesTab.tsx` + `ClassBulkActionsBar.tsx` / `useClassBulkActions.ts`                                                                                                                                                                                                                                                                                                     |
| Doors into Select classes    | Actions menu (`features/actions/selectClassesAction.ts`, `actionRegistry.ts`); panel "Class setup" (`buildSecretaryCockpitSnapshot.ts` → `getCockpitClassManagementHref`); `setupReadinessSignals.ts`; `classDetailsRelatedLinks.ts`; `CompactScheduleManagerLinks.tsx`; `CompactScheduleTimeline.tsx`; `LegacyClassManagementRedirect.tsx`; `LEGACY_SHOW_SECTION_REDIRECTS.classes` and Setup `?section=classes` (`routes/showManagementSections.ts`) |
| `ClassesTab` other mount     | `ShowDetailTabs.tsx`: the public / exhibitor Classes tab. **It stays.**                                                                                                                                                                                                                                                                                                                                                                                |

## Phase 1 — Judge picker in the class panel (MYK9-1323)

1. **Extract the judge layer.** Move `availableJudges`, `judgeIdFor` and `assignJudge` out of `useSetupClassManagement` into a small hook (e.g. `useClassJudgeAssignment(showId, canManage, classes)`) with no behaviour change. `useSetupClassManagement` calls it, so Select classes keeps working until phase 2. The existing Select classes tests prove the move.
2. **Mount it in the panel.** In `SecretaryCockpitFocusedClass`, render a "Judge" row with `ClassJudgeSelect` in `FocusedClassHeader`'s `children` for managers (`canManageShow`), and drop "Judge …" from `facts` so the name is not shown twice. Read-only viewers keep the plain "Judge …" fact.
3. **Lock on show day.** The picker is editable only while the class's lifecycle is `not-started`. For `in-progress`, `complete`, `cancelled` or an unresolved lifecycle, show the judge's name as text with a one-line hint: "Judge locked once the class starts. Use Edit class to change it." The rule is a pure function, so it can be tested.
4. **No judges on the show.** When `availableJudges` is empty and nothing is assigned, render `NoJudgesNotice` (the component Edit class already uses) instead of an empty picker. An assigned-but-ineligible judge keeps the existing "Assigned judge (unavailable)" label and the Unassigned option.
5. **Schedule row follows.** After a change, the row's "Judge not set" / judge name updates from the same data. A render test pins this (LESSONS `last-hop-drop`).

Acceptance (assertion-first):

- Choosing a judge in the panel calls `upsertClassJudgeAssignment(showId, classId, judgeId)` with exact arguments, and "Unassigned" sends `'TBD'`. Write these tests red before wiring.
- Lock rule: one table test per lifecycle value, with unknown treated as locked.
- Render test: a manager sees the picker, an exhibitor/public viewer and a club admin without manage scope do not (use the same `canManageShow` the panel already uses), and the facts line no longer repeats the judge.
- `NoJudgesNotice` renders when the list is empty and nothing is assigned.
- Offline: the change survives an offline reload of the home (the write is already queued; prove the picker reads `judgeIdFor` and not a stale row).
- Browser walk as `secretary@myk9t.com` at 1440px and 375px on a seeded show with "Judge not set" classes: assign, swap and unassign judges on three classes in a row; confirm the schedule rows update.

## Phase 2 — Bulk edit on the schedule rows (MYK9-1324)

Ships after phase 1 is merged.

1. **Select mode on the schedule.** The Actions menu's "Select classes" (and `?select=classes`) turns on select mode in the cockpit schedule (`SecretaryCockpitSchedule.tsx` / `CockpitTrialGroup.tsx`) instead of mounting `HomeClassSelection`. In select mode:
   - each class row shows a checkbox, and a row click toggles it rather than focusing the class (`selectsRow` / `onFocusClass` in `CockpitTrialGroup.tsx` today);
   - each trial heading shows a select-all checkbox for its classes;
   - a "Done" control leaves the mode and clears the selection;
   - the checkbox and heading control live in sibling components (`CockpitTrialGroup.tsx` is 265 lines).
2. **One trial at a time.** Bulk actions never span trials, the rule `ClassesTab` enforces today. Ticking a class in a different trial starts a new selection in that trial, with a one-line note saying so.
3. **Never act on hidden rows.** The selection clears when the day chips change, when the trial holding it collapses, or on leaving select mode (the rule `useSetupClassManagement` documents: "a bulk action never reaches rows the secretary can no longer see"). Use `useBulkSelection` with `pruneToItems` and a `resetKey`, as the table does.
4. **Bulk bar.** Reuse `ClassBulkActionsBar` (`FloatingBulkBar`): Change status (`useClassBulkActions`, including "Retry failed" and its fresh-status re-check), Delete (`DeleteObjectDialog` with counts, blockers and Undo), Export (`classExportRows`). Add **Assign judge**:
   - a `ClassJudgeSelect`-style picker fed by the phase 1 hook's `availableJudges`; "Unassigned" clears;
   - writes each eligible class through `upsertClassJudgeAssignment`, dispatched with `useBulkDispatch` like bulk status (settled fold, in-flight latch, summary toast, retry);
   - only `not-started` classes are eligible (phase 1's lock rule); the bar's label says how many apply, e.g. "Assign judge (3 of 5)", and the toast names how many were skipped as started;
   - the panel picker and the schedule rows show the new judge through the phase 1 hook's `judgeIdFor` override.
5. **Remove the separate table on the home.** Delete `HomeClassSelection.tsx`, `SetupClassesSection.tsx`, and the manager-only branches of `ClassesTab` (select column, judge column, row menu, bulk bar) if nothing else renders them. **Keep** `ClassesTab` for the public Classes tab, `ClassBulkActionsBar` / `useClassBulkActions` / `classActions.ts` (now used by the schedule), and everything the cockpit imports. Prove each deletion with a grep over code **and** `*.md`, plus a green typecheck, not by name.
6. **Links and redirects.** Delete the panel's "Class setup" link (`class-setup:` in `buildSecretaryCockpitSnapshot.ts`, `getCockpitClassManagementHref`): the panel has Edit class and the judge picker. Keep `getSelectClassesHref` as the one URL for select mode, so `setupReadinessSignals.ts`, `classDetailsRelatedLinks.ts`, `CompactScheduleManagerLinks.tsx`, `CompactScheduleTimeline.tsx`, `LegacyClassManagementRedirect.tsx`, `LEGACY_SHOW_SECTION_REDIRECTS.classes` and Setup `?section=classes` keep working. A `trialId` opens that trial's group; a `focusClassId` ticks nothing and only scrolls to the row.
7. **Docs.** Update the user guides that describe Select classes as a table (`apps/docs`, grep "Select classes"), and `INTENT.md` if it names it.

Where each capability lives afterwards:

| Capability              | After phase 2                                          |
| ----------------------- | ------------------------------------------------------ |
| Assign / swap one judge | Class panel picker (phase 1); Edit class               |
| Assign a judge in bulk  | Schedule select mode → Assign judge (new)              |
| Bulk status             | Schedule select mode → Change status                   |
| Bulk delete             | Schedule select mode → Delete                          |
| Class CSV export        | Schedule select mode → Export                          |
| Edit / delete one class | Class panel (Edit class, Delete class), unchanged      |
| Add classes             | Trial heading "Add Classes" on the schedule, unchanged |

Acceptance (assertion-first where a value goes somewhere):

- Bulk Assign judge calls `upsertClassJudgeAssignment(showId, classId, judgeId)` once per eligible class and never for a started class; red before wiring.
- Bulk status and bulk delete keep their existing tests, moved to the schedule mount.
- Selection rules: a cross-trial tick starts a new selection; a day-chip change, a collapse and Done each clear it (one test each).
- In select mode a row click toggles the checkbox and does not change the focused class; outside it, a row click focuses as today.
- An inventory test listing every former Select classes capability against its new home (red on `main`).
- The public Classes tab renders unchanged; the exhibitor Overview shows no checkboxes.
- Every legacy URL above lands in select mode with the right trial open.
- e2e specs that opened the table (`src/test/e2e/entities/classesUI.spec.ts` and any others found by grep) updated.
- Browser walk as `secretary@myk9t.com` at 1440px and 375px: select a trial's classes, assign a judge, change status, export, delete one class and undo.

## Testing (every phase)

- Unit and render tests per phase, run shuffled (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`. `SecretaryCockpitFocusedClass.tsx` is 350 lines; put the judge row in a sibling component (e.g. `FocusedClassJudge.tsx`) rather than growing it.
- Both phases touch the show-day page: offline-reload proof before merge, per `plan-secretary-show-home.md`. For phase 2, include a bulk judge assignment made offline that syncs on reconnect.

## Non-goals

- No judge editing in schedule rows.
- No bulk actions that span trials.
- No change to Edit class, the judge list's registry scoping, or the replicated judge write.
- No new export format; Export keeps today's CSV columns.
