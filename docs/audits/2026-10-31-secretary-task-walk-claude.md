# Secretary Task Walk — 2026-10-31

**Prompt version:** `docs/qa/walks/secretary-task-walk.md` read from `origin/main` at `4fcf3b650048c6e21358ac8995504ee1f28c5520`.
**Run token:** `2026-10-31 0605`
**ISO week 44 → 44 mod 3 = 2 → registry UKC, trial type Nosework**
**Walk show:** `ZZ Walk 2026-10-31 0605 UKC - teardown me` (`a187455c-d212-41c4-932f-10e460611530`), created and soft-deleted by this run.
**Baselines:** this run `origin/main` `4fcf3b650`; prior walk (2026-10-24) `0ee3c4192`. 138 commits touch `apps/myk9show/src`, `packages` or `supabase/migrations` in between.

Functional walk of the secretary's task surface against a local dev server on port
5317 serving `origin/main`, in a dedicated worktree, backed by the shared staging
Supabase project. Audit only: no source edits, no migrations, no deploys. The repo
writes are this file and the Part 2 corrections to the walk's own prompt file.

Findings are numbered from the [2026-10-24 walk](2026-10-24-secretary-task-walk-claude.md),
which ended at F67.

Codex's `weekly-secretary-ux-walk`: `status = "PAUSED"`, `rrule = "RRULE:FREQ=WEEKLY;BYDAY=TU;BYHOUR=1;BYMINUTE=30"`.

SQL access: confirmed (`select 1` through the Supabase MCP server before walking).

---

## Headline

**Could a first-time secretary configure and run a show without assistance?**
**Yes, with one trap in the judge picker.** Going by visible labels only, the
beginner found **Add Show** under the header's **Actions** menu (the home page no
longer carries an Add Show link). She built a UKC show in four steps:
Organization UKC, Trial Type Nosework, dates that put the show in progress
today, $30 / $35 fees, a chair, a judge, and two classes. The show was created
in under a second. Publishing is now refused **inside the menu**, with the
reason ("This club hasn't been authorized by myK9 yet…") on a disabled item,
not by a toast (MYK9-1387 fixed). She found every other area's affordance by its
label: Add Entry, the Reports list, Fees in Edit Show, Message Center → Compose
(stopped at "Send message"), the wait-list settings in Edit class, People at
show, Self check-in, the Results tab's "Submit to UKC / Close the show" row, and
the Members wall, which now tells her to ask her club admin. The trap: the
wizard's **Show Judges** list puts a judge with **no UKC qualification** first.
She picked him, and the class panel then calls him "Assigned judge
(unavailable)" (F68). One copy line sends her to an "Entries" area and a
"Waitlist tab" that do not exist by those names (F71).

**Could a repeat secretary handle a busy show day efficiently?**
**Yes.** The show is two clicks from the landing page (1.9 s). A mail-in entry
on a show whose entries closed six days earlier took four Next clicks and
Submit (15.3 s end to end) and priced itself at the $35 day-of fee. Check-in is
one tap in People at show. Change class and **Move back** each take one dialog.
**Pull → Accept now restores the dog's check-in** (MYK9-1384 fixed). The armband
correction is one dialog. All 39 report ids render on both shows with no `NaN`,
no console error and no failed request. Every edit was undone through the UI. The
costs are small: seven reports call a UKC show "UKC Scent Work" (F70), and deep
links to AKC reports open on a UKC show without the different-registry notice
that ASCA forms get (F72).

No P0 or P1 this run.

---

## Severity

|     | Meaning                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Blocks a secretary from completing a required task, states something false about money or entries on a show-day surface, or is a regression of a Done finding (walk rule). |
| P2  | Task completable, but with real friction, a trap, or misleading information.                                                                                               |
| P3  | Polish, copy, accessibility, or developer-experience.                                                                                                                      |

---

## Commits since the prior walk that touch the secretary's surface

138 commits in `0ee3c4192..4fcf3b650` under the walked paths. These reshaped what this walk touches, so they were walked first and hardest:

