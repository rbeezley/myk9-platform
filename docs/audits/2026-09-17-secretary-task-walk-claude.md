# Secretary Task Walk — 2026-09-17

**Run token:** `2026-09-17 1452`
**ISO week 38 → 38 mod 3 = 2 → registry UKC, trial type Nosework**
**Walk show:** `ZZ Walk 2026-09-17 1452 UKC - teardown me` (`16b17801-ccc5-4544-889f-b50a4cf04ac1`), created and deleted by this run.

Functional walk of the secretary's task surface against a local dev server on port
5199 serving `origin/main` at `d37efefa1`, backed by the shared staging Supabase
project. Audit only — no source edits, no migrations, no deploys. The one repo
write is this file.

Findings numbered continuously from the [2026-08-31 walk](2026-08-31-secretary-task-walk-claude.md),
which ended at F42.

Codex's `weekly-secretary-ux-walk`: `status = "PAUSED"`, `rrule = "RRULE:FREQ=WEEKLY;BYDAY=TU;BYHOUR=1;BYMINUTE=30"`.

---

## Headline

**Could a first-time secretary configure and run a show without assistance?**
**Yes, with two stumbles.** The wizard is genuinely good — smart defaults (the
secretary is pre-filled as "You"), a live "7 items remaining" counter, a
"Picking up where you left off" draft resume, and a review step that names every
value before creating anything. The show was created, published, entered,
checked in and closed out end to end by a persona navigating on visible labels
only. The two stumbles: publishing is reachable only by opening the `Draft`
status badge (it carries `aria-haspopup="menu"` and a chevron, so it is
discoverable, but the wizard's own parting words are "publish it from the show
page" without saying where), and the success panel appears on top of a **blank
step 1 of a fresh wizard** — dismiss it without clicking through and the screen
invites you to create the show a second time.

**Could a repeat secretary handle a busy show day efficiently?**
**Partly.** Entry work, fees, reports and closeout are fast and correct. Show-day
entry state is not: check-in is four clicks into a sheet, its only undo lives in
a different app surface (Ringside), the Show Desk call-to-action that offers to
take you there loses its mode and lands on a page with no check-in control, and a
move-up is a one-way door that silently drops the dog's check-in and books a
phantom second entry onto the Financial Report. The Ringside class list — the
first screen anyone opens on show morning — reports every class as `0 / 0`
entries.

---

## Severity

|     | Meaning                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| P1  | Blocks a secretary from completing a required task, or states something false about money or entries on a show-day surface. |
| P2  | Task completable, but with real friction, a trap, or misleading information.                                                |
| P3  | Polish, copy, accessibility, or developer-experience.                                                                       |

---

## Coverage

**Registry for this run: UKC (Nosework).** Registry-specific checks live on rows
1, 4 and 7. A blocked or not-exercised cell is a coverage gap, not a pass.

| #   | Task area           | Registry check                                                                                                                                                                                                                                                                                              | Beginner (1440×900)                                    | Experienced (1440×900)                              |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| 1   | Show setup / wizard | **UKC — done.** Organization `UKC (United Kennel Club)` on step 1, Trial Type `Nosework` on step 2. SQL after creation: `shows.organization = 'UKC'`, the one trial's `registry_id = 'UKC'`, `trial_type = 'Nosework'`. 2 `show_officials` rows, **0** `user_roles` rows. `club_id` persisted to Heartland. | completed                                              | not applicable by design (the show is created once) |
| 2   | Entries             | —                                                                                                                                                                                                                                                                                                           | walked read-only by design                             | completed                                           |
| 3   | Permissions         | —                                                                                                                                                                                                                                                                                                           | completed (appoint + revoke, as site admin — see note) | walked read-only by design                          |
| 4   | Reports             | **UKC — done.** Walk-show catalog = 23 = 17 generic + 6 UKC, no AKC or ASCA form. All 6 UKC forms download-only, all 6 downloaded and parsed.                                                                                                                                                               | completed (one report by label, picker verified)       | completed (25 demo + 23 walk = 48 renders)          |
| 5   | Money               | —                                                                                                                                                                                                                                                                                                           | completed                                              | completed                                           |
| 6   | Messages            | —                                                                                                                                                                                                                                                                                                           | completed                                              | walked read-only by design                          |
| 7   | Waitlist / classes  | **UKC — done.** Wizard step 3 offered exactly the 48 classes in `sport_class_rules` for the UKC template, no more and no fewer.                                                                                                                                                                             | completed                                              | completed                                           |

Plus, for both personas: show-day check-in, run order, results and the closeout
path.

**Note on row 3.** `secretary@myk9t.com` **cannot reach `/club-admin/members`** —
the page renders "You don't have permission to access this page." That is the
deliberate model (a club admin appoints show secretaries; the secretary does not
self-appoint), so the appoint/revoke cycle was run on `testadmin@myk9t.com`. The
beginner persona's contribution to row 3 is having found the wall and read it;
the wall's copy is filed as F53.

**Viewports.** Desktop 1440×900 for both passes. Mobile 390×844 and 150% zoom
(260px CSS width) for the beginner's accessibility checks. Tablet 768×1024 for
the experienced pass. Only desktop is walked by both personas, so only desktop
supports a persona comparison; findings seen solely at 390×844 or 768×1024 are
labelled viewport-specific.

**Personas, as written down before each pass.**

_Beginner_ — a retired, first-time club secretary. Goal: set up and run one
UKC show. Starting state: the sign-in page. Done: a published show with classes,
an appointment made and revoked, a report opened, and every other area's
affordance located. Outside help: guessed routes, `?report=` / `?focus=` /
`?tab=` as a way of getting somewhere, any affordance the persona could not see.
Navigated by visible labels throughout.

_Experienced_ — a repeat secretary on a busy show day. Goal: process entries
fast. Starting state: the signed-in landing page. Done: a mail-in entry added
after close, check-in / move-up / scratch / correction performed and undone, the
full report sweep, fees and receipts read. Workaround: any step needing knowledge
the app did not put on screen.

---

## Findings

### F43 — P1 — NEW — [MYK9-636](https://linear.app/myk9-platform/issue/MYK9-636) — `show_announcements` INSERT has no show or club scoping

`public.show_announcements` has RLS enabled and forced, and its INSERT policy is:

```
with_check: ((SELECT auth.uid()) = author_id) OR (SELECT is_platform_admin())
```

The only condition is "the row names me as its author". `show_id` is
unconstrained, table grants are `authenticated=arwd`, and there is no BEFORE
INSERT trigger — the only triggers are `update_show_announcements_updated_at` and
`on_announcement_insert_push`. The client writes the table directly over
PostgREST with a client-supplied `show_id`
(`services/database/announcements/writes.ts:18`), so RLS is the only boundary and
any authenticated account clears it for any show.

`on_announcement_insert_push` is `AFTER INSERT … WHEN (new.priority IN
('high','urgent'))`, so at high or urgent priority the insert fans out as a web
push to that show's subscribers. UPDATE and DELETE are `auth.uid() = author_id OR
is_platform_admin()`, so the affected show's own secretary cannot remove it.

The sibling table is scoped correctly — `show_messages`'s INSERT policy checks
`is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)` — which is what makes
this read as an oversight rather than a decision. Same class as MYK9-577
(`entries_insert` had no show or club scoping), which was fixed;
`show_announcements` was missed by that sweep.

**No announcement was inserted.** The walk stops at the send control by policy.
The evidence is the live policy, trigger and ACL definitions plus the client
write path in source.

### F44 — P1 — NEW — [MYK9-637](https://linear.app/myk9-platform/issue/MYK9-637) — Ringside class list reports every class as `0 / 0` entries

`/at-show/:showId` renders `0 / 0` and `0 of 0 scored` for every class on the
show. Opening the class is correct — `/at-show/:showId/class/:classId` renders
`Pending 66` and lists all 66 entries with armbands, dogs and handlers.

Measured across three independent cold browser contexts on the demo show, each
polled 10 × 3s:

```
Container Novice A  Test Judge  Completed    0 / 0   0 of 0 scored
Exterior Excellent  Test Judge  Not started  0 / 0   0 of 0 scored
Interior Advanced   Test Judge  Not started  0 / 0   0 of 0 scored
Buried Master       Test Judge  Not started  0 / 0   0 of 0 scored
```

against a database holding 66, 66, 65 and 63 entries for those classes
respectively. Every one of the 30 samples per run read `0 / 0` — this is a steady
state, not the transient cold-replica flash. Reproduced on the walk show, where
the list read `0 / 0` for a class the class page reported as `Pending 1`.

Same family as MYK9-283 and MYK9-419, both of which were treated as blocking, on
the surface with the least tolerance for a wrong number.

### F45 — P2 — NEW — [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639) — A move-up books a phantom "waived" entry onto the Financial Report

A move-up leaves the source entry at `entry_status='moved'` and creates the
destination entry as `payment_status='waived'`, `entry_fee=0.00`, `comped=false`.
The Financial Report for a show with **one dog, entered once, paid $35** then
reads:

```
ENTRIES  GROSS FEES  WAIVED/COMPED  COLLECTED  NET RETAINED
2        $35.00      $0.00          $35.00     $35.00

