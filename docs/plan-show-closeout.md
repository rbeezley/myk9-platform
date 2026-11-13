# Closing out a show: one "Finish the show" list

> **Status:** Active

Linear: MYK9-1945. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

`docs/INTENT.md` sets the target for after the show: "That went smoothly. Results export and judge reports done in clicks, not hours."

The steps exist. The Results tab was rebuilt for them (MYK9-1031), a class finishes in one place (MYK9-1319), and a "Finish the show" row carries "Submit to AKC / UKC / ASCA" and "Close the show" (MYK9-1263). A code search on 2026-11-13 followed the whole sequence from the last class to the closed show and found the gaps are between the steps, not in them: nothing lists what is left, and "Close the show" does not look at several things a secretary would expect.

Most findings come from that search and were not re-read line by line. Two were re-read and are marked. Phase 0 confirms the rest in the running app.

## The sequence today

1. **Per class:** release the results, print the results sheet and the result labels, record each as printed.
2. **Per judge per day:** print the marked catalog, record the judge's initials (AKC) or signature (UKC, ASCA).
3. **Once per show:** "Submit to {registry}". AKC emails the results file; UKC and ASCA are "Mark as submitted".
4. **Once per show:** "Close the show".

On a show of two days, four trials and 24 classes with two judges a day, that is about 78 separate actions one at a time, or about 38 when paperwork is printed by trial. There is no bulk release.

## What is wrong

| Finding                                                                                                                                                                                                                                                                    | Effect                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **No one place lists what is left.** Progress is spread over the class chips, the finish row, the Visibility settings sheet, two Show Desk pills and the close step.                                                                                                       | She keeps the list in her head.                                                                                       |
| **"Close the show" checks five things** (re-read, `features/show-workbench/showCloseOutShow.ts:103-144`): unscored entries, entries waiting for review, no submission recorded, refunds not decided, reportable incidents. None blocks; the button becomes "Close anyway". | It says nothing about classes not released, not printed or not signed, unpaid entries, or the registry's paper forms. |
| The close step's warnings are sentences with no links.                                                                                                                                                                                                                     | She has to find where each is fixed.                                                                                  |
| **Closing cannot be undone**, and no way to reopen a show was found.                                                                                                                                                                                                       | A mis-tap is permanent.                                                                                               |
| **A second way to close exists** (re-read, `components/shows/browse/ShowBulkActionsBar.tsx`): "Mark completed" on the Shows list sets the show's status only. No warnings, and trials and classes stay open.                                                               | Two doors, and one skips every check and leaves the show half closed.                                                 |
| Nothing was found that locks a closed show. Scoring and edits may still work. Not confirmed on the server.                                                                                                                                                                 | "Closed" may mean only a label.                                                                                       |
| After "Submit", nothing points to "Close".                                                                                                                                                                                                                                 | A dead end.                                                                                                           |
| For AKC the app emails the results file but does not list what else is owed: the signed catalog and forms by mail within seven days, with a fee per run. Those facts are printed only on the Trial Secretary Report form (`akcTrialSecretaryReportPolicy.ts`).             | The deadline is not tracked or shown.                                                                                 |
| "Mark as submitted" cannot be undone.                                                                                                                                                                                                                                      | A wrong tap records a submission that did not happen.                                                                 |
| Three places count "ready to close" differently: the Visibility settings sheet counts cancelled classes as unreleased; the finish row leaves them out; the finish row's "all done" ignores printing, while a class's "Done" requires it.                                   | They can disagree for one show.                                                                                       |
| Show Desk marks every class "Submitted to registry" from the one show-level submission.                                                                                                                                                                                    | True for the show, misleading per class.                                                                              |
| Exhibitors get a phone alert when a class is released. The "results available" email exists but is switched off, because nothing sends it.                                                                                                                                 | An exhibitor without alerts hears nothing.                                                                            |
| The payout to the club runs automatically three days after the show's end date, whether or not the show is closed. Not checked: whether undecided refunds hold it.                                                                                                         | Money may move before close-out is settled.                                                                           |

## Design

### One list

The finish row on the Results tab becomes the "Finish the show" list: everything left, in order, each line opening the place to do it. A line with nothing left shows a tick.

> **Finish the show**
>
> - 3 classes to release
> - Paperwork to print for 2 trials
> - Initials from 1 judge: Pat Donovan, Monday
> - 2 entries unpaid · 1 refund to decide
> - Send results to AKC
> - Mail to AKC by Dec 15: signed catalog, Trial Secretary Report, Certification, Judge's Report · fee $216
> - Close the show