- `53b9705cf` Home label, one Add path, pin replaces Switch (MYK9-1490). Add Show moved to the Actions menu (walked). The new **Pin** button sits in the row that overflows at 150% zoom (F69).
- `631743ee1` Members and Payments are tabs on the club page (MYK9-1293). Show Access is now `/clubs/:id?tab=members` → inner Show Access tab. The appoint/revoke cycle was walked there.
- `fcce8e8c1` / `f5f8100f0` / `25787b036` one judge per class; every class-judge pick is one `set_class_judge` RPC (MYK9-1466 / MYK9-1327). The wizard's judge assignment wrote one `judge_assignments` row per class. The class panel's registry filter disagrees with the wizard (F68).
- `27d725829` a plain Accept after a Pull restores the dog's earlier check-in (MYK9-1396). Verified in SQL: `pulled` → `checked-in`, `check_in_status_before_pull` cleared.
- `f6f4a6a83` comp never relabels collected money (MYK9-1407). Not exercised (no comp).
- `d24f07205` entry-blank downloads on staff receipts. Seen: the receipt offers "Download Scout — Container Novice A".
- `e12b9b7e1` judge setup cheat sheet for UKC and AKC (MYK9-1078). Both render, and each is in its own registry's catalog. The report count is now 39 (Prompt corrections).
- `fe5ac3fac` permanent show delete only for unused shows (MYK9-1472). The walk's soft delete path still works.
- `0c0ee971b` / `48407cf4b` Show Stats and Results filters; ringside staff reach Results (MYK9-1512 / MYK9-1544). The Results tab rendered "Submit to UKC", which is registry-aware.
- `4d5a839e6` stripe-payment-link role bypass removed (MYK9-1394). Not on a walked path (no card payment).
- Replication changes (`08c01f4fb`, `3803310f4`, `2c17a73bb`, `67337b6a2`): cold-replica Entry Forms on the demo show read 13 entries in all three fresh contexts, matching SQL.

---

## Coverage

**Registry for this run: UKC (Nosework).** Registry-specific checks live on rows 1, 4 and 7. A blocked or not-exercised cell is a coverage gap, not a pass.

| #   | Task area           | Registry check                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Beginner (1440×900)                                                                                                                                                                          | Experienced (1440×900)                                                                                                                                                                    |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Show setup / wizard | **UKC: done.** Organization `UKC (United Kennel Club)` on step 1; step 2's Trial Type defaulted to and was set to `Nosework` (it also offers nine non-scent sports, see Observations). SQL after creation: `shows.organization = 'UKC'`, the one trial `registry_id = 'UKC'`, `trial_type = 'Nosework'`, `timezone = America/Chicago`; `club_id` = Heartland; `show_officials` = secretary + chairman; **0** `user_roles` rows for the show; role counts unchanged. | completed; **publishing blocked** by fixture state (Heartland `authorized_at IS NULL`), now explained in the menu                                                                            | not applicable by design (the show is created once)                                                                                                                                       |
| 2   | Entries             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | walked read-only by design (Add Entry found on the walk show; cold-replica demo Entry Forms read)                                                                                            | completed: mail-in entry after close (Scout, UKC `P0123C855`), check-in + undo, Change class + Move back, check-in → Pull → Accept, armband 100 → 207 → 100; run order n/a (1 entry)      |
| 3   | Permissions         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | completed: secretary wall read; as `testadmin@`, appointed `load-secretary-1@myk9t.com` (no club membership; listed "Not a club member") and revoked exactly that row via the confirm dialog | walked read-only by design (Show Access tab read in the `testadmin@` context before the cycle)                                                                                            |
| 4   | Reports             | **UKC: done.** Walk-show catalog (trial selected, no `?report=`) = 24 = 17 generic + 6 UKC forms + UKC Judge Setup Cheat Sheet; no AKC or ASCA form. MYK9-448: the UKC Nosework Trial Report is in the catalog. Five UKC forms downloaded non-empty; Change Entry Form needs a dog picked first. MYK9-447: the UKC entry packet prints `■ P0123C855`, the permanent-registration box ticked (pypdf 6.14.2).                                                         | completed (Show Catalog opened by label; empty state on a 0-entry show, correct)                                                                                                             | completed (39 ids × 2 shows = 78 renders; 0 `NaN`, 0 console errors, 0 failed requests)                                                                                                   |
| 5   | Money               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | completed (Edit Show → Fees tab: pre-entry, day-of, junior, armband start, payment methods)                                                                                                  | completed: receipt $35.00 = `entries.entry_fee` 35, `payment_method = check`, `is_day_of_show = true`; Financial Report 1 entry, $35 collected, "Paid By Check"; Paid → Payment Due reset |
| 6   | Messages            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | completed (Message Center → Compose, scoped to the walk show, stopped at "Send message")                                                                                                     | walked read-only by design (Communication History via "Open full view": Inbox / Any show filters)                                                                                         |
| 7   | Waitlist / classes  | **UKC: done.** Wizard step 3 offered 48 classes, exactly the 48 rows of `sport_class_rules` for the UKC template: Container, Interior, Exterior, Vehicle × Novice / Advanced / Superior / Master / Elite × A/B; Handler Discrimination × Novice / Advanced / Excellent / Master × A/B. No Buried, no Detective.                                                                                                                                                     | completed (Edit class: entry limit, Allow wait list; its copy points to places that do not exist by those names, F71)                                                                        | completed (Entry Forms → `Show:` → Waitlist: judge-day card, "1 / 125 entries, 124 spots available", Save limit)                                                                          |

