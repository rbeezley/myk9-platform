# Class Panel Judge Picker — change a judge from the show home, then delete Select classes

> **Status:** Active

**Linear:** [MYK9-1323](https://linear.app/myk9-platform/issue/MYK9-1323) (phase 1), [MYK9-1324](https://linear.app/myk9-platform/issue/MYK9-1324) (phase 2) · **Date:** 2026-10-22 (verified against `origin/main` @ `8df972edd`)
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary, including "The secretary's six phases" (a class is managed in "Overview's focused class panel"), and [`plan-secretary-show-home.md`](plan-secretary-show-home.md) (MYK9-956 built Select classes; this plan removes it).

## Goal

A secretary assigns or swaps a class's judge **in the selected-class panel on the show home**, with one tap: no Edit class form, and no detour into Select classes. Once that works, **Select classes mode is deleted**. It exists for three bulk actions (change status, delete, export) that the owner judged unlikely to be used (2026-10-22), plus the per-row judge picker this plan moves.

Owner decisions (2026-10-22 brainstorm):

- The judge is changed in the **right panel**, not inline in the schedule row. Rows stay read-only, the same rule status follows ("the status menu is in the selected-class panel", `CockpitTrialGroup.tsx`). A row click keeps meaning "select this class".
- Reshuffling judges is click class → pick judge → click next class. One extra click per class is fine.
- Bulk status change, bulk delete and the class CSV export are not worth a mode of their own.

## Duplication question (CLAUDE.md § consolidate)

_Does this duplicate an existing page?_ Phase 1 adds a second door to judge assignment, alongside Select classes and the judge field inside Edit class. Phase 2 removes Select classes, so the net result is one quick door (the panel) plus the full form (Edit class), and one fewer mode on the home. Nothing new is built: the picker, its write and its judge list already exist.

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

## Phase 2 — Delete Select classes (MYK9-1324)

Ships after phase 1 is merged.

1. **Remove the doors.** Delete `selectClassesAction` and its registry entry, and the panel's "Class setup" link (`class-setup:` in `buildSecretaryCockpitSnapshot.ts`, `getCockpitClassManagementHref`). Retarget the other links to the show home, focused on the class where they name one: `setupReadinessSignals.ts`, `classDetailsRelatedLinks.ts`, `CompactScheduleManagerLinks.tsx`, `CompactScheduleTimeline.tsx`.
2. **Redirects, so bookmarks never 404.** `?select=classes` (with any `trialId` / `focus`), `/shows/:id/setup?section=classes`, `LEGACY_SHOW_SECTION_REDIRECTS.classes` and `LegacyClassManagementRedirect` land on `/shows/:id`, carrying the focused class as the cockpit's `focus` param when one is named.
3. **Delete the mode.** `HomeClassSelection.tsx`, `SetupClassesSection.tsx`, `ClassBulkActionsBar.tsx`, `useClassBulkActions.ts`, the bulk and selection parts of `useSetupClassManagement` (or the whole hook if phase 1 left nothing else in it), and the manager-only branches of `ClassesTab` (select column, judge column, row menu, bulk bar), along with the tests that cover only them. **Keep** `ClassesTab` for the public Classes tab, `classActions.ts` if any row menu still uses it, and everything the cockpit imports. Prove each deletion with a grep over code **and** `*.md`, plus a green typecheck, not by name.
4. **Docs.** Update `INTENT.md`'s six-phases table if it names Select classes, and the user guides that mention it (`apps/docs`, grep "Select classes").

What goes away and where it lives now:

| Capability               | After phase 2                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Assign / swap a judge    | Class panel picker (phase 1); Edit class                                                                                 |
| Edit / delete one class  | Class panel (Edit class, Delete class), unchanged                                                                        |
| Add classes              | Trial heading "Add Classes" on the schedule, unchanged                                                                   |
| Change status            | Class panel status menu, one class at a time                                                                             |
| Bulk status, bulk delete | Removed (owner, 2026-10-22)                                                                                              |
| Class CSV export         | Removed. Before deleting, check Reports for a class list; if none covers it and the owner wants one, file it separately. |

Acceptance: an inventory test listing every former Select classes capability against its new home, or "removed" (red on `main`); redirect tests for each legacy URL above, including the carried `focus`; the public Classes tab renders unchanged (render test); `pnpm typecheck`, `pnpm lint`, the shuffled suite and `pnpm qa:code-quality-ratchet` green; e2e specs that opened Select classes (`src/test/e2e/entities/classesUI.spec.ts` and any others found by grep) updated; browser walk as `secretary@myk9t.com` following each old link.

## Testing (every phase)

- Unit and render tests per phase, run shuffled (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`. `SecretaryCockpitFocusedClass.tsx` is 350 lines; put the judge row in a sibling component (e.g. `FocusedClassJudge.tsx`) rather than growing it.
- Both phases touch the show-day page: offline-reload proof before merge, per `plan-secretary-show-home.md`.

## Non-goals

- No judge editing in schedule rows.
- No bulk judge assignment. Judges have always been assigned one class at a time.
- No change to Edit class, the judge list's registry scoping, or the replicated judge write.
- No new export or report.
