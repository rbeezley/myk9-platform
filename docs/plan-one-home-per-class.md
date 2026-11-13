# One home for a class: Show Desk for the secretary, Ringside for the exhibitor

> **Status:** Active

Linear: MYK9-1942. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

The owner's rule: one place and one home for each thing, or people get confused. Two findings on 2026-11-13 showed where a class breaks it.

**For the secretary.** Show Desk's class menu has "View entries and results", which opens the class page (`pages/ClassDetailsPage`). For staff that page is mostly a second copy of Show Desk's class panel, and for run order it links back to Show Desk. The owner already decided "a class has one home", the Show Desk class panel (MYK9-1319, 2026-10-20). The class page is what was left over.

**For the exhibitor.** A code search mapped every place a signed-in exhibitor sees a class they entered:

| Job                   | Places                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| See my place in line  | 6: class page, show page "Where to be & when", three Ringside screens, the alert                  |
| See my results        | 9: class page (2), show page (2), My Shows, Ringside, the dog's pages (2), the show's Results tab |
| Check in              | 4: class page, My Shows, two Ringside screens                                                     |
| Know when to be there | 4, each with a different mix of time, judge and date                                              |

They do not always agree. The same check-in reads "I am here" in Ringside and "checked in" on My Shows. The alert works out "N dogs away" from data with no run order (MYK9-1941, filed separately). The class page's "Your results" can show a result before release without the "preliminary" label every other place adds.

Most rows come from the search and were not re-read line by line. Phase 0 confirms them in the running app.

## The homes

| Who       | When             | Home                         | What it owns                                                               |
| --------- | ---------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Secretary | A class, all day | Show Desk's class panel      | Entries, check-in, run order, scoring, results, paperwork                  |
| Exhibitor | Show day         | Ringside ("Your dogs today") | Where to be, place in line, check-in, results as they are released         |
| Exhibitor | Before and after | My Shows                     | What I entered, what I owe, changing or leaving a class, results over time |
| Anyone    | After release    | The class page               | A class's released results, under the privacy rules, and its Requirements  |

Ringside already does every show-day job: expected time, check-in, place in line with an "updated" time, results marked "preliminary" or "Result not released yet", and it works without a connection. My Shows already sends exhibitors there ("Where to be today") and has no link to the class page.

**Results stay private unless the exhibitor says otherwise** (`docs/INTENT.md`, MYK9-969). Nothing in this plan changes who can see a result. Moving a link must never move a result to a place with looser rules.

## When the judge scores on paper

Raised by the owner, 2026-11-13. Place in line only moves when someone records a score or an in-ring mark in the app. A judge on a stopwatch and a paper scoresheet records nothing as the class runs, and the gate steward works from paper sheets, so every place-in-line screen and the alert would be stale. Making Ringside the exhibitor's show-day home makes that worse unless it is fixed.

Design agreed and filed as MYK9-1943 (High):

- Paper or phone is set judge by judge, with the show's existing "Judges score on devices" switch as the default, and one class can be switched on the day from Show Desk.
- A paper class shows the position in the running order and "This class is scored on paper. Listen for your number at the ring." No "Next up", no "dogs ahead", no alert.
- On a phone-scored class with dogs still to run and nothing recorded for 10 minutes, the claim becomes "Order may be out of date".

So "one place-in-line answer" in this plan has three possible answers, from one server rule: a live place, the paper line, or out of date.

## What changes

### Secretary

1. Remove "View entries and results" from Show Desk's class menu.
2. Bring to the class panel what only the class page shows staff today. Believed to be the Requirements button and the time limit; confirm in Phase 0.
3. For staff the class page stops being a workbench. The run sheet, its check-in dropdowns and its "Enter result" / "Edit result" buttons go. Staff see what an exhibitor sees, plus "Open on Show Desk".
   - That run sheet's check-in dropdown has no guard: a scored dog still offers every status. The desks lock those rows.
   - The earlier screen review said this page "stays" as the home of its job (`docs/ia-review-secretary-show-workbench.md`). Read why before removing its controls.
4. Every other staff door to the class page (class lists, breadcrumbs, the trial page) opens the class on Show Desk.

### Exhibitor

1. **Ringside is the show-day home.** No new screen; "Your dogs today" is it.
2. **The show page's "Where to be & when"** becomes a link, on every day: to Ringside on the trial day, to My Shows before it. It is a second copy of "Your dogs today" on the day and, once My Shows carries the same facts (next item), of My Shows before it.
   - **My Shows carries the night before.** Its class rows gain the time, the judge, and the running order once the secretary posts it. Before the trial day it makes no place-in-line claim, as today.
   - **An exhibitor's own screens show their own result and where they placed**: "Scout: Qualified, 0:52.40, 2nd of 14". My Shows and Ringside need no class table.
   - **Requirements open from Ringside's class card and from a link on each My Shows class row.** Both open the same view, read-only for an exhibitor. It shows the current time limit and when it was set, because a judge can change it on the day.