Secretary Paid   1  $35.00   …
Waived/Comped    1  $0.00    …
```

Nobody waived anything — `comped` is `false` on both rows. The UKC Nosework Trial
Report downloaded the same minute disagrees, reporting `Total Entries = 1`. A club
cannot reconcile against both.

Zeroing the fee is defensible; recording it as a waiver is what breaks the
reports.

### F46 — P2 — NEW — [MYK9-640](https://linear.app/myk9-platform/issue/MYK9-640) — A move-up cannot be undone and drops the dog's check-in

Two costs from one action.

**No way back.** After moving `#100 Acorn` from Interior Novice A to Interior
Advanced A, pressing **Move up** on the same entry from its new class opens the
dialog and says "**No other classes are available.**" The picker only offers
classes above the current one. Entry Management's status menu offers Accepted /
Mark pending / Pull / Reject / Withdrawn / Remove Entry; the Edit Entry panel
offers only Pull. Nothing in the app moves an entry back down.

`docs/roles/secretary.md` frames the responsibility as "**transfer** entries
between classes", which is bidirectional, and `docs/INTENT.md` promises "move-ups
… are calm one-tap operations".

**The check-in does not travel.** Source `checked-in`, destination `no-status`:

| entry       | class               | entry_status | check_in_status |
| ----------- | ------------------- | ------------ | --------------- |
| `ff090774…` | Interior Novice A   | `moved`      | `checked-in`    |
| `fd665acd…` | Interior Advanced A | `confirmed`  | `no-status`     |

