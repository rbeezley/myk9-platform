# Secretary feature inventory: core, optional, power

> **Status:** Active

**Owner decision (2026-10-31):** the proposed classes below are accepted as written, with one change: **Run order is Core**, not Optional. Follow-up issues: MYK9-1620 (class checklist and print tracking hidden until used), MYK9-1621 (offline banner only near the show), MYK9-1622 ("This show uses…" switches), MYK9-1619 (hospitality). Interactive copy: https://claude.ai/artifact/QD8p4JcMp25LBb6g63zHAE

2026-10-31. Every feature a trial secretary can reach on one show, sorted by how much a secretary who wants **the bare minimum** needs it. Built from a read of `main` (two code sweeps) and a walk of production (baseline on MYK9-1612).

**The rule this inventory serves:** a feature the secretary never chose to use is **invisible, not unfinished**. It never shows as incomplete, never counts toward a badge, never blocks anything.

**Classes**

- **Core**: the bare-minimum job. Always visible, always fast.
- **Optional**: many secretaries use it, many don't. Visible when relevant or once used; silent otherwise.
- **Power**: experienced or large-show secretaries. Reachable (a menu, a filter, a setting), never in the way.
- **Cut?**: a candidate to delete or replace.

The **"Owner"** column is blank on purpose: mark ✔ to agree or write the class you'd choose.

---

## 1. The bare-minimum loop (core)

A secretary can run a show using only these. Every one must stay fast (the 10-task walk is the test).

| Job                                                                                                          | Where                                                                  | Owner |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----- |
| Create the show: name, org, location, club, dates, officials, fees, payment methods, trials, classes, judges | Creation wizard; Edit show → Basic / Officials / Judges / Fees         |       |
| Publish the show (status)                                                                                    | Status pill in the show header                                         |       |
| Publish the premium list                                                                                     | Show details panel → Premium card                                      |       |
| See entry forms and accept / reject                                                                          | Entry Forms → Needs review; form checklist Accept / Reject; Accept all |       |
| Take cash / check, mark paid                                                                                 | Form checklist Cash… / Check…; Payment menu                            |       |
| Assign armbands                                                                                              | Form checklist Assign; armband chip; "Use next available"              |       |
| Withdraw / pull an entry                                                                                     | Entry status chip                                                      |       |
| Late entry at the table                                                                                      | Add Entry; More → Add late entry                                       |       |
| Print the paperwork: catalog, armband labels, judge's schedule, check-in sheets, score sheets                | Reports → Before / During the show                                     |       |
| Check dogs in                                                                                                | Check-in desk (People at show)                                         |       |
| Set class status (started, complete)                                                                         | Overview → focused class → Status                                      |       |
| Enter results from scoresheets                                                                               | Overview → focused class → Enter results from scoresheet               |       |
| Release results, print results and result labels                                                             | Results tab → class detail                                             |       |
| Submit to the registry                                                                                       | Results → Submit to {registry}                                         |       |
| Close out the show                                                                                           | Results → Close the show                                               |       |
| Registry paperwork after the show (AKC Trial Secretary Report etc.)                                          | Reports → After the show                                               |       |

## 2. Everything else, by area

### Show page (Overview / Show Desk)

| Feature                                                                                      | Proposed | Why                                                                                                     | Owner  |
| -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- | ------ |
| Show schedule with class rows                                                                | Core     | Where class status and results start                                                                    |        |
| Needs attention chips (review, check in, payments, judge sign-off, close out)                | Core     | Good doors; they only count real work                                                                   |        |
| Day filter, Jump to now                                                                      | Core     | Free when unused (appear only on multi-day / timed shows)                                               |        |
| Schedule filter tabs (All / In progress / Needs attention / Needs closeout)                  | Power    |                                                                                                         |        |
| Select classes mode + bulk bar (status, assign judge)                                        | Power    |                                                                                                         |        |
| Trial actions menu (Edit, Entry forms, Judge supplies, Trial financials)                     | Power    |                                                                                                         |        |
| Focused class: Expected start, Set start, Announce the delay                                 | Optional | Timed shows only                                                                                        |        |
| Focused class: Run order (armband ↑↓, random, by hand)                                       | Core     | Owner: every class needs a run order                                                                    | ✔ Core |
| Focused class: Change class (move-up)                                                        | Core     | But only reachable here today (MYK9-1614)                                                               |        |
| **Class checklist "X of 7 steps done"** on every class row                                   | Optional | **Nags**: shows "0 of 7" before anything is done                                                        |        |
| **Paperwork rows "Not confirmed printed"**, Record as printed, Print history, Mark incorrect | Power    | **Nags**: shows even if print tracking is never used                                                    |        |
| **"Ready for show day" checklist** (7 lines, days −7 to −1)                                  | Optional | Useful nudge; but "device ready offline" and "sheets printed" lines nag secretaries who don't use those |        |
| "Show-day work has not started…" notice                                                      | Core     | Orientation; harmless                                                                                   |        |
| Results handoff ("Every class is complete…")                                                 | Core     |                                                                                                         |        |

