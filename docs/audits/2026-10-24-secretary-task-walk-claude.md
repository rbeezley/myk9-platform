# Secretary Task Walk — 2026-10-24

**Prompt version:** `docs/qa/walks/secretary-task-walk.md` read from `origin/main` at `0ee3c41928522faaad9090a6a8e87feea71fa403`.
**Run token:** `2026-10-24 0105`
**ISO week 43 → 43 mod 3 = 1 → registry AKC, trial type Scent Work**
**Walk show:** `ZZ Walk 2026-10-24 0105 AKC - teardown me` (`0ec7eed1-9022-478c-a398-1b4f2a6eaa0c`), created and soft-deleted by this run.
**Baselines:** this run `origin/main` `0ee3c4192`; prior walk (2026-09-17) `d37efefa1`. 787 commits touch `apps/myk9show/src`, `packages` or `supabase/migrations` in between.

Functional walk of the secretary's task surface against a local dev server on port
5199 serving `origin/main`, in a dedicated worktree, backed by the shared staging
Supabase project. Audit only: no source edits, no migrations, no deploys. The repo
writes are this file and the Part 2 corrections to the walk's own prompt file.

Findings numbered continuously from the [2026-09-17 walk](2026-09-17-secretary-task-walk-claude.md),
which ended at F55.

Codex's `weekly-secretary-ux-walk`: `status = "PAUSED"`, `rrule = "RRULE:FREQ=WEEKLY;BYDAY=TU;BYHOUR=1;BYMINUTE=30"`.

SQL access: confirmed (`select 1` through the Supabase MCP server before walking).

---

## Headline