Plus the show-day path for both personas. The beginner found People at show,
Self check-in, Access codes, Emergency trial packet, the Results tab's "Submit
to UKC / Close the show" row and **Close out show** in Actions, and fired none
of them. The experienced pass checked in, changed class, pulled and corrected
the one entry it created, and undid each edit.

**Show-day controls the walk show reached** (Draft, unauthorized club, dates
spanning today): People at show check-in, the class page's check-in status
combobox, Change class / Move back, the entry status menu (Pull / Accept), the
armband dialog, and the Results row. Run order did not appear, which is
correct with one entry.

**Viewports.** Desktop 1440×900 for both passes. Mobile 390×844 and 150% zoom
(260px CSS width) for the beginner's checks. Tablet 768×1024 for the experienced
pass. Only desktop is walked by both personas.

**Timing (measured, not compared).** Beginner pass 06:07:33 → 06:26:13 UTC
(18.7 min, including the appoint/revoke cycle and the mobile probes). Experienced
pass 06:26:54 → 06:45:45 UTC (18.9 min, including both report sweeps and the
teardown). The two passes did different tasks, so no persona timing claim is made.
Individual actions: wizard fill to created about 11 s scripted, Add Show
0.84 s; find the show from the landing page 1.9 s (two clicks); mail-in entry
15.3 s end to end (submit 3.4 s); check-in 6.5 s from Actions; delete 3.8 s.

**Personas, as written down before each pass.**

_Beginner._ A retired, first-time club secretary. Goal: set up and run one UKC
show. Starting state: the signed-out landing page. Done means a show with classes
created, a report opened, and every other area's affordance located, plus
publishing if the app allows it. Outside help means a guessed route,
`?report=` / `?focus=` / `?tab=` used to get somewhere, or any affordance the
persona could not see. She navigated by visible labels; the `?focus=` in URLs
came from the app's own links.

_Experienced._ A repeat secretary on a busy show day. Goal: process entries
fast. Starting state: the signed-in landing page in a fresh browser context
(cookies and localStorage from the saved session, no IndexedDB). Done means a
mail-in entry added after close, check-in, class change, pull and correction
performed and undone, the full report sweep, and fees and receipts read. A
workaround is any step that needs knowledge the app did not put on screen. The
sweep used `?report=` deep links, as the prompt allows for this pass.

---

## Findings

### F68: P2, NEW, [MYK9-1580](https://linear.app/myk9-platform/issue/MYK9-1580): the wizard offers a judge with no qualification for the show's registry, and the class panel then calls him "Assigned judge (unavailable)"