3. **Links that send exhibitors to the class page** go to Ringside on the day, or to My Shows: the show page's entry rows, the alert's link.
4. **One count for place in line.** Every screen and the alert use the server's answer. Ringside's class list today counts on the phone; it follows the same answer or says when it was last updated.
5. **One set of words for check-in** across My Shows and Ringside.
6. **"Preliminary" on every unreleased result**, including the class page's "Your results".
7. **Staff who also have a dog entered** get "Your dogs today" in Ringside. Today it is hidden by default from anyone with a staff role, and the show page's "Where to be" is replaced by the management view.

### The class page

It keeps one job: a class's released results and its Requirements, for anyone allowed to see them. It is where a result link from a dog's page lands. It is not a place to check in, edit, score, add or remove.

- The check-in badges on its table go (Ringside and My Shows own check-in).
- The "Add Entry", delete, "Set Run Order" and editable cells go. The search found they appear for a secretary or club admin of a different club who opens a class they do not manage. The server's rules should refuse those writes; confirm in Phase 0, and remove the controls either way.

## Decisions on the open questions (owner, 2026-11-13)

1. **The night before a show: My Shows.** One rule: before the trial day, My Shows; on the day, Ringside. My Shows gains the time, judge and running order per class.
2. **An exhibitor needs their own result and where they placed**, not the whole class. The class page keeps its table for results people chose to make public; nobody is sent there for their own.
3. **Requirements for exhibitors live in Ringside, with a link from My Shows.** One view, two doors. Not yet confirmed: whether Ringside shows Requirements to an exhibitor today (it sits behind the class card's options menu, which is gated by role). If it does not, it is shown read-only.

4. **A placement stays private like the rest of the result.** Placements are announced at the ring, so "Private entry" in a placed row can feel odd, but the rule does not change. Instead, when an exhibitor's dog places, they are asked once whether to show their results publicly. Filed as MYK9-1944; not part of this plan.

## Phases

**Phase 0: confirm.** In the running app on a test show, with writes blocked or on a throwaway show:

- Each row of the two tables above, as an exhibitor and as a secretary.
- Whether an exhibitor's phone holds the whole class or only their own dogs. The code has comments both ways (`AtShowClassListPage.tsx:203-211` against the `exhibitor_shows` rule in `supabase/migrations/20261108033700_myk9_1757_pull_source.sql`).
- Whether an exhibitor can open Requirements in Ringside.
- What a secretary of another club sees and can do on a class page.
- Every link to the class page, by role. List them in the PR.

**Phase 1: stop the disagreements.** One place-in-line answer (with MYK9-1941), one set of check-in words, "preliminary" everywhere. No pages move yet.

**Phase 2: the secretary's side.** The Show Desk menu item, the panel additions, the staff class page, the staff links.

**Phase 3: the exhibitor's side.** "Where to be" links into Ringside on the day, exhibitor links retargeted, "Your dogs today" for staff with dogs.

**Phase 4: the class page's one job.** Remove its controls; keep released results and Requirements.

**Phase 5: testing.**

- A test that every place-in-line surface and the alert give the same answer for one dog, with a hand-set run order that differs from armband order and a withdrawn dog ahead.
- A privacy test for each retargeted link: an exhibitor who was shown "Private entry" before still is.
- An unreleased result is labelled "preliminary" on every surface that shows it.
- A link audit test: no staff link and no exhibitor show-day link targets the class page.
- End-to-end, as an exhibitor on a phone: from My Shows to Ringside, check in, watch place in line change, see the result arrive.
- End-to-end, as a secretary: run a class start to finish without leaving Show Desk.
- Add both to the walks (`docs/qa/walks/exhibitor-task-walk.md`, `show-day-walk.md`).

## Connections

- MYK9-1943: paper-scored classes make no live claim. Build with or before Phase 1.
- MYK9-1941: the alert's count. Fix first; it is a bug on its own.
- MYK9-1940 (day-of changes): the same-words rule, and ringside's wording for moved and absent dogs.
- MYK9-1780: each dog's status on Show Desk's class panel.
- MYK9-91 and MYK9-992 already consolidated place-in-line once; read them before Phase 1.

## Non-goals

- A new exhibitor screen.
- Changing who can see a result.
- Removing the class page.
- Moving check-in, pull or withdraw to a new place.