### Header and show details panel

| Feature                                                                 | Proposed         | Why                                                                                            | Owner |
| ----------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- | ----- |
| Status pill (Publish / Move to draft / Set entry window)                | Core             |                                                                                                |       |
| **"premium list not yet published" / "landing page not yet published"** | Optional         | **Nags** forever for clubs with their own premium PDF or no landing page                       |       |
| **"Offline copy: not saved on this device · Save for show day"**        | Optional         | **Nags** on every tab, any date; only matters close to show day on the device that will run it |       |
| Sync note ("All changes saved", "Sync needs attention")                 | Core             | System state; quiet when fine                                                                  |       |
| Presence avatars, live indicator                                        | Power            |                                                                                                |       |
| Quick info cards (entries, close date, location, fee)                   | Core             | MYK9-1608 moves them to About                                                                  |       |
| Landing page card (copy link, preview, style)                           | Optional         |                                                                                                |       |
| Venue map pin                                                           | Optional         | MYK9-1608 moves to Edit show                                                                   |       |
| Venue Wi-Fi (printed on armband labels)                                 | Optional         |                                                                                                |       |
| Show withdrawal policy override                                         | Optional         | Club default covers most                                                                       |       |
| Refund all entries (cancelled shows only)                               | Core when needed | Already quiet until cancelled                                                                  |       |

### Header Actions menu (~17 items)

| Item                                                                     | Proposed                                                                                | Owner |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----- |
| Edit show, Add entry, Open Entry Forms, Close out show                   | Core                                                                                    |       |
| Add Trial, Add classes, Select classes                                   | Power                                                                                   |       |
| Check-in desk / People at show                                           | Core on show day                                                                        |       |
| Self check-in                                                            | Optional                                                                                |       |
| Access codes (judge / ringside codes)                                    | Core if judges score on devices; otherwise optional                                     |       |
| Emergency trial packet (paper fallback)                                  | Optional                                                                                |       |
| Volunteers                                                               | Optional                                                                                |       |
| **Judge hospitality**                                                    | **Cut** → replaced by a planning report (MYK9-1619)                                     |       |
| Tasks and notes                                                          | Optional                                                                                |       |
| Incident log                                                             | Optional; its badge only counts logged incidents (fine)                                 |       |
| Create: Add Show / Dog / Person / Club                                   | Power (role-gated)                                                                      |       |
| **Actions badge** = incidents + hospitality "water pending" + open tasks | **Nags**: hospitality counts every judge by default (fixed by MYK9-1619); see MYK9-1597 |       |

### Entry Forms

| Feature                                                                                                         | Proposed                                    | Owner |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----- |
| Queues: Needs review, Payment due, All                                                                          | Core                                        |       |
| Queue: Missing info                                                                                             | Optional                                    |       |
| Other lists: Waitlist, Pulls, Move-ups, Registration number needed                                              | Optional (each matters only if used)        |       |
| Trial / Class filter                                                                                            | Power                                       |       |
| Search (exhibitor, dog, armband, confirmation, class)                                                           | Core                                        |       |
| Bulk bar: Accept / Reject N, Resend confirmation, Export selected                                               | Power                                       |       |
| More → Export Full CSV                                                                                          | Power                                       |       |
| Form checklist (review, payment, armband, registration number); "All set"                                       | Core                                        |       |
| Form ⋯: Email exhibitor, Accept all / Reject all                                                                | Core                                        |       |
| Payment menu: Partial payment, Refunded, Partial refund, Reset                                                  | Power                                       |       |
| Status chip: Mark pending, Pull, Reject, Withdrawn (with reason)                                                | Core (but four look-alike verbs, MYK9-1615) |       |
| Request payment (payment link), Refund payment                                                                  | Optional                                    |       |
| Entry ⋯: Edit entry (handler, jump height), Remove entry                                                        | Power                                       |       |
| Comp an entry                                                                                                   | Power                                       |       |
| Communication and history (decision email)                                                                      | Optional                                    |       |
| Waitlist management + Wait list settings (auto-offer, capacity, reserved spots, release date, payment deadline) | Power                                       |       |
| Pull refunds (issue / deny)                                                                                     | Optional                                    |       |
| Move-up requests (approve / deny)                                                                               | Optional                                    |       |
| Registration number needed emails                                                                               | Optional                                    |       |

### Results