| Persona × viewport | 1440×900 | 390×844 | 768×1024 |
| ------------------ | -------- | ------- | -------- |
| Beginner           | hit      | —       | —        |
| Experienced        | —        | —       | —        |

On a UKC show, step 1's **Show Judges** picker lists `Anthony Ginter — No UKC number` first. SQL shows his only `judge_qualifications` row is AKC. A UKC-qualified judge (`UKC #6917`) is second. The beginner picked the first name, and step 3's per-element judge combobox offered the same person. The show was created with two confirmed `judge_assignments` for him.

On Overview, the schedule rows read "Anthony Ginter". The focused class panel's Judge control reads **"Assigned judge (unavailable)"**, stable at 0, 10 and 30 seconds. `useClassJudgeAssignment` narrows the list with `selectQualifiedJudges(…, show.organization)`, so the judge the wizard just allowed is outside it (`ClassJudgeSelect.tsx:45`). Edit class shows his name. Three surfaces give three readings of one assignment, and the word "unavailable" does not say what is wrong.

INTENT: _Calm Over Clever_. The secretary is left wondering whether the save worked. The "No UKC number" hint is small grey text in the option.

The earlier "Judge not set" symptom (MYK9-1382) is gone. This is a different cause on the same control.

### F69: P2, NEW, [MYK9-1581](https://linear.app/myk9-platform/issue/MYK9-1581): the secretary home scrolls sideways at 150% zoom

| Persona × viewport | 1440×900 | 390×844 @150% (260px) | 768×1024 |
| ------------------ | -------- | --------------------- | -------- |
| Beginner           | no       | hit                   | —        |
| Experienced        | no       | —                     | no       |

Viewport-specific. At 260px CSS width, `/secretary/dashboard` measures `scrollWidth = 279`. The outermost overflowing element is the Live today card's `div.ml-auto flex shrink-0 …` row holding **Pin** and **Go to show** (right edge 279px). MYK9-643 (Done) used this page as its passing reference at the same width, and the Pin button arrived since then in MYK9-1490. At the same width, the wizard, Entry Forms and demo-show Reports measure `scrollWidth = 260`.

### F70: P3, NEW, [MYK9-1582](https://linear.app/myk9-platform/issue/MYK9-1582): seven reports call a UKC show "UKC Scent Work"

Experienced × 1440×900. The walk show's Financial Report prints "UKC Scent Work Financial Report". The same `` `${organization} Scent Work` `` template is in the Judge's Schedule, Result Catalog, Show Catalog, the three count reports and the class requirements panel. UKC's sport is Nosework and ASCA's is Scent Detection, which is how the wizard, the official forms and the cheat sheets name them.

### F71: P3, NEW, [MYK9-1583](https://linear.app/myk9-platform/issue/MYK9-1583): Edit class's wait-list copy names places that do not exist by those names

Beginner and experienced × 1440×900 (one finding). The copy reads "Manage the queue under **Entries, then Waitlist**" and "Change it for every class on **the Waitlist tab**". The show's tabs are Overview / Entry Forms / Results / Reports, and the wait list is an option in Entry Forms' `Show:` menu. The beginner did not find it from that copy. The experienced pass found it only by opening the `Show:` menu.

### F72: P3, NEW, [MYK9-1584](https://linear.app/myk9-platform/issue/MYK9-1584): deep-linked foreign-registry reports are fenced for ASCA but not for AKC

Experienced × 1440×900, deep link only. The catalogs are correctly registry-scoped on both shows. On the UKC walk show with its trial selected, all six ASCA ids show "This form belongs to a different registry…", but the nine AKC-only ids render full documents with no notice. The AKC Scent Work Entry Form frame holds 3,895 characters. On the AKC demo show with no trial selected, the UKC trial report shows the notice while the UKC entry packet downloads (422 KB) for the AKC show.

### F38: P3, UNCHANGED (first filed now), [MYK9-1585](https://linear.app/myk9-platform/issue/MYK9-1585): revoke leaves `user_roles.deactivated_at` NULL