The dog is standing at the venue; the new entry says nobody has seen them.

### F47 — P2 — NEW — [MYK9-641](https://linear.app/myk9-platform/issue/MYK9-641) — The composer does not inherit the show, and offers three other clubs' shows

Supersedes **F23**, which the 2026-08-31 walk recorded as "unchanged, not
testable while F22 stands". It is testable: compose lives behind the header's
**Message Center** button, not on `/secretary/messages`.

Opened from a show's own page, the composer says "SHOW — _Select a show_ / Select
a show to continue." Its picker then offers this Heartland-only secretary eleven
shows, three belonging to other clubs (Blue Sky K9 Trial Club, Green Country
Scent Work Club, Redbud Ridge Canine Sports Club) and two club-less `ZZ Audit`
orphans. Communication History on the same account lists six.

One line explains both halves — `MessageCenterPanel.tsx:210`:

```ts
const staffShows =
  currentShowIds.length > 0 ? currentShowIds.map(...) : shows.map(...)  // every show in the store
```

`currentShowIds` is written only by the announcement subscription, never by the
route, so on a show page it is empty: nothing is preselected (F23) and the list
falls back to everything (the scope leak).

Once a show is picked the composer is good — recipient selector, quick templates
(Lunch ready / Ring paused / Results posted / Report to gate / Class delayed),
push toggle, title, message. **No message was sent.**

### F48 — P2 — NEW — [MYK9-642](https://linear.app/myk9-platform/issue/MYK9-642) — An entry added on show day is priced day-of but reported to UKC as a pre-entry

The mail-in entry added today, on an in-progress show whose entries closed seven
days earlier, was correctly offered and charged the **day-of-show** fee ($35, not
the $30 pre-entry fee) — and stored as `is_day_of_show = false`. The downloaded
UKC Nosework Trial Report then reads `Number of PreEntries = 1`, `Number of
DayOfShow Entries = 0`.

The per-entry rates are equal ($4) in the current UKC template, so the total
remitted is right today; the counts the club certifies to the registry are not.
Same failure mode as MYK9-317 and MYK9-445 on the AKC side. The app decided this
was a day-of-show entry when it priced it, then recorded that it was not.