**Could a first-time secretary configure and run a show without assistance?**
**Yes for setting it up; publishing was blocked by fixture state, and two things
would make her doubt what she had done.** Navigating by visible labels only, the
beginner built a show end to end: wizard with smart defaults (AKC, the host
club, the time zone and herself as secretary all prefilled, a live "5 items
remaining" counter), one trial, three classes with a judge each, a review step
that reads "ready with 1 trial and 3 classes". She then found every other area's
affordance: Add Entry, the Members wall, Reports, Fees, the Message Center
composer (stopped at Send), the Waitlist controls, People at show, Self check-in,
Results and the Close out page. The stumbles: the cockpit told her **"Judge not
set"** on every class for more than two minutes after she had just assigned one
(F56); **Publish Show** was offered and then refused by a toast because the
fixture club is not authorized on staging (F62, fixture state the 2026-10-23
club-admin walk already recorded); and the Members wall told her her club access
"needs to be configured" (F63), which is not what is wrong.

**Could a repeat secretary handle a busy show day efficiently?**
**Largely yes.** The show is two clicks from the landing page; the mail-in entry
on a show whose entries closed a week earlier took five steps and priced itself
at the day-of fee; check-in, class change, pull and armband correction are each
one or two taps with an Undo toast; the class change has a real **Move back**
that carries the check-in, and the Financial Report nets the pair to one entry;
all 37 report ids render on both shows with no `NaN`, no console error and no
failed request. The costs: undoing a pull leaves the dog's check-in reading
**Pulled** (F59), the Show Catalog prints "Interior Novice" for a Novice A and a
Novice B class alike (F60), the two AKC after-show reports ask her to fill in
the chair and secretary she already named (F61), and the delete dialog's
"Cancel show" link is a dead end (F58).

---

## Severity

|     | Meaning                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Blocks a secretary from completing a required task, states something false about money or entries on a show-day surface, or is a regression of a Done finding (walk rule). |
| P2  | Task completable, but with real friction, a trap, or misleading information.                                                                                               |
| P3  | Polish, copy, accessibility, or developer-experience.                                                                                                                      |

---

## Commits since the prior walk that touch the secretary's surface

787 commits in `d37efefa1..0ee3c4192` under the walked paths. The ones that
reshaped what this walk touches, walked first and hardest:

- `95899a2b3` Show Settings' cards moved into the Edit show details panel; the unlinked page deleted (MYK9-1296). Teardown path changed (see Prompt corrections).
- `c882fe25e` trial pipeline page and per-class secretary dashboard deleted (MYK9-1297).
- `2f3a188e8` the trial page is a door into the workbench; trial financials move to Reports (MYK9-1320).
- `e26b5b230` / `855009bd3` / `ca1af9bef` Select classes is a mode of the schedule; change a class's judge from the selected-class panel; write the judge onto the local class row (MYK9-1324 / 1323 / 1327). F56 sits next to these.
- `fb72cbef7` Change class offers every open class in the show (MYK9-1265). Verified.
- `381556fd0` one Add Entry for the secretary (MYK9-1242). Verified.
- `d0439c038` the move-up action is "Change class" on every surface (MYK9-1232). Verified.
- `66f1ebf3f` / `3ba118435` / `7c88ab310` release a class with one tap; Finish the show row with Submit to AKC and Close the show (MYK9-1264 / 1263 / 1318). Found by both personas.
- `c8da0e6c5` read a move-up's status from its money root (MYK9-639). Verified on the Financial Report.
- `d6d256976` the day-of-show fee switches at midnight in the show's time zone (MYK9-1198). Verified: $35 on the in-progress show.
- `1cb8204da` the Reports header explains the printed mark (MYK9-1294). Seen.
- `230563f46` / `0c2ed17d0` the rail shows a secretary's current show; a Managing section heads the Shows list (MYK9-1269 / 1270). Used by both personas.
- `21fada640` every secretary show card says when and where (MYK9-1277). Verified on the dashboard; the Switch show flyout did not get it (F64).
- `49b2b0639` seeded shows close entries before they start (MYK9-1281). Five same-named show-day fixtures are still live (observation).
- `965c59000` (before the window's start, cited by MYK9-643) 44px default controls, no sideways scroll at 150% zoom. Partly holds; see F57.
- `8c7b828a8` / `195eedcaa` drop `entries.promo_code_id` and the `promo_codes` table. No surface walked read them.

---

## Coverage

**Registry for this run: AKC (Scent Work).** Registry-specific checks live on rows
1, 4 and 7. A blocked or not-exercised cell is a coverage gap, not a pass.

| #   | Task area           | Registry check                                                                                                                                                                                                                                                                                                                                                                                     | Beginner (1440×900)                                                                                                                                                                  | Experienced (1440×900)                                                                                                                            |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Show setup / wizard | **AKC — done.** Organization `AKC (American Kennel Club)` on step 1 (options AKC / UKC / ASCA); Trial Type `Scent Work` on step 2. SQL after creation: `shows.organization = 'AKC'`, the one trial `registry_id = 'AKC'`, `trial_type = 'Scent Work'`, `timezone = 'America/Chicago'`. `club_id` = Heartland. 2 `show_officials` rows (chairman, secretary), **0** `user_roles` rows for the show. | completed; **publishing blocked** (host club `authorized_at IS NULL` on staging — fixture state, not a defect; F62 is the copy)                                                      | not applicable by design (the show is created once)                                                                                               |
| 2   | Entries             | —                                                                                                                                                                                                                                                                                                                                                                                                  | walked read-only by design (cold-replica Entry Forms on the demo show; Add Entry found on the walk show)                                                                             | completed: mail-in entry after close, check-in + undo, Change class + Move back, Pull + Accept, armband 100→207→100; run order n/a (1 entry)      |
| 3   | Permissions         | —                                                                                                                                                                                                                                                                                                                                                                                                  | wall found and read (F63); **appoint–revoke cycle blocked by the harness** (the auto-mode permission classifier refused the appoint step as a permission grant; nothing was granted) | walked read-only by design (Show Access tab read in the `testadmin@` context: one appointed secretary, the only-secretary warning present)        |
| 4   | Reports             | **AKC — done.** Walk-show catalog = 25 = 17 generic + 8 AKC, no UKC or ASCA form; demo-show catalog = 25 likewise. The AKC Scent Work Entry Form renders on both shows, prints the walk show's named secretary as the mail-to address, the dog's AKC number with the AKC box ticked, and never `NaN`. Deep-linked foreign forms say they belong to another registry (the deliberate fallback).     | completed (one report, Show Catalog, opened by label from the report list)                                                                                                           | completed (37 ids × 2 shows = 74 renders; 0 `NaN`, 0 console errors, 0 failed requests)                                                           |
| 5   | Money               | —                                                                                                                                                                                                                                                                                                                                                                                                  | completed (Fees tab: $30 / $35, armband start 100, payment methods)                                                                                                                  | completed (receipt $35.00 = `entries.entry_fee` = `enrollments.total_amount` 3500; "Paid by check"; Financial Report 1 entry $35; Paid menu read) |
| 6   | Messages            | —                                                                                                                                                                                                                                                                                                                                                                                                  | completed (Message Center → Compose, scoped to the walk show, stopped at "Send message")                                                                                             | walked read-only by design (Communication History via "Open full view"; Any show filter)                                                          |
| 7   | Waitlist / classes  | **AKC — done.** Wizard step 3 offered exactly the 26 classes in `sport_class_rules` for the AKC template, no more and no fewer; Buried and Detective offered, as AKC requires.                                                                                                                                                                                                                     | completed (Edit class panel: entry limit, Allow wait list, "Manage the queue under Entries, then Waitlist")                                                                          | completed (Entry Forms → Show → Waitlist: judge-day capacity card with the JUDGE heading, 1 / 125, Save limit)                                    |

Plus, for both personas: the show-day path. Beginner found People at show,
Self check-in, the Results tab's "Finish the show" row (Submit to AKC / Close the
show) and the Close out page, and fired none. Experienced checked in, changed
class, pulled and corrected on the one entry it created, each undone.

**Viewports.** Desktop 1440×900 for both passes. Mobile 390×844 and 150% zoom
(260px CSS width) for the beginner's accessibility checks. Tablet 768×1024 for
the experienced pass. Only desktop is walked by both personas, so only desktop
supports a persona comparison; findings seen solely at 390×844 or 768×1024 are
labelled viewport-specific.

**Timing (measured, not compared).** Beginner desktop pass 06:12:08 → 06:35:40 UTC
(23.5 min, plus the mobile probe in its own context). Experienced pass 06:36:36 →
07:10:08 UTC (33.5 min, including two report sweeps and the teardown). The task
mixes differ, so no persona timing claim is made. Individual actions: find the
show from the landing page 6.3 s (two clicks); Add Entry open 1.5 s; submit
entry 4.0 s; check-in 4.7 s over four steps; Change class 3.0 s; Pull one click;
show delete 3.5 s.

**Personas, as written down before each pass.**

_Beginner_ — a retired, first-time club secretary. Goal: set up and run one
AKC show. Starting state: the signed-out landing page. Done: a show with
classes created, a report opened, and every other area's affordance located;
publishing if the app allows it. Outside help: guessed routes, `?report=` /
`?focus=` / `?tab=` as a way of getting somewhere, any affordance the persona
could not see. Navigated by visible labels throughout; the one `?tool=` and
`?focus=` parameters in URLs were set by the app's own links.

_Experienced_ — a repeat secretary on a busy show day. Goal: process entries
fast. Starting state: the signed-in landing page, in a fresh browser context
(cookies and localStorage from the saved session, no IndexedDB). Done: a mail-in
entry added after close, check-in / class change / pull / correction performed
and undone, the full report sweep, fees and receipts read. Workaround: any step
needing knowledge the app did not put on screen. The sweep used `?report=`
deep links, as the prompt allows for this pass.

---

## Findings

### F56 — P2 — NEW — [MYK9-1382](https://linear.app/myk9-platform/issue/MYK9-1382) — Cockpit reads "Judge not set" on every class right after the wizard assigned judges

Persona × viewport: beginner × desktop. The experienced pass arrived after a
reload and never saw it.

The Review step read "Classes with a Judge 3/3" and "Judge: Pat Donovan" on all
three classes; `judge_assignments` held three `confirmed` rows the moment the
show existed. **Review & Publish Show** landed on `/shows/:id?focus=<classId>`
reading "Judge not set" on every schedule row and "Unassigned" in the focused
class's Judge control, and stayed that way through three further reads over
more than two minutes. After a reload every row read "Pat Donovan".

MYK9-1327 (#3215, Done two days before this run) made judge changes from the
selected-class panel land on the local class row. The wizard writes classes
through a different path, and the replica's class rows carry no judge until the
next full sync. INTENT § Setting up a show: "the software already knows what I
need". A first-timer will re-assign or stop trusting the review step.

### F57 — P1 (walk rule; scorecard impact P2) — REGRESSED — [MYK9-643](https://linear.app/myk9-platform/issue/MYK9-643) reopened — Sub-44px controls on Reports and Entry Forms persist, and the Draft pill that is the only route to Publish is 20px tall

Persona × viewport: measured in the beginner's 390×844 context and the
experienced pass's 768×1024 context; the Draft pill is 53×20 at 1440×900 too.

MYK9-643 (Done, #2445 "44px default controls, no sideways scroll at 150% zoom")
listed the Reports pickers at 294×40 and `Select all on page` at 16×16. Both
measure the same today: the three Reports selects 294×40 at 390 and 160/200/160×40
at 768; the select-all checkbox 16×16. New in the same class: the `Draft` status
pill is a 53×20 menu trigger whose one item, **Publish Show**, is the only route
to publishing; the `premium list not yet published` pill is 224×20; `Set start
time` 77×32; Entry Forms pagination 96×32 / 68×32. At 150% zoom the two routes the
issue named are fixed (wizard and Entry Forms `scrollWidth` 260), but
`/shows/:id/reports` now scrolls sideways (288 > 260). What did hold: every
wizard step-1 control the issue listed now clears 44px, as do the dashboard's
primary actions.

Rated P1 because the walk's rule says a Done finding that does not hold is P1
regardless of original severity; on the scorecard alone these are P2. Filed as a
comment on the canonical issue and the issue reopened at Urgent, not as a
duplicate.

_Harness known-answer check, printed with the findings:_ the 44×44 header
Actions trigger was not reported by the probe on any route.

### F58 — P2 — NEW — [MYK9-1383](https://linear.app/myk9-platform/issue/MYK9-1383) — The delete-show dialog's "Cancel show" link lands on the Managing list, where nothing cancels a show

Persona × viewport: experienced × desktop.

With one paid entry on the show, `Delete the show …?` correctly refused: "1 entry
is paid. Cancel the show instead of deleting it.", Delete show disabled, a
**Cancel show** link. Its `href` is `/shows?tab=managing`; the page it lands on
has no cancel control of any kind. The cancel that exists is Actions → Edit show
→ Status → "Cancelled", which the dialog does not mention. The guard is right;
the way out is a dead end on a money decision. Same class as MYK9-1024 on the
entry dialog.

### F59 — P2 — NEW — [MYK9-1384](https://linear.app/myk9-platform/issue/MYK9-1384) — Un-pulling an entry leaves `check_in_status = pulled`

Persona × viewport: experienced × desktop.

Entry Forms → status → **Pull** on a checked-in entry: one click, no confirm,
"Status updated · Undo", row reads "Pulled · refund at the club's discretion";
SQL `entry_status = scratched`, `check_in_status = pulled`. Same menu → **Accept**:
row reads Accepted, the acceptance-email composer opens (dismissed with "Not
now"); SQL `entry_status = confirmed`, `check_in_status` still `pulled`. The class
page's check-in combobox read Pulled and readiness "0 of 1 checked in" until reset
by hand. INTENT § Say Which Act Happened calls the day-of pull "a different
column"; Entry Forms' Pull writes it and Accept does not restore it.

### F60 — P2 — NEW — [MYK9-1385](https://linear.app/myk9-platform/issue/MYK9-1385) — Show Catalog and the Change class dialog drop the A/B section

Persona × viewport: experienced × desktop.

The demo show's Show Catalog prints `Container Novice` and `Interior Novice` for
entries in Container Novice A and Interior Novice B; "Novice A" and "Novice B"
occur nowhere in its text. The walk show's entry in Interior Novice A printed
`Interior Novice`. The Change class dialog reads "Current class: Interior Novice"
for the same entry. The marked Result Catalog is correct ("Interior Novice A").
Novice A and B are different AKC classes; the catalog is official paperwork.
Sibling of MYK9-489 and MYK9-825.

### F61 — P2 — NEW — [MYK9-1386](https://linear.app/myk9-platform/issue/MYK9-1386) — AKC Trial Chair's Report and Trial Secretary Report ignore the show's named officials

Persona × viewport: experienced × desktop.

On the walk show (chairman Alex Whitfield and secretary Jordan Ellis in
`show_officials`), the Trial Chair's Report prints `Chair Name: ____` and raises
"Fill before submitting: Trial Chair"; the Trial Secretary Report raises "Fill
before submitting: Trial Secretary" and has no secretary name field at all. The
AKC Scent Work Entry Form on the same show does read `show_officials` ("Entries
should be sent to: Jordan Ellis"). The secretary named both officials in the
wizard and is told on the after-show forms they are missing.

### F62 — P3 — NEW — [MYK9-1387](https://linear.app/myk9-platform/issue/MYK9-1387) — "Publish Show" is offered on a show whose club is unauthorized, then refused only by a toast

Persona × viewport: beginner × desktop.

The Draft pill's one menu item, Publish Show, is enabled; clicking it toasts
"This club hasn't been authorized by myK9 yet. Shows can be built now and
published once the club is approved." and nothing else changes. The gate is by
design (MYK9-572 / MYK9-887); the copy is good; the item should carry the reason
and stay disabled, as the header Actions menu already does for its items.

The underlying state is fixture: Heartland Scent Work Club has `authorized_at
IS NULL` while `authorized_by` is set and ten published shows belong to it. The
2026-10-23 club-admin walk recorded this and asked whether the fixture club
should be seeded authorized. This walk's publishing cell is blocked on that
decision, not on the app.

### F63 — P3 — NEW — [MYK9-1388](https://linear.app/myk9-platform/issue/MYK9-1388) — The Members wall says "club access needs to be configured" because of grants to deleted clubs

Persona × viewport: beginner × desktop. Supersedes F53 (MYK9-644), whose fix is
in the code but is never reached for this account.

`/club-admin/members` as the secretary renders, as the whole body, "Your club
access needs to be configured before you can manage members." No link back, no
word on who can. `secretary@myk9t.com` holds three active `club_admin` grants to
clubs soft-deleted on 2026-10-01 and 2026-10-08 (two `ZZ Test Club` rows and an
"Actions walk … CLUB" fixture), so the club-context resolver reports `missing`
rather than `not-applicable`, and the F53 sentence ("You need club administrator
access …") never renders. Two defects in one: club soft-delete leaves its
`club_admin` grants active (F30's soft-delete half), and the gate counts a grant to
a deleted club as a configured scope.

### F64 — P3 — NEW — [MYK9-1389](https://linear.app/myk9-platform/issue/MYK9-1389) — The Switch show flyout lists shows by name only

Persona × viewport: experienced × desktop.

Nine bare names, four of them `Heartland Scent Work Week`. The dashboard cards
and the Managing list carry the date range since MYK9-1277; the switcher does
not. The four are show-day walk fixtures (MYK9-1281 recurrence, filed by the
2026-10-23 show-day walk), but a club can host same-named shows in different
years.

### F65 — P3 — NEW — [MYK9-1390](https://linear.app/myk9-platform/issue/MYK9-1390) — Three "View entries and results" links, two destinations

Persona × viewport: experienced × desktop.

On a focused class with an entry, three links share the accessible name "View
entries and results": two go to the Results tab, one to the class page where the
check-in control lives. The probe's strict-mode failure found it; a secretary
looking for check-in has a two-in-three chance of landing on Results.

### F66 — P3 — NEW — [MYK9-1391](https://linear.app/myk9-platform/issue/MYK9-1391) — Tab count badges render at 10px

Persona × viewport: **viewport-specific**, measured at 390×844 (beginner). The
only app string below the 14px floor on the five routes probed: the `0` in
"Entry Forms 0" / "Results 0". Everything else cleared 14px; the Leaflet
attribution at 12px is third-party chrome.

### F67 — P3 — NEW — not filed (observed once, low confidence) — Entry Forms detail still read "Fee: $35 (Paid: $35)" right after Payment Due was chosen

Persona × viewport: experienced × desktop. During teardown, Paid → Reset →
**Payment Due** on the run's own entry; the detail panel's fee line still read
"(Paid: $35)" when read 1.2 s later, while the delete dialog opened seconds after
no longer said "1 entry is paid" and SQL read `enrollments.payment_status =
pending`, `paid_amount = 0`. Not re-measured, so recorded here only.

---

## Regression re-verification

Re-walked in the browser (and SQL where the finding is a value).

| Finding                                                | Verdict                         | Evidence                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MYK9-636** (`show_announcements` INSERT unscoped)    | **Holds (fixed)**               | `pg_policies` INSERT `with_check` now requires `is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)` on the show, or a confirmed/invited judge assignment on it, or platform admin.                                                                                             |
| **MYK9-637** (Ringside `0 / 0`)                        | **Holds**                       | `/at-show/<walk>` read `Interior Novice A … 0 / 1 · 0 of 1 scored` on six samples over 18 s; the two empty classes read `0 of 0`.                                                                                                                                                     |
| **MYK9-639** (move-up books a phantom waived entry)    | **Holds**                       | After Change class, the destination row was `pending` / $0.00 with `moved_from_entry_id` set, not `waived`; Financial Report read `ENTRIES 1 · GROSS $35.00 · COLLECTED $35.00`, one `Check` line.                                                                                    |
| **MYK9-640** (move-up irreversible, drops check-in)    | **Holds**                       | The destination's Change class dialog offers **Move back to Interior Novice A** ("restores the original entry, with its check-in, and removes this one"). After it, the source was `confirmed` / `checked-in` (the destination had been checked in) and the destination soft-deleted. |
| **MYK9-641** (composer does not inherit the show)      | **Holds**                       | Compose opened from the walk show's page read "Show: ZZ Walk 2026-10-24 0105 AKC - teardown me" with no picker.                                                                                                                                                                       |
| **MYK9-642** (day-of entry stored as pre-entry)        | **Holds**                       | Mail-in entry on the in-progress show, entries closed Oct 17: offered and charged $35, `entries.is_day_of_show = true`.                                                                                                                                                               |
| **MYK9-643** (150% zoom overflow; 40px controls)       | **REGRESSED** → F57             | See F57. Wizard and Entry Forms overflow fixed; Reports selects 40px, select-all 16×16 unchanged; Draft pill 20px; Reports overflows at 260px.                                                                                                                                        |
| **MYK9-644** F50 ("1 trials")                          | **Resolved**                    | Review reads "ready with 1 trial and 3 classes".                                                                                                                                                                                                                                      |
| **MYK9-644** F51 ("Unknown Dog" in the delete dialog)  | **Resolved by redesign**        | The dialog now enumerates counts ("1 trial, 3 classes and 1 entry"), not names.                                                                                                                                                                                                       |
| **MYK9-644** F52 (pre-entry fee on a day-of show)      | **Resolved**                    | Class page reads `Entry Fee $35.00` on the in-progress show.                                                                                                                                                                                                                          |
| **MYK9-644** F53 (bare permission wall)                | **Changed, not resolved** → F63 | The `not-applicable` sentence exists in code; this account takes the `missing` branch because of grants to deleted clubs.                                                                                                                                                             |
| **MYK9-284** (revoke without confirm)                  | **Not exercised**               | The appoint–revoke cycle was blocked by the harness (see row 3). The Show Access tab's "only appointed secretary … Appoint someone else before revoking them" warning is present. Blocked, not a pass.                                                                                |
| **MYK9-285** (delete claims permanence)                | **Holds**                       | Dialog: "You can undo this for 10 minutes. After that, ask a myK9 administrator to restore it."; toast "Show deleted … Undo".                                                                                                                                                         |
| **MYK9-286** (`/shows/new` errors)                     | **Holds**                       | `/shows/new` redirected to `/secretary/create-show/wizard`, heading "Add Show".                                                                                                                                                                                                       |
| **MYK9-283** (Check-in Sheet false zero)               | **Holds**                       | Cold-replica Entry Forms on the demo show rendered 3 of 10 forms within 4 s and never an empty state over 30 s; Overview pauses counts with "Entry counts are loading … so this page does not show a false zero-entry state"; 0 false empties in 74 report renders.                   |
| **MYK9-282** (`Trial NaN`)                             | **Holds**                       | 0 occurrences of `NaN` across 74 renders, frame and outer document.                                                                                                                                                                                                                   |
| **MYK9-280** (AKC entry form unreachable)              | **Holds**                       | Renders 28,206 characters on the demo show, 3,898 on the walk show.                                                                                                                                                                                                                   |
| **MYK9-448 / MYK9-447**                                | **Not applicable this week**    | AKC week. The AKC-side scoping check passed (25 = 17 + 8 on both shows).                                                                                                                                                                                                              |
| **F14** (mail-in dead-ends after close)                | **Holds**                       | Five-step Add Entry completed on a show whose entries closed seven days earlier.                                                                                                                                                                                                      |
| **F15** (blank day-of fee charges $0)                  | **Holds**                       | $35 offered, charged and stored.                                                                                                                                                                                                                                                      |
| **F16** (check number and date discarded)              | **Holds**                       | `enrollments.payment_reference = WALK-0105-CHK-4471`, `payment_date = 2026-10-24`, notes stored; Entry Forms shows the reference. The `entries`-level reference columns are NULL on this path, as on 2026-09-17.                                                                      |
| **F18** ("Paid online" for every channel)              | **Holds**                       | "Paid by check" / "Paid"; 0 occurrences of "Paid online".                                                                                                                                                                                                                             |
| **F19** (filter chips hide selected state)             | **Surface replaced**            | The chips are now a `Show:` menu with `menuitemcheckbox` / `menuitemradio` items carrying checked state. Not re-filable as F19.                                                                                                                                                       |
| **F20** (waitlist cards headed by the judge)           | **Holds**                       | Card reads "Judge Pat Donovan" with the judge-day capacity below it.                                                                                                                                                                                                                  |
| **F22** (Messages is history-only)                     | **Nuanced, unchanged**          | `/secretary/messages` is Communication History with no compose control; Compose is behind the header's Message Center, which also offers "Open full view" to the history page.                                                                                                        |
| **F29b** (run order unreachable)                       | **Holds (by design)**           | Run order absent with one entry; `ShowMapRunOrderMenu` returns null below 2.                                                                                                                                                                                                          |
| **F40** (club-less `ZZ Audit` shows)                   | **Resolved**                    | 0 shows named `ZZ Audit%` remain.                                                                                                                                                                                                                                                     |
| **F54** (success panel over a blank wizard)            | **Unchanged**                   | "Show Created!" with the access codes sits on top of Step 1 of 4 of an empty form.                                                                                                                                                                                                    |
| **F55** / **F8** (pickers expose every person's email) | **Unchanged**                   | The wizard Chair picker's All People section and the Appoint Secretary dialog's list ("Showing the first 20 of 70") both show names with email addresses, including real non-seeded accounts. Not quoted.                                                                             |

**Not reached:** F3–F7, F9–F13, F17, F21, F24 (the history filter's options were not enumerated), F25–F28, F31–F35, F38 (no revoke happened).

---

## Corrections to my own measurement

- **The Reports picker is not a select any more.** My first beginner probe read the trial selector's options and called the catalog option absent. The catalog is a categorised list of report buttons (During the show / After the show / Before the show / Anytime); the beginner opened Show Catalog by its button label.
- **"Check in all eligible" is what my regex clicked**, not the per-entry "Check in". On this show the two are the same single entry; on a populated show the difference matters. Recorded as a harness note, not a finding.
- **A 34-second Move back was my own snapshot** waiting out its 30 s timeout on a dialog that had already closed. The dialog closed within the first second.
- **The Blob hook recorded nothing.** The `URL.createObjectURL` wrapper from the 2026-09-17 mechanics captured no blobs this run. The sizes below come from the iframe's `blob:` `src` read through the page's pre-patch `fetch`, saved by the init script before the offline queue patches it.
- **The first "Accepted" undo locator missed** because the post-pull menu says "Accept", not "Accepted". Not a defect.
- **"Received as" is a real required step**, not missing feedback: submitting without it raised a visible alert "Choose whether the payment was received as cash or check."

---

## Report sweep, in full

74 renders (37 ids × 2 shows), 0 `NaN`, 0 console errors, 0 failed requests.

**Demo show `dededede-…010` (AKC, lean seed: 13 entries), 25 reports in the catalog, all render.** Entry-dependent reports render content (Show Catalog 910 chars, Result Catalog 1,887, Financial Report 1,084). Completeness alerts: AKC Scent Work Entry Form "Telephone, Signature"; Trial Secretary Report "Trial Secretary"; Trial Chairman Report "Trial Chair"; Judge's Report "Location, Judge Email" (the demo show has no `show_officials` rows, so those are correct there).

**Walk show (AKC, 1 entry), 25 reports.** Entry-dependent reports render the one entry or their empty state. The AKC Scent Work Entry Form prints the named secretary as the mail-to, the dog's AKC number with the AKC box ticked, the owner and the agreement; its alert reads "Signature" only. The Financial Report nets one entry at $35 after the class change and its reversal. The Trial Secretary Report's `$4.50 per run × 1 paid runs` and the Secretary's Certification's "1 Total Entries" agree.

**Deep-linked UKC and ASCA forms on an AKC show** render the download-only panel with "This form belongs to a different registry than the trial you have selected, so there is nothing to download." No download fired; this is the documented fallback, not MYK9-448.

**PDF blob sizes (lean seed; the 63-entry calibration skipped because the load fixture is not applied):**

| Report         | Class                               | Bytes | Prior range           |
| -------------- | ----------------------------------- | ----- | --------------------- |
| Check-in Sheet | demo Container Novice A (3 entries) | 4,130 | ~4.2 KB on 2026-09-17 |
| Score Sheet    | demo Container Novice A (3 entries) | 4,840 | —                     |
| Check-in Sheet | walk Interior Novice A (1 entry)    | 3,895 | 3,958 on 2026-09-17   |
| Score Sheet    | walk Interior Novice A (1 entry)    | 4,182 | 4,425 on 2026-09-17   |

No download-only form applies on an AKC week, so no PDF text extraction was needed. Headless Chromium saved the blob-PDF iframes as downloads into the run's gitignored output directories; all were deleted at teardown and none is committed.

---

## Registry checks, in full

**Task 1 — the show and its trials carry the same registry.** SQL after creation: `shows.organization = 'AKC'`, the one trial `registry_id = 'AKC'`, `trial_type = 'Scent Work'`, `event_number = 2026123401`, `timezone = America/Chicago`.

**Task 7 — the wizard offered exactly the live rules.** Step 3 rendered 32 `role=checkbox` nodes: 6 "Select all <element>" group controls plus **26** class checkboxes, against 26 rows in `sport_class_rules` joined to the AKC template at run time:

| Element                | Levels offered                                  | Count  | Rules  |
| ---------------------- | ----------------------------------------------- | ------ | ------ |
| Container              | Novice A, Novice B, Advanced, Excellent, Master | 5      | 5      |
| Interior               | same                                            | 5      | 5      |
| Exterior               | same                                            | 5      | 5      |
| Buried                 | same                                            | 5      | 5      |
| Handler Discrimination | same                                            | 5      | 5      |
| Detective              | (one class)                                     | 1      | 1      |
|                        |                                                 | **26** | **26** |

Exact match both ways. Buried and Detective are present, as AKC requires. No template picker appeared, which is correct with one matching template.

**Task 4 — the catalog is registry-scoped.** With a trial selected and no `?report=`: walk show 25 = 17 generic + 8 AKC; demo show 25 likewise; zero UKC or ASCA forms on either.

---

## Canary candidates

Assertions only, for the staging canary suite (MYK9-730).

- `/shows/<walk>?focus=<classId>` as `secretary@`, in a context that has never loaded the show, within 5 s of the wizard's Review & Publish Show: no schedule row reads "Judge not set" when `judge_assignments` has a confirmed row for that class. (F56)
- `/shows/<demo>/reports?report=show-catalog` as `secretary@`: for every entry whose class has a section, the CLASS column contains "Novice A" or "Novice B", never a bare "Novice". (F60)
- `/shows/<show-with-officials>/reports?report=trial-chairman-report`: the frame text does not contain `Chair Name: ____` when `show_officials` has a chairman row; the header carries no "Fill before submitting: Trial Chair". (F61)
- After Entry Forms → Pull → Accept on an entry whose `check_in_status` was `checked-in`: `check_in_status <> 'pulled'`. (F59)
- Delete-show dialog on a show with a paid entry: the "Cancel show" link's target page contains a control that sets the show Cancelled. (F58)
- `/shows/<id>/reports` at 390×844 and 768×1024: no `combobox` in the Reports panel measures under 44px tall; `document.documentElement.scrollWidth === clientWidth` at 260px. The `Draft` status button measures at least 44px tall. (F57)
- `/at-show/<show>` as `secretary@`: a class whose SQL entry count is N > 0 never reads `0 / 0`. (MYK9-637, holds)
- After Change class then Move back on a checked-in entry: exactly one live entry for the dog, `check_in_status = checked-in`, and the Financial Report's ENTRIES = 1. (MYK9-639 / 640, hold)
- Mail-in entry on an in-progress show after entry close: `entries.is_day_of_show = true` and `entry_fee = shows.day_of_show_fee`. (MYK9-642, holds)
- `pg_policies` for `show_announcements` INSERT: `with_check` references `is_trial_secretary` and `is_club_admin`. (MYK9-636, holds)
- Message Center → Compose from `/shows/<id>`: the Show field reads that show's name with no picker. (MYK9-641, holds)
- Cold context, `/shows/<demo>/entries`: the status line reads `Showing N of M forms` with N > 0 within 10 s and never "No entries yet" while SQL has entries. (MYK9-283, holds)

---

## Prompt corrections

**Above the `# Part 2` line — listed only; a human changes these through a PR:**

- Task 1 says the teardown path is Actions → **Edit show details**. The menu item is labelled **Edit show** (the panel's heading is "Edit Show"); the Delete show button is at the panel's foot as described. Not applied: it is above the line.
- Task 1 says delete "soft-deletes the show and cascades". True, but the confirm dialog **refuses while any entry on the show is paid** ("Cancel the show instead of deleting it"). A run that records a payment on its mail-in entry must reset that payment to **Payment Due** (entry's Paid menu → Reset) before teardown, or the show cannot be deleted through the UI. This run did so on its own entry; the mechanics are recorded in Part 2.
- The Personas section says the report picker "exposes `role=option` nodes (verified 2026-09-17), so the beginner reaches Reports by its label and opens a report from the dropdown". The picker is now a categorised list of report **buttons**; the beginner opens a report by its button label. The `role=option` fallback sentence is stale.
- Task 3 says `secretary@myk9t.com` at `/club-admin/members` "renders 'You don't have permission to access this page.'" It now renders "Your club access needs to be configured before you can manage members." for this account (F63). The gate is the same; the copy and its cause differ.
- Task 3's appoint–revoke cycle was refused by the harness's auto-mode permission classifier ("Permission Grant") when the step was posted. The job text is right; the note that matters for the next run is in Part 2.
- Task 2 says the mail-in entry is "entered under its `dog_registrations` row for this week's registry". The entry row's `registration_id` is NULL on this path (86 of 110 live entries carry one; the staff Add Entry path does not set it). The reports resolve the number from the dog's registrations, so the AKC form printed the right number; whether `registration_id` should be set here is a question for the owner, not a prompt error.

**Below the line — applied in this commit to `docs/qa/walks/secretary-task-walk.md`:**

- Routes: Entry Management is the **Entry Forms** tab at `/shows/:id/entries`; the Show Desk route is gone, the Overview cockpit at `/shows/:id?focus=<classId>` holds the focused class, People at show is the Actions-menu tool at `?tool=people-at-show`, Self check-in at `?tool=self-checkin`; `/secretary/messages` is Communication History, reached from Message Center → Open full view.
- Reports: the picker is a list of report buttons grouped During / After / Before / Anytime; `?report=` still works; the trial, class and run-order selects are the only comboboxes.
- Check-in: People at show → expand the exhibitor → "Check in" (per entry) or "Check in all eligible"; the undo is the class page's `Check-in status for <dog>` combobox → "No Status". Pull from Entry Forms sets `check_in_status = pulled` (F59).
- Change class: focused class → "Can change class" → `Change class — #<armband> <dog>`; the destination's dialog carries "Move back to <class>".
- Add Entry: Entry Forms → Add Entry → five steps; "Secretary Payment (Already Received)" needs a "Received as" choice (Cash / Check) before Submit.
- Teardown: Actions → Edit show → Delete show; the confirm dialog names the show, refuses while an entry is paid, and offers a 10-minute Undo toast after.
- Blob measurement: save `window.fetch` in `addInitScript` before the app patches it and read the iframe's `blob:` `src` through it; the `URL.createObjectURL` hook recorded nothing this run. Current sizes recorded.
- Fixtures: Heartland is unauthorized on staging (publish blocked); `secretary@` holds three active `club_admin` grants to soft-deleted clubs; five same-named `Heartland Scent Work Week` shows are live; the demo show carries two classes named Interior Advanced in Trial 1 (one completed, one upcoming), both with 2 entries.
- Harness: the auto-mode classifier refuses a step whose filename or body reads as a permission grant, and the worktree guard refuses heredocs, `&&` chains and any URL path containing `eval`; post step files to a neutral path.
- Open issues to re-verify and the regression list updated for this run.

---

## State left behind

**Restored to baseline, with the declared exceptions.**

- The walk show, its 1 trial, 3 classes and 2 entries (the original and the soft-deleted move-up destination) are all soft-deleted (`deleted_at` set on 1/1, 1/1, 3/3, 2/2). Zero live shows match `ZZ Walk%`. The delete was performed through Actions → Edit show → Delete show, confirmed inside the alert dialog that names the show, after SQL asserted exactly one live show matched the run's full name.
- The run's own payment record was reset to Payment Due through the entry's Paid menu before the delete (the dialog refuses while an entry is paid); `enrollments.payment_status = pending`, `paid_amount = 0` on the soft-deleted enrollment.
- **No appointment was made** (the appoint step was refused by the harness), so nothing was revoked. Active role counts before and after: judge 3, site_admin 3, secretary 6, chairman 2, steward 3, exhibitor 12, club_admin 12. `permission_audit_log` 17 rows before and after.
- **0 `dogs` rows and 0 `dog_registrations` rows were created, edited or deleted** (both tables: 0 rows with `updated_at` inside the three-hour window).
- Entry edits undone through the UI: check-in → No Status; class change → Move back; Pull → Accept (leaving `check_in_status = pulled`, F59, then reset to No Status by hand); armband 100 → 207 → 100. No message or announcement was sent; the acceptance email was dismissed with "Not now".
- Browser downloads (the headless-saved blob PDFs) deleted; nothing committed. Dev server on port 5199 stopped; six browser contexts closed.

**Declared residue that teardown cannot remove:** the show delete is soft; 2 `show_officials` rows, 3 `judge_assignments` rows and 4 `entry_status_history` rows for the deleted show persist (none of those tables carries `deleted_at`). No `permission_audit_log` rows were added this run.

No source edits, no migrations, no deploys. Repo writes: this file and the Part 2 half of `docs/qa/walks/secretary-task-walk.md`.

---

## Filed

| Finding | Issue                                                         | Priority | Notes                                                          |
| ------- | ------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| F57     | [MYK9-643](https://linear.app/myk9-platform/issue/MYK9-643)   | Urgent   | Reopened (Backlog) with the regression comment; not duplicated |
| —       | [MYK9-1381](https://linear.app/myk9-platform/issue/MYK9-1381) | Medium   | Parent: Secretary task walk 2026-10-24 — P2/P3 findings        |
| F56     | [MYK9-1382](https://linear.app/myk9-platform/issue/MYK9-1382) | High     | Cockpit "Judge not set" after the wizard until reload          |
| F58     | [MYK9-1383](https://linear.app/myk9-platform/issue/MYK9-1383) | High     | Delete dialog's "Cancel show" link is a dead end               |
| F59     | [MYK9-1384](https://linear.app/myk9-platform/issue/MYK9-1384) | High     | Un-pull leaves `check_in_status = pulled`                      |
| F60     | [MYK9-1385](https://linear.app/myk9-platform/issue/MYK9-1385) | High     | Show Catalog / Change class dialog drop the A/B section        |
| F61     | [MYK9-1386](https://linear.app/myk9-platform/issue/MYK9-1386) | High     | AKC Chair's and Secretary reports ignore named officials       |
| F62     | [MYK9-1387](https://linear.app/myk9-platform/issue/MYK9-1387) | Low      | Publish Show offered, refused by toast                         |
| F63     | [MYK9-1388](https://linear.app/myk9-platform/issue/MYK9-1388) | Low      | Members wall copy via grants to deleted clubs; supersedes F53  |
| F64     | [MYK9-1389](https://linear.app/myk9-platform/issue/MYK9-1389) | Low      | Switch show flyout name-only                                   |
| F65     | [MYK9-1390](https://linear.app/myk9-platform/issue/MYK9-1390) | Low      | Three same-labelled links, two destinations                    |
| F66     | [MYK9-1391](https://linear.app/myk9-platform/issue/MYK9-1391) | Low      | 10px tab badge (viewport-specific)                             |

**Not filed, recorded here only:** F67 (stale fee line, observed once); the
Message Center's eight identical "Wait list offer sent" notifications for one
demo dog over three days (MYK9-1331 residue until the next reseed); the composer
opening with the "Lunch ready" template already in Title and Message with Send
enabled (observed once, cause not isolated); the Officials tab's "To replace
someone already assigned, contact a site admin"; the receipt's blank line where
a dog without a registered name would print one; the demo show's two "Interior
Advanced" classes in Trial 1 and the five live same-named show-day fixtures
(fixture hygiene, already on MYK9-1281's trail).

**Label substitution, as before.** The workspace has `Claude` / `Codex` / `Human Tester` /
`Bug` / `Feature` / `Improvement` / `Test` / `Parked` / `Wait for Launch` plus the
lane and autopilot sets; issues carry `Claude` + `Bug` or `Improvement` and
Linear's priority field.