Beginner (as `testadmin@`) × 1440×900. The revoked row has `is_active = false` and `deactivated_at = NULL`. `permission_audit_log` has one `club_secretary_granted` (06:24:37Z) and one `club_secretary_revoked` (06:26:13Z) row. Across the table, stamping is inconsistent (secretary 2 stamped / 3 not, club_admin 0 / 3, exhibitor 8 / 4). The 08-31 walk found this, and no issue existed until now.

### Observations (not filed)

- **The Trial Type select on a UKC show** offers Nosework plus Agility, Conformation, Obedience, Rally, Dock Diving, Weight Pull, Lure Coursing, Barn Hunt and Other. None of those has a template in `sport_templates`. This is a scoping question, not a confirmed defect, so I left it for the owner.
- **F55 class, still true:** the Chair picker lists all 71 platform people, and the Appoint Secretary dialog lists 71 people ("Showing the first 20 of 71"), both with email addresses. MYK9-1381's sibling decisions cover this; I did not re-file it.
- **The Payment Reference field:** I filled the field found by label `/Reference/i` and `entries.payment_reference` came back NULL. My fill may have missed an unlabelled input, so this is unverified, not a finding.
- **The walk show's Reports page measured 24px of overflow at 260px** once, before teardown. The demo show's Reports page measures 0 at the same width, and the walk show is gone, so I could not re-measure. Unverified.

---

## Regression re-verification