### F49 — P2/P3 — NEW — [MYK9-643](https://linear.app/myk9-platform/issue/MYK9-643) — Horizontal scroll at 150% zoom; 40px controls at phone width

At 150% zoom on a 390×844 phone (260px CSS width):

| Route                           | `scrollWidth` | viewport | horizontal scroll |
| ------------------------------- | ------------- | -------- | ----------------- |
| `/secretary/dashboard`          | 260           | 260      | no                |
| `/secretary/create-show/wizard` | **359**       | 260      | **yes**           |
| `/shows/:id/entry-management`   | **332**       | 260      | **yes**           |

The dashboard proves the layout can do it.

At 390×844 nothing overflows and no text falls below 14px — the `text-xs` → 14px
token holds. The heights do not: every wizard step-1 control is 40px tall (name
input, Organization, Host Club, both date pickers, Locate address), as are the
dashboard's `Add Show` / `Add Dog` / `Add Person` (111×40) and every Reports
picker and the Print button (294×40). 40px is the shared control height rather
than a per-screen mistake.

Two controls sit well below the floor: **`Select all on page`** at **16×16** on
Entry Management (both viewports), and **`Move up — #100 Acorn`** at **96×36** at
768×1024 — an irreversible action (F46) that is the only route to a class change,
on a tablet, which INTENT says the `sm` exception may **never** cover.

_Harness known-answer check, printed with the findings:_ the wizard's class chips
(`label.myk9-level-chip`, 108×44 and 131×44) and the step-3 class checkboxes
(212×100) must not be reported by the same probe, and were not.

### F50–F53 — P3 — NEW — [MYK9-644](https://linear.app/myk9-platform/issue/MYK9-644) — Four one-line copy and scoping defects

- **F50** Wizard step 4: _"… ready with **1 trials** and 2 classes."_ F9 was this
  exact defect on classes and was fixed in #1858; the trials half was not.
- **F51** The delete-show dialog enumerates what it will remove — a real
  improvement — but names the entries _"**Unknown Dog** in Interior Advanced A"_
  on the one screen where a secretary checks what they are destroying. Trial and
  class names on the lines above resolve correctly.
- **F52** Class detail reads `ENTRY FEE $30.00` on a show in progress whose
  wizard offered that class at `$35/class` and whose entry was charged $35.
- **F53** `/club-admin/members` as the secretary renders, as the whole page body,
  _"You don't have permission to access this page."_ — no explanation of who can
  (the club admin, deliberately), no link back. The gate is correct; the copy is
  the finding.

### F54 — P3 — NEW — not filed — Success panel sits on a blank fresh wizard

After **Create Show**, a "Show Created!" panel appears with the access codes and a
**Review & Publish Show** button — but the page behind it has already reset to
**Step 1 of 4** of an empty Create New Show form. A beginner who dismisses the
panel instead of clicking through is looking at a blank creation form seconds
after creating a show. Recorded rather than filed: it is one composition
decision, and MYK9-630 is already inventorying this family of surface overlap.

### F55 — P3 — NEW — not filed — Every-person pickers expose real users' email addresses

The wizard's Show Chairman picker and the Appoint Secretary dialog both now lead
with a **SUGGESTED** group (an improvement on F8), but both still fall through to
an **ALL PEOPLE** section listing every person on the platform **with their email
address** — including several real, non-seeded accounts on staging. F8 was parked
"blocked on an RLS decision"; this is the same decision, with the observation that
what leaks is contact details, not just names. Addresses are deliberately not
quoted here.

---

## Regression re-verification

Re-walked in the browser. **Three prior findings are now resolved.**

