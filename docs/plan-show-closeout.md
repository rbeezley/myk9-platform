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
| The payout to the club runs automatically three days after the show's end date, whether or not the show is closed, and does not wait for undecided refunds (re-read). After it is sent the app refuses further refunds for that show. Nothing tells the secretary.         | Money may move before close-out is settled.                                                                           |

## Design

### One list

The finish row on the Results tab becomes the "Finish the show" list: everything left, in order, each line opening the place to do it. A line with nothing left shows a tick.

> **Finish the show**
>
> - 3 classes to release
> - Paperwork to print for 2 trials
> - Initials from 1 judge: Pat Donovan, Monday
> - 2 entries unpaid
> - 1 refund to decide before Thursday's payout. After that the club refunds directly.
> - Results file sent to AKC · Mon 7:40 PM ✓
> - Paperwork to mail by Dec 15: signed catalog, three forms, fee about $216 (48 runs at $4.50) · Mark as mailed
> - Close the show

Rules:

- **One calculation.** The list, Show Desk's pills, the Visibility settings sheet and the close step all read it. No surface counts for itself.
- **Each line is a link** with the filter already applied: the three unreleased classes, the unpaid entry forms, the judge's day.
- **It is the same pattern as the night-before checklist**: ticks, not a wall of data. It reuses that component's line (the one mocked in `docs/plan-print-packets.md`).
- **It lives on the Results tab**, the home of the After phase. Show Desk's existing pills link to it. No new page.
- **The registry lines come from the registry**, not from app constants scattered in forms: what to send, how, by when, and what it costs. Read through the `@/features/registries` helpers.

### What the app knows, and what she tells it

The list never claims more than the app knows.

- **The AKC results file ticks itself.** The app sends it (`supabase/functions/send-results`), so "sent Mon 7:40 PM" is a fact, and the copy of what was sent is permanent. A corrected file is a second send recorded after the first.
- **Everything else is her tick**: the AKC paperwork, and all of UKC and ASCA. Those lines read "Marked as mailed Tuesday" or "Marked as submitted", never "received". The app does not hear whether a registry accepted anything.
- **"Results changed since they were sent."** If a score changes after the results file went, the list says so and offers to resend. This is what protects the record, whether or not the show is closed.

Not yet verified against the regulations: exactly what AKC requires on paper when results are sent electronically. The forms named above come from the text on one form in the app. Check before the list tells a secretary what to mail.

### Close reads the same list

"Close the show" shows the list's unticked lines as what is still open, each with its link. Nothing blocks. When she closes with lines still open, the show records which ones.

### Closing locks nothing for staff, and can be reopened

A search of the database rules on 2026-11-13 found one thing a completed show refuses: an exhibitor withdrawing or pulling their own entry. In the app an exhibitor also cannot edit their own entry, the show moves to "Past", and the public page stops offering entry. Nothing was found that stops a secretary correcting a score, editing an entry or changing a class on a closed show.

That stays. Closing is a marker that the show is finished, not a lock.

- **"Reopen show"** for the mis-tap: the show's secretary, any time, with the reason kept. It flips the status back and nothing else.
- "Mark completed" on the Shows list is removed, or opens the show's close step. It must not set the status by itself.

### Fewer taps

She ticks classes in the Results list and releases them together. The dialog names them: "Release results for these 9 classes? You're confirming their scores match the paper sheets." She chooses which, so the record of checking stays honest. The Results list's existing bulk bar gains the button; the per-class release stays.

### The registry deadline

The list shows the date, counted from the last trial day in the show's own time zone. The secretary gets one reminder two days before, for whichever line is still open, and none once it is ticked. The fee is shown as an estimate with the rate beside it, since the rate changes yearly.

### Exhibitors

One email per exhibitor when the last class of the show is released: "Results from {show} are ready", linking to their own results on My Shows. It lists nobody's results, so privacy is unaffected, and a show the club keeps private still sends it. A class released after the email has gone sends the phone alert as today and no second email. Following the link is where an exhibitor whose dog placed is asked once about showing results publicly (MYK9-1944).

### Money

The club's payout goes out three days after the show's last day, whether or not the show is closed, and does not wait for refunds that are undecided (`cron-process-payouts`, re-read 2026-11-13). Once it has been sent, the app refuses any further refund for that show (`_shared/refundValidation.ts`: `payout_already_sent`). So the secretary has three days to decide refunds in the app.

The payout is left alone. The list shows the date on the refund line. When a refund is refused because the payout has gone, the message says so plainly and tells her the club now pays the exhibitor directly.

## Decisions (owner, 2026-11-13)

1. **Close warns about everything and blocks nothing**, and records what was still open.
2. **Reopening:** the show's secretary, any time, reason kept.
3. **A closed show locks nothing for staff.** Decided with 2: adding a lock would have meant building a second feature to get round it.
4. **Tick and release.** She chooses the classes; no "release everything".
5. **The registry deadline:** the date on the list and one reminder two days before.
6. **The exhibitors' results email:** one per exhibitor when all results are released.
7. **"Mark as submitted" and "Mark as mailed" can be undone**, with a reason kept. The AKC results file's record cannot.
8. **The payout is left alone;** the list shows its date. Holding back only the amounts in question is recorded as a later option, MYK9-1947.

## Phases

**Phase 0: confirm.** On a test show, with writes on a throwaway show only:

- Walk the sequence end to end and count the actions.
- What a closed show refuses, in the app and on the server (score, edit an entry, add a late entry, change a class).
- Whether "Mark completed" on the Shows list leaves trials and classes open.
- That a secretary can still correct a score and edit an entry on a closed show, as the search suggests.
- What the secretary reads today when a refund is refused after the payout.
- What AKC requires on paper when results are sent electronically, from the current regulations.
- For UKC and ASCA: the deadline and what is owed, from the rulebooks in `docs/rulebooks/`. The July review (`docs/roles/secretary-registry-closeout-verification.md`) lists what was unfinished then; re-check each row.
- Whether `ShowCompletionWorkflow.tsx` is used anywhere. If not, delete it.

**Phase 1: one calculation.** The single function for what is left, with the registry's duties read from the registry. The three existing counts and the close step's concerns move onto it. No new screen yet.

**Phase 2: the list.** The finish row becomes the list, each line a link. Show Desk's pills point at it. Submit points on to Close.

**Phase 3: close and reopen.** The close step reads the list and records what was open. The second door goes. "Reopen show". Undo for the lines she ticks herself.

**Phase 4: fewer taps.** Tick and release.

**Phase 4b: the deadline reminder and the exhibitors' email.** Each is one scheduled email with a clear stop condition.

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