| Item                                                | Result                          | Evidence                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-448 (UKC Trial Report in a UKC show's catalog) | **holds**                       | In the walk-show catalog; downloads 192 KB with club name, event date 10/31/2026, 1 day-of entry, $4.00 due to UKC.                                                                                                                            |
| MYK9-447 (UKC permanent-registration box)           | **holds**                       | pypdf text of the UKC entry packet: `… 100 ■ P0123C855 Australian Shepherd male 2019 Scout …`. `■` is a ticked box.                                                                                                                            |
| MYK9-642 (day-of entry billed as a pre-entry)       | **holds**                       | `is_day_of_show = true`; the UKC Trial Report counts it under DayOfShow, not PreEntries.                                                                                                                                                       |
| MYK9-283 (cold-replica false zero)                  | **holds**                       | 3 fresh contexts: "13 entries from 10 entry forms" each time, matching SQL's 13.                                                                                                                                                               |
| MYK9-284 (revoke confirm)                           | **holds**                       | "Revoke show access from Renee Lawson? … Keep show access / Revoke show access"; one row removed, exactly one audit row.                                                                                                                       |
| MYK9-285 (delete restorable)                        | **holds (partly read)**         | Toast "Show deleted: … / Undo"; the dialog's restore text was not captured (it read "Checking what goes with this show…" at snapshot time, while Delete was disabled).                                                                         |
| MYK9-286 (`/shows/new` redirect)                    | not re-checked                  | —                                                                                                                                                                                                                                              |
| MYK9-643 (Done; touch targets, 150% zoom)           | **holds**, with one new sibling | Wizard and Entry Forms: `scrollWidth` = viewport at 260px. Select-all sits in a 44×44 wrapper that `elementFromPoint` hits 10px outside the 16px box. The Draft pill's hit area spans ±21px of its centre. The dashboard overflow is new: F69. |
| MYK9-1382 ("Judge not set" after wizard)            | **resolved**                    | Schedule shows the judge at t+0. A different symptom on the same control is F68.                                                                                                                                                               |
| MYK9-1383 ("Cancel show" dead end)                  | not reached                     | The link appears only when an entry is paid; the run reset payment before delete, per Known mechanics.                                                                                                                                         |
| MYK9-1384 (Pull → Accept leaves `pulled`)           | **resolved**                    | SQL: after Pull `check_in_status = pulled`, `check_in_status_before_pull = checked-in`; after Accept `checked-in`, before-pull cleared.                                                                                                        |
| MYK9-1385 (A/B section dropped)                     | **half re-verified, resolved**  | The Change class dialog reads "Current class: Container Novice A", target "Interior Novice A". The Show Catalog half was not text-checked (the walk show was empty at the time).                                                               |
| MYK9-1386 (AKC officials reports)                   | not re-verified                 | UKC week; the demo show has no officials rows to test against.                                                                                                                                                                                 |
| MYK9-1387 (Publish offered, toast-refused)          | **resolved**                    | The Draft menu's "Publish Show" item is `aria-disabled`, with the explanation in the menu; Edit Show says the same.                                                                                                                            |
| MYK9-1388 (Members wall copy)                       | **changed**, commented          | Now "You don't have access … ask your club admin." Issue still In Progress.                                                                                                                                                                    |
| MYK9-1389, MYK9-1390, MYK9-1391                     | not re-verified                 | The Switch show flyout was not opened. One "View entries and results" link was seen in CLASS WORK but not counted. The tab badge probe found no badge spans (harness, not a pass).                                                             |
| F67 (stale "Paid: $35" after Payment Due)           | **did not recur**               | The detail read "Fee: $35 (Paid: $0)" right after Payment Due.                                                                                                                                                                                 |
| F22 (Messages is history-only)                      | holds (by design)               | `/secretary/messages` is Communication History; Compose is in Message Center.                                                                                                                                                                  |
| F8 / F55 (all-people pickers)                       | holds                           | 71 people with emails in the Chair picker and the Appoint dialog.                                                                                                                                                                              |
| F38 (`deactivated_at` NULL on revoke)               | holds, filed                    | MYK9-1585.                                                                                                                                                                                                                                     |

**Not reached this run:** F3–F7, F9–F13, F17, F19, F21, F24–F28, F31–F35. The walk spent its time on the UKC registry checks, the appoint/revoke cycle that the 10-24 harness refused, and the MYK9-643 measurement correction. These remain the oldest unwalked set.

---

## Corrections to my own measurement

- **Touch targets.** My first mobile probe walked three ancestors for a `LABEL` or `BUTTON` wrapper and reported the select-all checkbox (16×16) and the Draft pill (53×20) as below the floor. Its known-answer check (a 44×44 probe button) passed, but it could not see the hit-area expanders. Re-measured with `elementFromPoint` outside the visible box: select-all is inside a 44×44 span that takes the click, and the Draft pill takes clicks at ±21px from centre. Neither is a finding, and MYK9-643 holds.
- **Appoint dialog anchor.** My first Revoke anchor (`main div` containing the email and a Revoke button) matched the list container, and Playwright's strict mode refused the click because it resolved to two buttons. Nothing was revoked by that attempt. The rows are `li`, and the second attempt anchored on `main li` containing the email: exactly one row and one button, asserted before the click.

---

## Report sweep, in full

Both shows, 39 ids each, by `?report=` deep link. 0 `NaN`, 0 console errors and 0 failed requests on either show.

**Walk show (UKC, trial selected).** Generic reports render or show a correct empty state. Blob PDFs: Check-in Sheet 4,726 B and Score Sheet 4,195 B with 1 entry. UKC downloads:

| Form                     | Bytes (2026-10-31)    | Content                                                                        |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------ |
| UKC Entry Form (packet)  | 71,574                | Filled: armband 100, `■ P0123C855`, breed, sex, owner and address (seeded dog) |
| UKC Change Entry Form    | — (Download disabled) | "Pick a trial, a class, and a dog above to enable this." Correct.              |
| UKC Judges Book: Element | 34,690                | Blank registry template (by design)                                            |
| UKC Judges Book: HD      | 39,082                | Blank registry template (by design)                                            |
| UKC Trial Score Sheet    | 33,502                | Blank registry template (by design)                                            |
| UKC Trial Report         | 192,212               | 22 fields filled: club name, event date, entry counts, chair and secretary     |

None of the six showed a field-completeness alert. The filled ones are complete and the templates are static, so an absent alert is correct. The ASCA ids show the different-registry notice. The AKC ids render without it (F72).

**Demo show (AKC, lean seed, 13 entries).** The catalog with Trial 1 selected is 26 = 17 generic + 8 AKC + AKC Judge Setup Cheat Sheet, with no UKC or ASCA form. The AKC Scent Work Entry Form renders (28,259 chars). Calibration on Container Novice A (`dec1a55e-…031`, 3 entries): Check-in Sheet 4,130 B and Score Sheet 4,841 B, matching 2026-10-24. The 63-entry calibration was skipped because the load fixture is not applied (`entries` = 13).

---

## Canary candidates

- `/shows/<new UKC show>` as `secretary@`, after the wizard assigns judges: the focused class panel's Judge control never reads "Assigned judge (unavailable)" for a judge the wizard just assigned (F68).
- `/secretary/dashboard` as `secretary@` at 260×563 with a show happening today: `document.documentElement.scrollWidth === 260` (F69).
- `/shows/<UKC show>/reports?report=financial-report` as `secretary@`: the frame title does not contain "UKC Scent Work" (F70).
- `/shows/<UKC show>/reports?report=akc-scent-work-entry-form&trialId=<UKC trial>`: the page contains "belongs to a different registry" (F72).
- `/shows/<UKC show>/reports` with the trial selected, no `?report=`: the catalog lists "UKC Nosework Trial Report" and no button name starting "AKC" or "ASCA" (MYK9-448).
- UKC entry packet for a seeded dog with a UKC registration: the PDF text contains `■ <registration number>` (MYK9-447).
- Entry status menu: after check-in → Pull → Accept, `/shows/:id/trials/:t/classes/:c` combobox "Check-in status for <dog>" reads "Checked-in" (MYK9-1384).
- `/shows/<draft show of an unauthorized club>` → Draft pill: the "Publish Show" menuitem has `aria-disabled="true"` and the menu shows "hasn't been authorized" (MYK9-1387).
- `/shows/dededede-…010/entries` in a fresh context with no IndexedDB: within 30 s the header reads "13 entries from 10 entry forms" on the lean seed (MYK9-283).
- Show Access → Revoke on a non-sole secretary: an alertdialog "Revoke show access from <name>?" appears before any row disappears (MYK9-284).
- `/club-admin/members` as `secretary@`: the page text contains "ask your club admin" and not "needs to be configured" (MYK9-1388).

---

## Prompt corrections

Applied below the `# Part 2` line in this commit:

1. **Routes.** The wizard is reached from the header **Actions → Add Show**. The secretary home has no Add Show link since MYK9-1490.
2. **Reports.** The registry has **39** ids (two judge setup cheat sheets were added, MYK9-1078). The catalogs are AKC show 26 (17 + 8 AKC + AKC cheat sheet) and UKC show 24 (17 + 6 UKC + UKC cheat sheet). The UKC Change Entry Form's Download is disabled until a trial, class and dog are picked.
3. **Wizard step 2.** Event Number appears on AKC only; a UKC trial has Trial Name, Trial Type, Trial Date and Start Time. The date picker shows two months, and the next-month control matches three buttons, so use `.first()`. Day buttons may carry a prefix (`Today, …`), so match the label with `*=`.
4. **Wizard draft persistence.** The wizard autosaves to localStorage `myk9show-wizard-storage`, and a saved `storageState` reopens the draft at its last step. Clear that key between scripted wizard runs.
5. **Entry edits.** The armband dialog is "Assign Armband" and its button is **Assign armband** (not Save). The UKC payment step has no agreement checkbox. Pull → Accept restores the check-in now (MYK9-1384 fixed), so the class-page reset is no longer needed.
6. **Permissions.** As `testadmin@`, `/club-admin/members` shows a club picker (buttons). The club page is `/clubs/:id?tab=members` → inner tabs Members / Officers / **Show Access**. The Appoint dialog uses a search input (placeholder "Search by name or email...") with person **buttons**, not `role=option`. Appointment rows are `li` inside `main`. The cycle ran this week; the classifier did not refuse it.
7. **Waitlist.** It is at Entry Forms → `Show:` menu → **Waitlist**, not a tab.
8. **Measurement.** The Draft pill and the select-all checkbox have 44px hit expanders. Measure with `elementFromPoint` outside the visible box, not the bounding rect.
9. **Delete dialog.** Delete is disabled while it reads "Checking what goes with this show…". A text snapshot taken right after open will not show the enumeration.
10. **Harness (2026-10-31).** A persistent local HTTP driver for Playwright was refused by the auto-mode classifier as "Create RCE Surface". One-shot `node` scripts per step, sharing `storageState` files, worked. `python3 -I` drops the user site-packages that hold pypdf, so append that path inside the extraction script.
11. **Open issues.** The 2026-10-24 statuses are updated, and the 2026-10-31 list is added. The highest F-number is now F72.

Above the line, listed only, for a human to make through a reviewed PR:

- Task 4 says the walk-show catalog is "17 generic reports plus that registry's own set". With the cheat sheets, each registry's set is its forms plus one cheat sheet. The wording still holds if "own set" includes the cheat sheet; say so explicitly.
- Output says "numbering findings continuously from the prior walk's highest F-number (F55 as of 2026-09-17)". It is F72 as of 2026-10-31.

---

## State left behind

- **Walk show** `a187455c-…` soft-deleted 2026-10-31 06:45:44Z, cascading to its trial, 2 classes and 2 entry rows (the original and the Change-class destination). SQL after teardown: 0 live trials, classes or entries; 0 live `ZZ Walk%` shows.
- **Appointment:** `user_roles` row `e4ef72bc-…` for `load-secretary-1@myk9t.com`, now `is_active = false`. Active role counts equal the pre-walk baseline (chairman 2, club_admin 9, exhibitor 13, judge 3, secretary 6, site_admin 3, steward 3). The secretary **total** went from 10 to 11 because the inactive row persists. That is declared residue, like the audit rows.
- **Declared residue that teardown cannot remove:** the soft-deleted show and its children (MYK9-285), 2 `permission_audit_log` rows, 4 `entry_status_history` rows, and the inactive `user_roles` row above.
- **Not mutated:** no dog or `dog_registrations` row; no seeded entry; no message sent (Compose and the acceptance email were stopped at Send / dismissed with "Not now").
- **Local:** the dev server on port 5317 was stopped. The 10 downloaded PDFs in the worktree's gitignored `.logs/walk-downloads/` (seeded data only) and two `sweep-*.json` files were **not** deleted, because this session's permissions refused `rm`. They go when the worktree `.claude/worktrees/sec-walk-1031` is removed. Nothing was committed from `.logs/`.

---

## Filed

| Finding | Issue                                                         | Priority | Note                                   |
| ------- | ------------------------------------------------------------- | -------- | -------------------------------------- |
| parent  | [MYK9-1579](https://linear.app/myk9-platform/issue/MYK9-1579) | High     | Secretary task walk 2026-10-31 — P2/P3 |
| F68     | [MYK9-1580](https://linear.app/myk9-platform/issue/MYK9-1580) | High     | sub-issue                              |
| F69     | [MYK9-1581](https://linear.app/myk9-platform/issue/MYK9-1581) | High     | sub-issue                              |
| F70     | [MYK9-1582](https://linear.app/myk9-platform/issue/MYK9-1582) | Low      | sub-issue                              |
| F71     | [MYK9-1583](https://linear.app/myk9-platform/issue/MYK9-1583) | Low      | sub-issue                              |
| F72     | [MYK9-1584](https://linear.app/myk9-platform/issue/MYK9-1584) | Low      | sub-issue                              |
| F38     | [MYK9-1585](https://linear.app/myk9-platform/issue/MYK9-1585) | Low      | sub-issue; unchanged since 2026-08-31  |
| —       | [MYK9-1388](https://linear.app/myk9-platform/issue/MYK9-1388) | —        | comment: symptom changed               |

All Linear writes succeeded. Each was searched first with `includeArchived: true`, and none had a duplicate.