| Feature                                                                                   | Proposed                            | Owner |
| ----------------------------------------------------------------------------------------- | ----------------------------------- | ----- |
| Class detail: check scores, Release results, print results sheet and labels               | Core                                |       |
| Status views (Needs me, Needs checking, Ready to release, Needs printing, Released, Done) | Core: "Needs me" / Power: the rest  |       |
| Print all ready                                                                           | Core                                |       |
| Record coin flip                                                                          | Optional (ties only)                |       |
| Judge sign-off (initials / signatures)                                                    | Core for registries that require it |       |
| Hide results                                                                              | Power                               |       |
| Visibility settings (placements, Qs, times, faults; per trial / class overrides)          | Power                               |       |
| Nationals leaderboard                                                                     | Power (Nationals only)              |       |
| Submit: preflight, Send to {org}, Download XML, Mark as submitted, history                | Core                                |       |
| Close out (summary, Close anyway)                                                         | Core                                |       |

### Reports (~35 in the catalog)

| Group                                                                                                                                         | Proposed                                           | Owner |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----- |
| Show Catalog, Armband Labels, Judge's Schedule, Check-in Sheet, Score Sheet, Results Sheet, Result labels                                     | Core                                               |       |
| The registry's required forms for its own shows (AKC Trial Secretary Report, Judge's Certification, UKC Trial Report, ASCA Trial Report etc.) | Core for that registry (already registry-filtered) |       |
| Entry counts (show / trial / breed / judge), Waitlist report, Financial report, Trial financials                                              | Optional                                           |       |
| Show Flyer, Judge Supply Checklists, Judge Setup Cheat Sheets, Steward's Report, Result Catalog, High in Trial                                | Optional                                           |       |
| Armband label options, printer calibration                                                                                                    | Power                                              |       |
| Report print status                                                                                                                           | Power                                              |       |
| Hospitality plan (new, MYK9-1619)                                                                                                             | Optional                                           |       |

### Edit show and setup

| Feature                                                                                               | Proposed                                    | Owner |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----- |
| Basic, Officials, Judges, Fees (incl. payment methods)                                                | Core (required to run)                      |       |
| Junior handler fee, max entries per dog / total, non-owner handlers, Nationals flag, starting armband | Power                                       |       |
| Premium tab: show style, generate on save, shared content                                             | Optional                                    |       |
| Clone from a previous show (wizard)                                                                   | Optional, but likely the fastest setup path |       |

### Outside the show

| Feature                                                                  | Proposed                              | Owner |
| ------------------------------------------------------------------------ | ------------------------------------- | ----- |
| Home dashboard (today / upcoming / draft / past, attention strip, tasks) | Core                                  |       |
| Ringside (/at-show)                                                      | Core on show day (for whoever scores) |       |
| Browse: Shows, Dogs, People, Clubs                                       | Power                                 |       |
| Message Center (bell): notifications, show messages, compose             | Core for announcements                |       |
| Communication History (/secretary/messages): inbox, email delivery       | Optional; hard to find (MYK9-1610)    |       |
| Scheduled lifecycle emails (accepted, waitlist, registration number)     | Optional                              |       |
| Volunteer scheduling page                                                | Optional                              |       |
| Club pages, club withdrawal policy, payouts                              | Power (club admin)                    |       |

---

## 3. Where optional features nag today

Each of these shows up for a secretary who never used the feature. Fixing these is the cheapest win in this inventory.

| Nag                                                                 | Where             | Fix direction                                                         | Tracked                         |
| ------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- | ------------------------------- |
| Actions badge counts every judge as "water pending"                 | Header            | Remove hospitality from the badge                                     | MYK9-1619, MYK9-1597            |
| "X of 7 steps done" on every class row, from 0                      | Overview          | Hide the strip until the first checklist item is used on this show    | MYK9-1620                       |
| "Not confirmed printed" on every paperwork row                      | Focused class     | Show print state only once something was printed or marked            | MYK9-1620                       |
| "premium list not yet published" / "landing page not yet published" | Status line       | Respect "We publish our own premium list" and the landing page switch | MYK9-1622                       |
| "Offline copy: not saved on this device · Save for show day"        | Header, every tab | Show only in the days before and during the show                      | MYK9-1621                       |
| "Ready for show day": offline and printing lines                    | Overview          | Count those lines only if the feature is in use                       | MYK9-1620, MYK9-1621, MYK9-1622 |
| "Prepare <sheet>" chips before each class                           | Needs attention   | Only if the show uses print tracking                                  | MYK9-1620                       |

## 4. Smaller findings from the sweeps

- `EntryRowActionMenu` (the fuller per-entry menu: Move to waitlist, Comp, Resend confirmation, Change armband) is only mounted in tests; those actions reach users through the bulk bar and status popover. Decide: delete it, or make it the entry ⋯.
- Scheduled lifecycle emails hide three steps (two-week reminder, day-before reminder, results available) whose producers are deferred.
- `/secretary/settings` redirects to Home; the settings it held live in the show details panel.

## 5. Next steps (after the owner marks the classes)

1. Fix the nags in §3 (one issue per row without a tracker, or one batch).
2. Apply "visible when relevant or once used" to the Optional rows, starting with the show page.
3. Re-run the 10-task walk (MYK9-1612) to confirm the core loop is no slower.