| Finding                                                    | Verdict                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MYK9-284** (revoke has no confirmation)                  | **RESOLVED**             | Revoke now raises "Revoke show access from Second Exhibitor? … This does not remove their club membership." with **Keep show access** / **Revoke show access**. The Show Access tab also now warns "This is the club's only appointed secretary, with 4 upcoming shows. Appoint someone else before revoking them."                                                                                                      |
| **MYK9-285** (delete claims permanence, soft-deletes)      | **RESOLVED**             | The dialog now says the records "stop appearing in the app and **can be restored by an administrator from Admin → Deleted Items**", and enumerates 1 show + 1 trial + 2 classes + 2 entries.                                                                                                                                                                                                                             |
| **MYK9-286** (`/shows/new` renders a connection error)     | **RESOLVED**             | `/shows/new` redirects to `/secretary/create-show/wizard`. 0 console errors.                                                                                                                                                                                                                                                                                                                                             |
| **MYK9-448** (UKC Trial Report missing from a UKC catalog) | **Holds**                | With a trial selected and no `?report=`, the UKC walk show's catalog is exactly 23 entries = 17 generic + 6 UKC, including `UKC Nosework Trial Report`. No AKC or ASCA form appears.                                                                                                                                                                                                                                     |
| **MYK9-447** (UKC permanent-registration box never ticked) | **Holds — PDF-verified** | The downloaded UKC entry-form packet is flattened (0 AcroForm fields) but filled: extracted text carries `100`, `■`, `PDA4058CD` (the dog's **UKC** number), `Mixed Breed`, `Acorn 15`, `Acorn`, `Test Exhibitor`. The `■` immediately preceding the registration number in the "Dog's UKC permanent reg." row is the ticked box.                                                                                        |
| **MYK9-282** (`Trial NaN`)                                 | **Holds**                | 0 occurrences of `NaN` across 48 report renders (25 demo + 23 walk), in both the iframe and the outer document.                                                                                                                                                                                                                                                                                                          |
| **MYK9-280** (AKC entry form unreachable)                  | **Holds**                | `akc-scent-work-entry-form` renders 322,431 characters on the demo show.                                                                                                                                                                                                                                                                                                                                                 |
| **MYK9-283** (Check-in Sheet false zero)                   | **Holds**                | No false-empty state in 48 renders. The empty-state string was checked in the outer document, where it renders, as well as in the frame.                                                                                                                                                                                                                                                                                 |
| **F15** (blank day-of fee charges $0)                      | **Holds**                | Class step offered `$35/class` on the in-progress show; receipt, `entries.entry_fee` and `enrollments.total_amount` all agree at $35 / 3500.                                                                                                                                                                                                                                                                             |
| **F16** (mail-in check number and date discarded)          | **Holds**                | `enrollments.payment_reference = 'WALK-1452-CHK-8821'`, `payment_date = 2026-09-17`, `payment_notes` set. Entry Management's Payment panel displays the reference. _(The `entries`-level `payment_reference` / `payment_received_on` / `payment_notes` columns are NULL on this path — the offline late-entry path writes those, and `secretaryReadReplication` reads both. Recorded as an observation, not a finding.)_ |
| **F18** ("Paid online" for every channel)                  | **Holds**                | Entry Management reads plain **Paid**; 0 occurrences of "Paid online".                                                                                                                                                                                                                                                                                                                                                   |
| **F19** (filter chips hide selected state)                 | **Holds**                | `Needs review` carries `aria-pressed="true"`, the other three `false`.                                                                                                                                                                                                                                                                                                                                                   |
| **F20** (waitlist cards headed by the judge)               | **Holds**                | Cards now carry an explicit `JUDGE` label above the name, so the name can no longer be mistaken for the class.                                                                                                                                                                                                                                                                                                           |
| **F24** (other clubs' shows in the filter)                 | **Holds**                | Communication History lists only Heartland's shows plus the E2E fixture. The **composer's** picker does not — see F47.                                                                                                                                                                                                                                                                                                   |
| **F29b** (run order / move up unreachable)                 | **Holds**                | Move up is present on the focused class. The Run order menu was absent on the walk show and that is correct: `ShowMapRunOrderMenu` returns `null` below 2 entries, and the class had one.                                                                                                                                                                                                                                |
| **F14** (mail-in dead-ends after entries close)            | **Holds**                | Full 5-step mail-in flow completed on a show whose entries closed 7 days earlier.                                                                                                                                                                                                                                                                                                                                        |
| **F22** (Messages is history-only)                         | **Nuanced, still open**  | `/secretary/messages` is still Communication History with **no compose control**. Compose is not missing — it is behind the header's **Message Center** button. The capability exists; its discoverability from the page called "Messages" does not.                                                                                                                                                                     |
| **F38** (revoke leaves `deactivated_at` NULL)              | **Unchanged**            | `is_active` flipped to `false`, `deactivated_at` still NULL. `permission_audit_log` is intact: exactly 2 rows in the window, one grant and one revoke.                                                                                                                                                                                                                                                                   |
| **F40** (club-less `ZZ Audit` shows on staging)            | **Unchanged**            | `ZZ Audit - Publish Path Probe` and `ZZ Audit - Secretary Task Walk` still carry `club_id IS NULL`; `ZZ Audit - Rewalk` is Heartland's and still holds 2 pending entries.                                                                                                                                                                                                                                                |
| **F8** (chairman picker lists everyone)                    | **Partly improved**      | A SUGGESTED group now leads; ALL PEOPLE still lists every platform person. See F55.                                                                                                                                                                                                                                                                                                                                      |

**Not reached:** F3–F7, F9–F13, F17, F21, F25–F28, F31–F35. F9's sibling defect
did recur on a different string (F50).

---

## Corrections to my own measurement

Recorded because four of them would have shipped false findings.

- **The report picker is not opaque any more.** The known-mechanics note says the
  Base UI select "exposes no `role=option` nodes" and to drive it with `?report=`.
  It exposes them now — `getByRole('option').allTextContents()` returned all 23
  and all 25 entries. The beginner's picker is therefore **verified, not
  UNVERIFIED by harness**.
- **The demo show is AKC-only now.** The prompt says staging had not been
  reseeded and the demo show still mixes AKC, UKC and ASCA. It has been:
  migration `20260915163500` and its trigger `trg_enforce_show_registry_on_trial`
  are both live, shows `…011` (UKC) and `…012` (ASCA) exist, and
  `dededede-…010`'s four trials are all `registry_id = 'AKC'`. Its catalog is
  correctly 25 = 17 generic + 8 AKC, not all three registries.
- **Ringside does not report "no classes".** A single snapshot at 9 s showed "No
  classes — This show has no classes yet." on the walk show. Three cold contexts
  × 30 s of polling rendered both classes every time. The one-off was my probe
  reading a context that had been navigating elsewhere. What the probe _did_
  catch is a genuine transient: **1 cold load in 3** on the demo show flashed the
  empty state at the first 3 s sample and recovered by the second. That is the
  transient cousin of MYK9-283's stuck variant, and it is recorded here rather
  than filed because it self-corrects within 3 seconds.
- **Check-in is not missing.** I concluded, from
  `STRANDED_ENTRY_ACTION_IDS = new Set(['move-up-entry'])` plus `GateStewardInterface`
  being unreferenced, that a secretary could not check an entry in at all. A
  sweep of every secretary surface found it: Show Desk → Tools → **People at
  show** → exhibitor row → `Check in`, and a `Check-in status for <dog>` button
  on the class page. The real finding is narrower and is on MYK9-630.
- **The thin reports are not broken.** `show-entry-counts` rendered 234
  characters on a 517-entry show. It was scoped by the `classId` I passed;
  unscoped and read properly it prints `Interior / Advanced / 66 / Show Entry
Total: 66 / People: 2 / Dogs: 66`. Same for the three sibling count reports,
  the steward report and the judges' schedule — all substantive.
- **The disabled UKC Change Entry download is correct.** Its button is disabled
  at trial and class scope and says why: "Pick a trial, a class, and a dog above
  to enable this." With `dogId` it enables and produces a 77,397-byte PDF with 26
  filled AcroForm fields.
- **A 39-second "Accept"** was my own harness: `innerText()` on a locator matching
  nothing waits out its 30 s timeout before the `.catch()`. The click itself was
  fast.

---

## Report sweep, in full

48 renders, 0 `NaN`, 0 console errors, 0 false empty states.

**Demo show `dededede-…010` (AKC), 25 reports, all render.** Blob sizes for the
two `buildPdf` reports on the 66-entry `Interior Advanced`: Check-in Sheet
**13,565 bytes**, Score Sheet **50,062 bytes** — consistent with the recorded
~13.2 KB / 63-entry calibration. The AKC Scent Work Entry Form renders 322,431
characters and its field-completeness alert reads "Fill before submitting: Owner
Address, Signature, …". Four AKC reports raise the same style of alert naming
Trial Secretary, Trial Chair, Location and Judge Email.

**Walk show (UKC), 23 reports.** 17 generic reports render; the six UKC forms
correctly present as download-only with a Download button and the "… is a
downloadable form" message. The field-completeness alert appears on exactly one —
`ukc-nosework-entry-form`, "Fill before submitting: Address" — and is absent from
the other five, which is correct: they are static registry templates with nothing
to fill. Entry-dependent reports on the one-entry show render their empty states,
which is not a finding. Blob sizes there: Check-in Sheet 3,958 bytes, Score Sheet
4,425 bytes.

**UKC download byte sizes, for the range future runs need:**

| Form                                   | Filename                                             | Bytes   | AcroForm fields | Filled?                                                                                                    |
| -------------------------------------- | ---------------------------------------------------- | ------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| UKC Entry Form Packet                  | `ukc-nosework-entry-form-packet-<show>.pdf`          | 70,855  | 0 (flattened)   | **yes** — armband, `■`, UKC reg #, breed, sex, DOB, reg name, call name, owner, address, phone, email      |
| UKC Change Entry Form                  | `ukc-change-entry-form-<dog>-<armband>.pdf`          | 77,397  | 26              | **yes** — Host Club, Date, Breed, Sex, Armband, UKC Reg, Dog's Name, Class Change, Move from, Owner's Name |
| UKC Trial Report                       | `ukc-nosework-trial-report-<trial>.pdf`              | 187,255 | 41              | **yes** — Event Date, Club Name, entry counts and fee subtotals                                            |
| UKC Element Judges Book                | `ukc-element-judges-book-<trial>.pdf`                | 34,690  | 0               | blank template by design                                                                                   |
| UKC Handler Discrimination Judges Book | `ukc-handler-discrimination-judges-book-<trial>.pdf` | 39,082  | 0               | blank template by design                                                                                   |
| UKC Trial Score Sheet                  | `ukc-trial-score-sheet-<trial>.pdf`                  | 33,502  | 0               | blank template by design                                                                                   |

Text and field extraction used **`pypdf` 6.14.2** on the local machine. No form
body prints the show name, as documented; only the entry-form packet's filename
carries it. Everything quoted is seeded fixture data. The downloaded PDFs were
deleted at teardown and none is committed.

---

## Registry checks, in full

**Task 1 — the show and its trials carry the same registry.** Verified in SQL
after creation: `shows.organization = 'UKC'`; the one trial's `registry_id =
'UKC'`, `trial_type = 'Nosework'`. Migration `20260915163500` and trigger
`trg_enforce_show_registry_on_trial` are both live on the linked database.

**Task 7 — the wizard offered exactly the live rules.** Step 3 rendered 53
`role=checkbox` nodes: 5 "Select all \<element\>" group controls plus **48**
class checkboxes. Against
`sport_class_rules` joined to the `UKC` template, read at run time:

| Element                | Levels offered                                  | Count  | Rules  |
| ---------------------- | ----------------------------------------------- | ------ | ------ |
| Container              | Novice, Advanced, Superior, Master, Elite × A/B | 10     | 10     |
| Interior               | Novice, Advanced, Superior, Master, Elite × A/B | 10     | 10     |
| Exterior               | Novice, Advanced, Superior, Master, Elite × A/B | 10     | 10     |
| Vehicle                | Novice, Advanced, Superior, Master, Elite × A/B | 10     | 10     |
| Handler Discrimination | Novice, Advanced, **Excellent**, Master × A/B   | 8      | 8      |
|                        |                                                 | **48** | **48** |

Exact match, both directions — no class offered that is not a rule, no rule
without an offered class. Handler Discrimination correctly stops at Excellent and
carries no Superior or Elite. **Buried and Detective, the AKC-only elements, were
not offered.** No template picker appeared, which is correct with one matching
template.

**Task 4 — the catalog is registry-scoped.** Asserted only after the trial
selector was populated, with a trial explicitly selected and no `?report=` in the
URL. UKC walk show: 23 = 17 generic + 6 UKC, zero AKC or ASCA forms. Demo show
(AKC-only after the reseed): 25 = 17 generic + 8 AKC.

---

## State left behind

**Restored to baseline.**

- The walk show, its trial, its 2 classes and its 2 entries are all soft-deleted
  (`deleted_at` set on 1/1, 1/1, 2/2, 2/2). Zero live shows match `ZZ Walk
2026-09-17%`. The delete was performed through the app's own **More show
  actions → Delete**, after asserting that exactly one live show matched the run's
  full name.
- The one appointment made (`exhibitor2@myk9t.com` as a Heartland show secretary)
  was revoked through the app, anchored to its own row and confirmed inside the
  dialog. Global active-secretary `user_roles` count: **4 → 5 → 4**, matching the
  baseline recorded before the walk. `permission_audit_log` holds exactly **2**
  rows for the window — one `club_secretary_granted`, one
  `club_secretary_revoked`. No second revoke fired.
- **0 `dogs` rows and 0 `dog_registrations` rows were created, edited or deleted**
  (both tables: 0 rows with `updated_at` inside the run window).
- Entry edits were undone through the UI: armband 100 → 207 → 100; check-in
  status `checked-in` → `Pulled` → `no-status`. The move-up was **not** undone —
  the UI offers no reverse (F46) — and the show delete is the backstop, as the
  boundary declares.
- The downloaded PDFs under `.logs/walk/walk-downloads/` were deleted.
- Dev server on port 5199, in a dedicated worktree cut from `origin/main`.

**Declared residue that teardown cannot remove**, so the accumulation stays
visible: the show delete is soft (MYK9-285's mechanism, though its _copy_ is now
fixed), and the `permission_audit_log` and `entry_status_history` rows persist
beyond it. The two `show_officials` rows for the deleted show also persist, which
is correct — that table has no `deleted_at`.

No source edits, no commits beyond this report, no migrations, no deploys.

---

## Filed

| Finding | Issue                                                       | Priority | Notes                                                    |
| ------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------- |
| F43     | [MYK9-636](https://linear.app/myk9-platform/issue/MYK9-636) | Urgent   | `show_announcements` INSERT has no show or club scoping  |
| F44     | [MYK9-637](https://linear.app/myk9-platform/issue/MYK9-637) | Urgent   | Ringside class list reads `0 / 0` on every class         |
| —       | [MYK9-638](https://linear.app/myk9-platform/issue/MYK9-638) | Medium   | Parent: Secretary task walk 2026-09-17 — P2/P3 findings  |
| F45     | [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639) | High     | Move-up books a phantom "waived" entry                   |
| F46     | [MYK9-640](https://linear.app/myk9-platform/issue/MYK9-640) | High     | Move-up is irreversible and drops the check-in           |
| F47     | [MYK9-641](https://linear.app/myk9-platform/issue/MYK9-641) | High     | Composer scope and show inheritance (supersedes F23)     |
| F48     | [MYK9-642](https://linear.app/myk9-platform/issue/MYK9-642) | High     | Day-of fee, pre-entry count                              |
| F49     | [MYK9-643](https://linear.app/myk9-platform/issue/MYK9-643) | Medium   | 150% zoom overflow; 40px controls; two sub-floor targets |
| F50–F53 | [MYK9-644](https://linear.app/myk9-platform/issue/MYK9-644) | Low      | Four one-line copy and scoping defects                   |

**Commented, not filed** (an issue already covers the area):

- [MYK9-630](https://linear.app/myk9-platform/issue/MYK9-630) — the check-in
  surface inventory: the Show Desk CTA that drops `mode=day-of`, and the
  set-here/undo-there split.
- [MYK9-619](https://linear.app/myk9-platform/issue/MYK9-619) — the staff dog
  picker renders `registrations[0]`, so a UKC show shows AKC numbers, with the
  measurement and the `DogSelectionStepEnhanced.tsx:149` line.

**Not filed, recorded here only:** F54 (success panel over a blank wizard), F55
(every-person pickers expose emails — F8's parked RLS decision), the 1-in-3
transient ringside empty flash, and the `entries` vs `enrollments` split for
`payment_reference`.

**Label substitution, disclosed.** The task asks for `p0`/`p1`, `source:claude`
and `walk:secretary` labels. This workspace has none of them — its label set is
`Claude` / `Codex` / `Human Tester` / `Bug` / `Feature` / `Improvement` / `Test` /
`Parked` / `Wait for Launch` plus the vacation-autopilot set. Issues were filed
with `Claude` + `Bug` (or `Improvement`) and Linear's own priority field
(Urgent = P1, High = P2, Low = P3) rather than creating four new workspace labels
unattended.