Rules:

- **One calculation.** The list, Show Desk's pills, the Visibility settings sheet and the close step all read it. No surface counts for itself.
- **Each line is a link** with the filter already applied: the three unreleased classes, the unpaid entry forms, the judge's day.
- **It is the same pattern as the night-before checklist**: ticks, not a wall of data. It reuses that component's line (the one mocked in `docs/plan-print-packets.md`).
- **It lives on the Results tab**, the home of the After phase. Show Desk's existing pills link to it. No new page.
- **The registry lines come from the registry**, not from app constants scattered in forms: what to send, how, by when, and what it costs. Read through the `@/features/registries` helpers.

### Close reads the same list

"Close the show" shows the list's unticked lines as what is still open. What she saw while working down the list is what she sees before closing.

### Fewer taps

"Release all checked classes" on the Results tab, for classes already checked against paper. The per-class release stays.

### One door, and a way back

- "Mark completed" on the Shows list is removed, or opens the show's close step. It must not set the status by itself.
- A closed show can be reopened.

## Decisions for the owner

1. **Warn or block at close.** Today everything is a warning. Proposal: keep warnings ("smart defaults, never a restriction"), with one exception to consider: results not sent to the registry.
2. **Reopening.** Who may reopen a closed show, and for how long? Proposal: the show's secretary, any time, with the reason recorded.
3. **What a closed show locks.** Proposal: scoring, entry edits and late entries are refused on a closed show, and reopening is the way to change anything. Depends on what Phase 0 finds the server does today.
4. **Release all.** Proposal: only classes already checked against paper; never an unchecked class.
5. **The registry deadline.** Proposal: show the date on the list and send the secretary one reminder two days before. No more than that.
6. **The exhibitors' results email.** Turn it on when a show's results are all released, or leave it off? It is one email per exhibitor per show, and results privacy is unaffected because it links to their own results.
7. **Undoing "Mark as submitted".** Proposal: allow it, with the reason recorded, since the alternative is a record of something that did not happen.
8. **The payout.** If Phase 0 finds it does not wait for undecided refunds, decide whether it should.

## Phases

**Phase 0: confirm.** On a test show, with writes on a throwaway show only:

- Walk the sequence end to end and count the actions.
- What a closed show refuses, in the app and on the server (score, edit an entry, add a late entry, change a class).
- Whether "Mark completed" on the Shows list leaves trials and classes open.
- Whether the payout waits for undecided refunds (`apps/myk9show/supabase/functions/cron-process-payouts`).
- For UKC and ASCA: the deadline and what is owed, from the rulebooks in `docs/rulebooks/`. The July review (`docs/roles/secretary-registry-closeout-verification.md`) lists what was unfinished then; re-check each row.
- Whether `ShowCompletionWorkflow.tsx` is used anywhere. If not, delete it.

**Phase 1: one calculation.** The single function for what is left, with the registry's duties read from the registry. The three existing counts and the close step's concerns move onto it. No new screen yet.

**Phase 2: the list.** The finish row becomes the list, each line a link. Show Desk's pills point at it. Submit points on to Close.

**Phase 3: close and reopen.** The close step reads the list. The second door goes. Reopen, and whatever locking the owner decides.

**Phase 4: fewer taps.** Release all checked classes.

**Phase 5: testing.**

- The list, the close step and Show Desk's pills give the same counts for one show, including a show with a cancelled class and a class with no dogs.
- Each line's link lands on a view filtered to exactly the items it counted.
- A show closed with open lines records which were open.
- Reopen restores the show, its trials and its classes to what they were.
- No path sets a show to completed except the close step.
- AKC, UKC and ASCA each show their own registry lines and none of the others'.
- End to end as a secretary: finish a two-trial show from the last score to closed, following only the list.
- Add the walk to `docs/qa/walks/secretary-task-walk.md`.

## Connections

- Print packets (MYK9-1924): the "After the show" packet and the judge's record are the paperwork lines of this list. Build the list to link to them.
- Money at the table (MYK9-1930, MYK9-1936): unpaid entries must be recordable before the list can tick its money line.
- `docs/plan-results-tab-redesign.md` (Active): this plan extends its finish row. Read it first.
- MYK9-1680 (lessons-learned report) and MYK9-1681 (AI roadmap) are separate.

## Non-goals

- A new page or tab.
- Sending UKC or ASCA results electronically.
- Paying registry fees through the app.
- Changing the per-class release, print or sign-off steps.
