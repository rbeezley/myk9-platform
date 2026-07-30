# Secretary Role UX Walk — Claude

> **Status:** Complete

**Rotation:** ISO week **31** of 2026 → `31 mod 5 == 1` → **secretary**
**Date:** 2026-07-29 (local, CDT)
**Source:** `source: claude`
**Baseline SHA:** `58bd0b91d` (`docs(security): full-surface audit 2026-07-29`), local dev server from the primary checkout
**Account:** canonical seeded secretary (`e2e-secretary@test.myk9.com`); role confirmed post-auth as `Secretary +2` in the sidebar identity
**Persona:** elderly, nontechnical, first-time secretary
**Viewports:** desktop 1280×800 (full walk), mobile 375×812 (full walk), tablet 768×1024 (responsive-difference pass)
**Intent reference:** [`docs/INTENT.md`](../INTENT.md) — Trial Secretary intent word: **"That was easy."**
**Skills:** `role-journey-ux-audit` → `UX-Audit`, `audit-pages`, `quality-finding-lifecycle`

---

## Executive role-confidence assessment

**Role confidence: Moderate — improved structurally, undermined by counts that disagree.**

The July 1 remediation genuinely landed. Of the prior walk's Critical/High items I could re-test, **all but one verified fixed in the browser** (see §5): the premium-publish dead end now lands on the clearing action, ringside has an exit, Manage Classes moved inside the workbench shell with labelled controls, the mail-in wizard has staff copy, disabled buttons carry reasons, and the closeout page leads with a readiness summary instead of settings. Date drift (C2), the pending-count mismatch (C1), and "Judge: TBD" on printed sheets (C3) are all gone.

What replaced them is a narrower but sharper problem: **the secretary is shown three different entry counts for the same classes, and the two surfaces built to tell her "what's blocking me" are the ones that are wrong.** The Setup/Overview schedule reports `0 entries` for all nine classes that actually hold 63–66 each; the closeout readiness verdict counts every entry as unscored and therefore appears unable to ever go green. Both are on the "get the show ready" and "close the show out" golden paths, and both are wrong in the direction that costs trust — the app confidently states a number the secretary can disprove by opening the next tab. Against the intent word, this is the opposite of "that was easy": it is "that was easy, but I don't believe it."

Show-day paperwork carries one concrete defect: the printed check-in sheet leaves the HANDLER column blank for every entry although handler names resolve in the database. That is the physical document the gate steward reads at the ring.

Accessibility for the stated persona is the weakest dimension and was not covered by the prior remediation: measured contrast on the show-day attention cards fails WCAG AA (4.26:1), 23 touch targets fall below the 44px INTENT floor on mobile, and at tablet width the review queue's primary per-row action is clipped off-screen.

---

## 1. Scope, records and actions

| Item                 | Detail                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| Records created      | **None.** No entries, shows, dogs, or people were created.                         |
| Records edited       | **None.**                                                                          |
| Records deleted      | **None.**                                                                          |
| Shared-DB writes     | **None.** One clipboard read ("Copy Link") and read-only SQL via the Supabase MCP. |
| Ringside writes      | **Deliberately not exercised** — see §7.                                           |
| Payment/payout flows | Not touched.                                                                       |
| Production           | Not touched.                                                                       |

The mail-in registration wizard was opened to step 1 and abandoned unsaved. A pre-existing saved draft ("Load Draft (1)") was observed but not loaded.

---

## 2. Finding counts

| Canonical severity                           | New    | Unchanged / recurrence   | Resolved | Blocked | Total  |
| -------------------------------------------- | ------ | ------------------------ | -------- | ------- | ------ |
| P0                                           | 0      | 0                        | 0        | 0       | **0**  |
| P1                                           | 2      | 1 (SEC-UX-01 → MYK9-65)  | —        | —       | **3**  |
| P2                                           | 7      | 1 (SEC-UX-06 → MYK9-57)  | —        | —       | **8**  |
| P3                                           | 8      | 2 (SEC-UX-12, SEC-UX-13) | —        | —       | **10** |
| **Findings total**                           | **17** | **4**                    | —        | —       | **21** |
| Resolved (prior findings re-verified closed) | —      | —                        | **19**   | —       | **19** |
| Blocked coverage checks                      | —      | —                        | —        | **5**   | **5**  |

By classification: product defects **11**, UX/accessibility **6**, copy/consistency **4** (overlapping counts resolve to the 21 ledger rows in §9), environment/data-hygiene **2** (reported separately), rejected hypotheses **5**, walk errors **1**.

No security findings. No P0.

**Reconciled against Linear before filing.** Existing references reused rather than duplicated: **MYK9-65** (SEC-UX-01, recurrence), **MYK9-57** (SEC-UX-06, recurrence), **MYK9-30** (SEC-UX-03, related), **MYK9-64** / **MYK9-8** (SEC-UX-08, related), **MYK9-115** (justifies blocked check B2).

**Filed 2026-07-30 (approved):**

| Action                        | Issue                                                                                                                                                                                                                        | Finding   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Created (High)                | [MYK9-118](https://linear.app/myk9-platform/issue/MYK9-118/closeout-readiness-counts-scored-entries-as-unscored-so-safe-to-send) — _Closeout readiness counts scored entries as unscored, so "safe to send" is unreachable_  | SEC-UX-02 |
| Created (High)                | [MYK9-119](https://linear.app/myk9-platform/issue/MYK9-119/printed-check-in-sheet-leaves-the-handler-column-blank-on-every-row) — _Printed check-in sheet leaves the HANDLER column blank on every row_ (related to MYK9-30) | SEC-UX-03 |
| Reopened Done → Todo (High)   | [MYK9-65](https://linear.app/myk9-platform/issue/MYK9-65/fix-class-entry-counts-disagreeing-between-show-desk-and-class)                                                                                                     | SEC-UX-01 |
| Reopened Done → Todo (Medium) | [MYK9-57](https://linear.app/myk9-platform/issue/MYK9-57/fix-manager-tablet-layout-at-768-1023px)                                                                                                                            | SEC-UX-06 |

The P2/P3 findings below remain report-only, per the lifecycle gate.

---

## 3. Findings (ordered by severity)

### P1

#### SEC-UX-01 — Setup/Overview schedule reports "0 entries" for every class that holds 63–66

- **Status:** **recurrence** of [MYK9-65](https://linear.app/myk9-platform/issue/MYK9-65/fix-class-entry-counts-disagreeing-between-show-desk-and-class) — _"Fix class entry counts disagreeing between Show Desk and class surfaces"_, closed **Done 2026-07-19**, disagreement reproduced **2026-07-29** · **Classification:** product defect · **Confidence:** high
- **Recurrence note (stated precisely):** MYK9-65's scope was _Show Desk vs class surfaces_ — and both of those now agree and are **correct**. What is wrong is a surface that fix did not cover (Setup/Overview) plus `getTrialTimelineRows`. So this is most likely a **missed sibling surface of the same defect** rather than a regression of the code MYK9-65 changed. Either way it is the same underlying "class entry counts disagree between surfaces" defect, so it should **reopen/extend MYK9-65** rather than open a new issue.
- **Route:** `/shows/:showId` (Setup/Overview; `/setup` redirects here) · **Viewports:** all
- **Observed:** the "Show schedule" rows render `0 entries` for all 9 classes.
- **Expected:** the real per-class counts.
- **Evidence:**
  - Browser (Setup): `Container Novice A … 0 entries`, `Interior Advanced … 0 entries`, `Exterior Excellent … 0 entries`, ASCA `Container Novice … 0 entries`, `Exterior Open … 0 entries`.
  - SQL: actual counts are Exterior Excellent **66**, Interior Novice B **65**, Interior Advanced **65**, Buried Master **63**, Container Novice **63** ×2, Vehicle Advanced **63**, Exterior Open **63**, Container Novice A **3** (total **514**).
  - SQL: `classes.total_entries_count = 0` for **9 of 9** classes; `max(total_entries_count) = 0` across the whole table. `Container Novice A` has `scored_count = 3` while `total_entries_count = 0` — internally contradictory.
  - **Three sibling surfaces render the same data correctly**, which is how a secretary would notice: Show Desk `0 of 65 scored` / `0 of 66 scored` / `3 of 3 scored`; Manage Classes `Entries: 3` / `Entries: 65` / `Entries: 66`; ringside `0 / 66`, `3 / 3`; printed check-in sheet `Class Entries: 3`.
- **Root cause (source-verified):** the replication path passes a real map — `loadEntryCountsByShowMap(showId)` → `mapClassToShowScheduleTimelineRow(trial, cls, entryCountsMap)` — but the **PostgREST fallback** maps the dead column at [`timeline.ts:189`](../../apps/myk9show/src/services/database/trials/timeline.ts) (`totalEntriesCount: cls.total_entries_count ?? 0`), and [`getTrialTimelineRows`](../../apps/myk9show/src/services/database/trials/timeline.ts) at line 244 reads the same dead column with **no counts map at all**. Since the column is 0 table-wide, either of those paths can only ever render 0. This is the project's known replication/PostgREST dual-path divergence trap.
- **Possibly related signal:** console emitted `[entries] Skipping remote sync without show scope` ×4 during the walk, which is consistent with the fallback path serving.
- **User impact:** the secretary reads her own show as empty on the surface designed for scheduling and staffing. Decisions that depend on it — whether to combine or cancel an under-filled class, how much ring time to allocate, whether entries actually arrived — would be made on false zeros.
- **Intent check:** violates "Calm and oriented" and "Night before the trial: everything is handled". A number the user can disprove one tab away is the fastest way to lose trust.
- **Next action:** give the PostgREST fallback and `getTrialTimelineRows` the same entry-counts map the replication path uses; treat `classes.total_entries_count` as dead (no app code reads it anywhere else) and either backfill+maintain it or drop it.
- **Closure proof:** Setup schedule shows 63/65/66/3 in the browser with the replication cache cold (fallback path forced), plus a unit test pinning the fallback mapper to the counts map.

#### SEC-UX-02 — Closeout readiness counts every entry as unscored, so "safe to send" appears unreachable

- **Status:** new · **Classification:** product defect · **Confidence:** medium-high
- **Route:** `/shows/:showId/results-control` · **Viewports:** all
- **Observed:** "Results readiness — Here's what is still blocking closeout." then **"514 unscored entries"**, "8 unreleased classes", "514 entries in 9 classes".
- **Expected:** **511** unscored.
- **Evidence:**
  - SQL: `total 514, scored 3, unscored 511`. The three scored entries are unambiguous — `is_scored = true`, `result_status = 'qualified'`, `total_score = '100'`, `entry_status = 'completed'` (armbands 100/103/105).
  - The same page's "8 unreleased classes" _is_ correct (1 of 9 released), so the page is not uniformly stale — only the unscored count is wrong.
  - `buildResultsReadinessSummary` ([`readinessSummary.ts:28`](../../apps/myk9show/src/pages/secretary/ResultsControlPage/readinessSummary.ts)) counts `!hasResult(entry)`, and `hasResult` reads `entry.score || entry.time || entry.placement` plus `entry.status` — none of which are the DB columns (`total_score`, `result_status`, `entry_status`). It never consults `is_scored`.
  - `safeToSend` (line 36) requires `unscoredEntries === 0`.
- **User impact:** the readiness verdict over-reports blocking work and, if it counts _all_ entries regardless of scoring, can never reach zero — so the closeout checklist stays permanently red and `safeToSend` never fires. The feature built to answer "what's blocking me?" answers it wrongly, and the secretary must verify closeout by other means.
- **Intent check:** violates "After the show: that went smoothly" and the readiness-chip rule ("a readiness chip may only ship if its destination contains the affordance that clears it" — here nothing can clear it).
- **Residual uncertainty (stated honestly):** I proved 3 of 3 scored entries are miscounted and read the selector, but did not observe the mapped entry object, so "can never reach zero" is a strong inference from n=3 rather than a demonstration.
- **Next action:** align `hasResult` with the replicated entry shape (or read `is_scored`), and add the pinning test below.
- **Closure proof:** unit test feeding `buildResultsReadinessSummary` the replication-mapped shape for a scored entry and asserting it is excluded; then browser check that scoring an entry decrements the count.

#### SEC-UX-03 — Printed check-in sheet leaves the HANDLER column blank for every entry

- **Status:** new · **Classification:** product defect · **Confidence:** high
- **Route:** `/shows/:showId/reports` → Check-in Sheet preview · **Viewports:** print/preview (viewport-independent)
- **Observed:** sheet columns `GATE ARMBAND CALL NAME BREED REG # HANDLER`; every row prints armband, call name and breed but **HANDLER empty** — e.g. `100 Willow Labrador Retriever` with no handler.
- **Expected:** the handler's name.
- **Evidence:** SQL for that class — all three entries have `handler_id` set and resolve to names (`Exhibitor Exhibitor`, `Exhibitor Exhibitor`, `Test Secretary`). The data exists; the report does not print it.
- **Deliberately excluded:** the adjacent blank `REG #` column is **not** a defect — those dogs have no `dog_registrations` rows at all, so blank is honest. Verified by query rather than assumed.
- **User impact:** the check-in sheet is the paper the gate steward uses at the ring to call dogs and confirm the right handler presented. Printing it without handlers degrades the show-day fallback that exists precisely for when devices fail.
- **Intent check:** violates "After the show: results export and judge reports done in clicks" and the show-day reliability tie-breaker.
- **Existing reference:** [MYK9-30](https://linear.app/myk9-platform/issue/MYK9-30/print-testing-on-venue-hardware-check-in-sheets-scoresheets-labels) _"Print testing on venue hardware (check-in sheets, scoresheets, labels)"_ (Backlog) — that issue plans hardware print testing; this is a content defect that such testing would have caught, and should be fixed before it runs.
- **Next action:** wire the handler name into the check-in-sheet template from `entries.handler_id → people`.
- **Closure proof:** regenerate the Check-in Sheet preview in the browser and confirm handler names render for armbands 100/103/105.

### P2

#### SEC-UX-04 — "Updated just now" text overlaps the show title and the AKC chip in the workbench header

- **Status:** new · **Classification:** UX defect · **Confidence:** high
- **Route:** all `/shows/:showId/*` workbench tabs with the full hero · **Viewports:** desktop confirmed; tablet not observed; mobile not observed
- **Evidence (geometry, same instant):** live-region "Updated just now" occupies **x 812→951, y 203→223**; the show title "Heartland Scent Work Classic" occupies **x 513→868, y 189→221** → **56px horizontal overlap**. The `AKC` chip at x 880→932 also falls inside the status text's span. Both nodes are `position: static`, `z-index: auto` — a layout collision, not a stacking issue. Two screenshots show the title garbled behind the text.
- **Note:** the element is transient, which is why the tablet/mobile cells are "not observed" rather than "pass".
- **User impact:** the show's name — the primary orientation anchor on every workbench tab — becomes briefly unreadable, and the registry chip with it.
- **Next action:** reserve space for the freshness indicator in the header row (or move it out of the title line).
- **Closure proof:** trigger a save/refresh on the workbench and confirm zero bounding-box intersection at 375/768/1280.

#### SEC-UX-05 — Manage Classes prints the judge's raw UUID instead of their name, and offers no way to assign a judge

- **Status:** new · **Classification:** product defect + UX · **Confidence:** high
- **Route:** `/shows/:showId/classes/:trialId` · **Viewports:** all
- **Evidence:** every class row renders `b0728006-4428-4b5d-8462-00015c26a35b`. SQL resolves that id to person **"Test Judge"**. The same assignment renders correctly as "Test Judge" on Setup, on Show Desk, in ringside, and on the printed check-in sheet. A programmatic scan for judge/assign affordances on the page returned **none**.
- **User impact:** a 36-character hex string in every row destroys scanability and tells a nontechnical secretary nothing. The page the prior audit asked to grow a judge column now has one that is unusable, and judge assignment still has no home here.
- **Intent check:** direct violation of "No software jargon in the UI".
- **Next action:** render the judge's display name; add an inline assign/change-judge action on the row.
- **Closure proof:** class rows read "Test Judge" and an assign action is reachable from this page.

#### SEC-UX-06 — At tablet width the review queue's per-row "Review registration" action is clipped off-screen

- **Status:** new · **Classification:** UX/accessibility · **Confidence:** high
- **Route:** `/shows/:showId/entry-management` · **Viewports:** **768 fail**; 1280 pass; 375 pass (stacked layout)
- **Evidence:** "Review registration" occupies **x 777→905** on a **768px** viewport — it begins 9px past the right edge. Its row container has `clientWidth 408` vs `scrollWidth 616` (208px hidden) and the clipping ancestor is `overflow-hidden rounded-xl border …` with `overflow-x: hidden`; no ancestor between the row and that card is x-scrollable, and `document.body.scrollWidth` (757) is _below_ the viewport width, so the page offers no horizontal scroll to recover it. The "Next action" column header is clipped identically.
- **Mitigation (why P2, not P1):** the row carries `cursor-pointer`, `role="listitem"` and `tabindex="0"`, so tapping or keyboard-activating the row is a likely working fallback — but it is undiscoverable, and `listitem` is not an interactive role, so assistive tech will not announce it as actionable.
- **User impact:** on the viewport most likely to be used at a show desk, the primary next-step affordance in the entry-review queue is invisible with no scroll to reveal it.
- **Intent check:** violates "No dead ends" and the affordance-clarity guardrail; wide content must scroll inside its own container.
- **Existing reference:** [MYK9-57](https://linear.app/myk9-platform/issue/MYK9-57/fix-manager-tablet-layout-at-768-1023px) _"Fix manager tablet layout at 768–1023px"_ — closed **Done 2026-07-17**, **reopened 2026-07-30**. This is a recurrence in the same band **and on a surface that issue named explicitly** — its description calls out "Entry Management's title collapses into a near-vertical word" and the dense Registration View table, and it carries a "usable 44px touch targets" criterion. The title/description symptoms are gone; the row layout and touch targets are not, so this is an **incomplete fix on an in-scope surface**, not a newly discovered one. Its light/dark 768×1024 screenshot evidence did not prevent the recurrence — which argues for a responsive assertion rather than screenshots.
- **Next action:** let the row grid reflow or scroll at ≤768px; give the row an interactive role if row-tap is intended.
- **Closure proof:** at 768px the action is visible without horizontal scrolling; and confirm whether row-tap navigates (this also settles P1-vs-P2).

#### SEC-UX-07 — Muted text fails WCAG AA on the show-day attention cards

- **Status:** new · **Classification:** accessibility · **Confidence:** high
- **Route:** `/shows/:showId/show-desk` (token used app-wide) · **Viewports:** all
- **Evidence (measured with correct alpha compositing over the full background stack):** foreground `rgb(140,131,118)` at **14px / weight 400**:
  - on the tinted attention card (`rgb(41,32,29)` blended) → **4.26:1 — fails AA** (needs 4.5:1)
  - on plain card (`rgb(30,28,25)`) → **4.55:1** — passes by 0.05
  - on page background (`rgb(24,20,17)`) → 4.9:1 — passes
  - headings by contrast are fine (16.11:1)
- **Method note:** my first pass treated semi-transparent backgrounds as opaque and produced junk ratios (1.35, 2.59); those are discarded. The numbers above blend each `rgba` layer over its ancestors.
- **User impact:** the failing text is the _description line_ of the show-day "needs attention" cards — read under time pressure, often outdoors, by the retired volunteers INTENT names explicitly.
- **Intent check:** violates "High contrast text — WCAG AA minimum, prefer AAA for primary content".
- **Next action:** lighten the muted token, or stop pairing it with tinted card backgrounds at 14px.
- **Closure proof:** automated axe/contrast pass over Show Desk with zero AA violations.

#### SEC-UX-08 — The workbench hero pushes the actual work 2.5 screens below the fold, and the same workbench has two different headers

- **Status:** new · **Classification:** UX / cognitive load · **Confidence:** high
- **Route:** `/shows/:showId/entry-management` (and Reports / Results / Submit) · **Viewports:** 375 worst, 768 bad, 1280 noticeable
- **Evidence (measured offsets on `375×812`):** "Entry Management" heading at **y=1352** (1.7 screens), queue filter bar at **y=1670** (2.1 screens), **first registration row at y=2016 — 2.48 viewport heights** below the top; total page 2651px. At 768×1024 the first row is at y=1698 (1.7 screens). The hero (AUG/1–3 block + title + Total Entries/Location/Fee/Payment strip + Premium List and Public Landing Page cards) consumes roughly the top 410px at 1280 and the entire first screen at 375.
- **Internal inconsistency:** **Show Desk renders the same show identity in a compact ~110px header** (breadcrumb + name + club + dates + status) with no hero and no publish cards. So four tabs of one workbench use a tall hero and the fifth uses a compact header — and the compact one is the better fit for a working surface.
- **User impact:** the secretary's most frequent task (work the entry queue) begins with two and a half screens of scrolling past information she already knows on the device she is most likely to hold.
- **Intent check:** violates "Respect the Clock" and "Every common action completes in 1-2 taps".
- **Consolidation note:** the fix is to adopt the header Show Desk already has, not to add a new compact view — see §6.
- **Existing references:** [MYK9-64](https://linear.app/myk9-platform/issue/MYK9-64/the-secretarys-show-details-page-looks-too-complicated) _"The secretary's show details page looks too complicated"_ (Done 2026-07-20) and [MYK9-8](https://linear.app/myk9-platform/issue/MYK9-8/complete-responsive-secretary-setup-and-show-desk-re-walk) _"Complete responsive secretary Setup and Show Desk re-walk"_ (Done 2026-07-15). The complexity complaint MYK9-64 recorded persists in measurable form on the **work tabs** (Show Desk itself, which MYK9-8 covered, is the surface that got it right).
- **Next action:** collapse the hero to the Show Desk treatment on the work tabs (or make it collapsible and remember the choice).
- **Closure proof:** first queue row within one viewport height at 375×812.

#### SEC-UX-09 — Armband lookup overflows the viewport at 375px and collides with the wrapped breadcrumb

- **Status:** new · **Classification:** UX defect · **Confidence:** high
- **Route:** all `/shows/:showId/*` · **Viewports:** **375 fail**; 768/1280 pass
- **Evidence:** the armband form, its label and its input all report `right: 385` on a **375px** viewport — **10px clipped** — driven by `min-w-[176px]` on the wrapper, while page-level scroll width stays 375 (so the clipped part is unreachable). Screenshot shows the breadcrumb "Home > Shows > Heartland Scent Work Classic" wrapping to four lines in a narrow column with the "Armband lookup" label and "Armband #" input clipped at the right edge beside it.
- **Related history:** this is the same control the prior walk flagged for truncating to "Armban". The **label was fixed** (it now has a proper `<label>`); the container now overflows at mobile instead.
- **Next action:** let the armband control drop below the breadcrumb at narrow widths instead of holding a 176px minimum.
- **Closure proof:** no element exceeds the viewport width at 375 on the workbench shell.

#### SEC-UX-10 — 23 touch targets below the 44px INTENT floor on mobile (19 on tablet)

- **Status:** new · **Classification:** accessibility · **Confidence:** high
- **Route:** `/shows/:showId/entry-management` · **Viewports:** 375 (23), 768 (19), 1280 (not measured)
- **Evidence (measured):** "Generate & publish premium" 273×**32**; "Published show" 161×**34**; the four queue filters ("Needs review", "Missing information", "Payment due", "All registrations") 40px tall; "More show actions" 40×40; armband input 176×40; breadcrumb "Home" **24×24**; breadcrumb "Shows" 46×**20**.
- **Intent check:** INTENT requires "minimum 44x44px, prefer 48x48px on tablet views". The primary "Add entry" button does comply (142×44), so the standard exists in-house.
- **User impact:** a 24×24 target is a miss-prone tap for the persona INTENT describes; the queue filters are the main navigation of the review workflow.
- **Next action:** raise control heights to 44px (48px at tablet) on the workbench shell and entry-management toolbar.
- **Closure proof:** zero sub-44px interactive controls at 375 and 768 on this route.

#### SEC-UX-11 — "1 class needs judge signature" attention card has no action, while its siblings do

- **Status:** new · **Classification:** UX defect · **Confidence:** high
- **Route:** `/shows/:showId/show-desk` · **Viewports:** all
- **Evidence:** in the "Needs attention · 7" strip, the "Check in 504 entries" and "Review 3 entries" cards each carry a link (to entry-management with a returnTo), but the "1 class needs judge signature" card carries **no button or link**. The clearing action — "Collect judge signature" — exists lower on the same page on the Container Novice row.
- **User impact:** the flagged problem is a dead end at the point of flagging; the user must find the fix elsewhere unaided. This is the same failure shape as the prior walk's Critical fix-it-chip dead ends, at smaller scale.
- **Intent check:** violates the explicit rule "Readiness chips land on the fix … a readiness chip may only ship if its destination contains the affordance that clears it."
- **Next action:** link the card to the class row / signature action (a deep link, not a new surface).
- **Closure proof:** the card carries an action that reaches "Collect judge signature".

### P3

| ID        | Finding                                                                                               | Status                                       | Route                                      | Evidence                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-UX-12 | **"Trial Saturday Trial"** doubling; printed official form reads **"Trial #: Saturday Trial"**        | **unchanged** (prior §T; run 2)              | Setup, Show Desk, ringside, check-in sheet | Root-caused: `trials.trial_number` holds the _name_ (`'Saturday Trial'`, SQL-confirmed) and `trialLabel()` in [`CompactScheduleTimeline.tsx:35`](../../apps/myk9show/src/components/schedule/CompactScheduleTimeline.tsx) prefixes `Trial ${trial.trialNumber}`. Now on **4 surfaces including printed paperwork**, which is why it is no longer cosmetic-only. |
| SEC-UX-13 | Class status vocabulary still drifts: **"Complete"** (Show Desk) vs **"Completed"** (Setup, ringside) | **unchanged** (prior C4, partially resolved) | Show Desk vs Setup/ringside                | Prior C4's worse halves are fixed ("No Status" → "Not started"; "Upcoming" gone; ringside now "Completed"/"Not started"). Only Complete/Completed remains.                                                                                                                                                                                                      |
| SEC-UX-14 | Attention cards repeat one sentence as heading, description **and** button label                      | new                                          | Show Desk                                  | "Check in 504 entries" ×3 and "Review 3 entries" ×3 at y 602/632/672 (verified as heading/description/CTA, not duplicate rendering). Reads as a rendering bug.                                                                                                                                                                                                  |
| SEC-UX-15 | Dashboard copy: **"1 item need attention across your shows"**                                         | new                                          | `/secretary/dashboard`                     | Subject-verb disagreement. (The prior C6 _scope_ ambiguity is fixed — "across your shows" now labels it.)                                                                                                                                                                                                                                                       |
| SEC-UX-16 | Mobile account avatar shows **"E"** (email-derived) while sidebar identity says **"Test"**            | new                                          | shell, 375                                 | `button[aria-label="Account menu"]` text `E` vs sidebar `Account menu for Test, Secretary +2`. Two identity derivations after the account-menu consolidation (#1521/#1524, #1518).                                                                                                                                                                              |
| SEC-UX-17 | Queue filter buttons expose no selected state to assistive tech                                       | new                                          | entry-management                           | All four report `aria-pressed: null`, `aria-current: null`, `data-state: null`. Selection **is** conveyed visually (confirmed by screenshot), so this is a11y-only.                                                                                                                                                                                             |
| SEC-UX-18 | Duplicate checkbox nodes per row in the a11y tree, one named "on"                                     | new                                          | entry-management                           | Tree shows `checkbox "Select Exhibitor Exhibitor"` **plus** `checkbox "on"` for every row, and the same pair for select-all. Screen readers announce two checkboxes per row, one meaninglessly named.                                                                                                                                                           |
| SEC-UX-19 | Five date formats for the same show                                                                   | new                                          | across surfaces                            | `Aug 1–3, 2026` (Shows list) / `Aug 1-3, 2026` (Show Desk, hyphen) / `AUG 1–3` (hero) / `8/1/2026` (report) / `Saturday, August 1, 2026` (Setup) / `Sat, Aug 1, 2026` (ringside). All **correct** now — only style varies (prior C2's one-day drift is gone).                                                                                                   |
| SEC-UX-20 | Copy nits                                                                                             | new                                          | several                                    | **"No confirmation"** on every registration row is ambiguous (no confirmation number? no email sent? exhibitor didn't confirm?). **"Immediately·Check-in"** missing spaces around the separator on Results & Check-In override rows. "514 entries need AKC registration numbers before sending." rendered **3×** on Submit Results.                             |
| SEC-UX-21 | Entry deadline falls **after** the show ends, with no warning                                         | new                                          | hero, all workbench tabs                   | Header shows `Closes Sep 1` beside `AUG 1–3`. SQL confirms this is faithful rendering (`entry_close_date = 2026-09-01`, `end_date = 2026-08-03`) — so the defect is the **absence of validation/warning** for an impossible configuration, not a formatter bug. The flagship fixture currently exhibits it.                                                     |

### Environment / data-hygiene (reported separately, not product defects)

| ID         | Item                                                                                                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-ENV-01 | **511 synthetic load-test registrations pollute the only demo show** on shared Supabase                 | Every row in "All registrations (514)" is `Exhibitor Exhibitor` / dog **"Load 01"** / `Accepted` / `Paid online`, from the G9 capacity rehearsals (#1511/#1519). The rows are indistinguishable, and they drive the 514s that appear in the hero, readiness verdict, and Submit Results warnings. Consequence for future walks: the flagship secretary fixture no longer resembles a real show. **Recommend a cleanup pass and a load-fixture teardown step.** |
| SEC-ENV-02 | Report preview renders the entire report inline — **18,272px tall** iframe (≈230 pages) for 514 entries | `/shows/:showId/reports`. Legitimate at this scale, but worth a pagination/virtualization decision before real 500-entry shows, given G9 exists to prove that scale.                                                                                                                                                                                                                                                                                           |
| SEC-ENV-03 | "Interactive map not configured"                                                                        | Setup venue panel. Config language surfaced to the secretary; likely local-env-only (map tiles were the subject of #1501/#1502). Flagged with that caveat rather than asserted as a product defect.                                                                                                                                                                                                                                                            |

### Console (low-priority implementation warnings)

- `[entries] Skipping remote sync without show scope` ×4 — noted because it is consistent with the PostgREST fallback serving, which is the path implicated in **SEC-UX-01**.
- `Base UI: CSS transitions and CSS animations both detected on Collapsible or Accordion panel. Only one of either animation type should be used.` ×2.
- No console **errors** on any route walked.

---

## 4. Rejected hypotheses (investigated and disproved — do not re-raise)

Recording these so a future walk does not spend budget re-deriving them.

| Hypothesis                                                                                                             | Why rejected                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard/Show Desk deep links use a stale param vocabulary** (`?mode=…&attention=…` ignored in favour of `?queue=`) | **Disproved by clean test.** My first test was confounded by including `queue=all` alongside `attention=pending`. Unconfounded: `?mode=review&attention=pending` → default needs-review queue (3 rows); `?mode=day-of&attention=accepted` → `?queue=all` (514). The params _are_ translated into the `queue` vocabulary and the URL normalised. Deep-link pre-filtering works. |
| **Scroll is locked on the show workbench**                                                                             | Environment. `document.hidden === true` / `visibilityState: "hidden"` — the browser pane was backgrounded, which suppresses scrolling. No scroll-lock in the DOM (`overflow: visible` on html and body).                                                                                                                                                                       |
| **The 514-row queue renders zero rows**                                                                                | Selector error on my part (`> li` against rows that are `div[role=listitem]`). 50 of 514 render correctly.                                                                                                                                                                                                                                                                     |
| **`REG #` blank on the check-in sheet is a regression from the registry-column migration**                             | Honest blank — those dogs have **no `dog_registrations` rows at all** (verified by query). Only the adjacent HANDLER column is a defect (SEC-UX-03).                                                                                                                                                                                                                           |
| **Main content renders dimmed / veiled**                                                                               | Screenshot rasterization artifact of the backgrounded pane. Verified live: `main` has `opacity: 1`, `pointer-events: auto`, no fixed overlay, no `aria-busy`.                                                                                                                                                                                                                  |

### Walk errors (not findings)

| Item                                      | Detail                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Add entry" appeared to be a dead control | It is a Base UI `PopoverTrigger` ("Who are you entering?" → `SecretaryAddEntriesDecision`). Synthetic clicks do not open Base UI popovers — the same calibration limit the prior walk documented. Not reported as a defect. Verified instead by source and by visiting the destination route directly. |

---

## 5. Prior-walk fix re-verification

Re-walked against the last two secretary walks — [2026-07-01 Claude](2026-07-01-secretary-journey-ux-audit.md) (marked _Remediated — verified 2026-07-05_) and [2026-06-17 rewalk](2026-06-ux-journeys/04-secretary-rewalk-2026-06-17.md) — plus the closure record in `docs/archive/handoff-ux-remediation-remaining-2026-07.md`.

**19 verified fixed in the browser. 1 blocked. 2 still open (carried as SEC-UX-12/13).**

| Prior finding                                                                 | Prior severity | Result            | Browser evidence                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Exhibitor info not published yet" chip targets a card with no publish action | **Critical**   | ✅ **verified**   | Show Desk banner "Premium list is not published — Review show details" → `href="/shows/:id#setup-publish"`; that page carries the working **"Generate & publish premium"** button. Chip now lands on the clearing affordance.                            |
| "Judges not assigned" chip → Manage Classes where judges cannot be assigned   | **Critical**   | ⛔ **blocked**    | Requires a draft show with an unassigned class. The shared DB now contains **exactly one show** (published, fully configured). See §7. Related: judge assignment still has no action on Manage Classes (SEC-UX-05).                                      |
| Show dates differ by a day between list and header (C2)                       | **Critical**   | ✅ **verified**   | Shows list `Aug 1–3, 2026` = hero `AUG 1–3` = Show Desk `Aug 1-3, 2026` = report `8/1/2026` = Setup `Saturday, August 1, 2026` = DB `2026-08-01`/`2026-08-03`. Drift gone.                                                                               |
| 9 vs 12 pending-review counts (C1)                                            | High           | ✅ **verified**   | Dashboard "3 pending entries" → Entry Management "Needs review **3**" and "Showing 1–3 of **3** registrations".                                                                                                                                          |
| Check-in sheets print "Judge: TBD" while judges are assigned (C3)             | High           | ✅ **verified**   | Sheet prints `Judge: Test Judge`. The 4 remaining `TBD`s match the 4 genuinely unassigned classes.                                                                                                                                                       |
| "New Entry" opens the exhibitor "Register for Show" wizard                    | High           | ✅ **verified**   | `/secretary/register/:showId` renders breadcrumb "… / Mail-in entry", title **"Add mail-in entry"**, subtitle **"Enter on behalf of an exhibitor."**; no "Register for Show" anywhere. A "Who are you entering?" disambiguation step was added upstream. |
| Ringside class list has no exit                                               | High           | ✅ **verified**   | `/at-show/:showId` opens with **"Back to Show Desk"** as its first element — including the staff-specific label.                                                                                                                                         |
| Dead pencil button on every class row                                         | High           | ✅ **verified**   | Pencils gone; rows now carry labelled `More actions for <Class>` menus.                                                                                                                                                                                  |
| Results & Check-In is settings, linked as "Verify results"                    | High           | ✅ **verified**   | Page now leads with **"Results readiness — Here's what is still blocking closeout."** above the settings, and points at the sticky Release Results bar. (Its unscored number is wrong — SEC-UX-02 — but the structural fix landed.)                      |
| Wizard silent-disabled Next with no "what's missing"                          | Medium         | ✅ **verified**   | Mail-in step 1 renders **"Select at least one dog to continue."** beside the disabled Next.                                                                                                                                                              |
| "My Shows (0)" vs "Managing (3)" labels                                       | Medium         | ✅ **verified**   | Tabs read **"Managing 1"** and **"Entered as exhibitor 0"** — the recommended relabel.                                                                                                                                                                   |
| Manage Classes outside the workbench shell                                    | Medium         | ✅ **verified**   | `/trials/:id/classes` redirects to `/shows/:showId/classes/:trialId`; full show header, breadcrumb "Show setup / Manage classes", and the section nav are present.                                                                                       |
| "Back to Trial" label lies (history-back)                                     | Medium         | ✅ **verified**   | Now **"Back to Setup"**.                                                                                                                                                                                                                                 |
| Waitlist links go to a global page, dropping show context                     | Medium         | ✅ **verified**   | "Manage Waitlist" → `/shows/:showId/entry-management?tab=waitlist&trial=:trialId` — show _and_ trial pre-applied. Exactly the consolidation pattern CLAUDE.md prescribes.                                                                                |
| Status vocab drift (C4) + "No Status" label                                   | Medium         | ⚠️ **partially**  | "No Status" → "Not started" ✅; ringside/Setup aligned ✅; **Complete vs Completed remains** → carried as SEC-UX-13.                                                                                                                                     |
| Unlabeled ArmbandLookup in the breadcrumb bar                                 | Medium         | ✅ **verified**   | Proper `<label>Armband lookup</label>`. (New mobile overflow on the same control → SEC-UX-09.)                                                                                                                                                           |
| Download XML enabled while page warns of missing reg numbers                  | Medium         | ✅ **verified**   | Now **"Download draft XML"**.                                                                                                                                                                                                                            |
| Disabled "Send to AKC" reason not attached to the button                      | Medium/High    | ✅ **verified**   | `disabled=true`, `title="514 entries need AKC registration numbers before sending."`, `aria-describedby="send-results-disabled-reason"` — wired for assistive tech too.                                                                                  |
| `akcDogRegnum` jargon                                                         | Medium         | ✅ **verified**   | Reads "AKC registration numbers".                                                                                                                                                                                                                        |
| "Items need attention" scope unlabeled (C6)                                   | Medium         | ✅ **verified**   | "1 item need attention **across your shows**" (scope labelled; grammar → SEC-UX-15).                                                                                                                                                                     |
| ISO dates in ringside class list (`2026-08-01`)                               | Low            | ✅ **verified**   | Now `Sat, Aug 1, 2026`.                                                                                                                                                                                                                                  |
| 8 unlabeled icon buttons on Manage Classes                                    | Low            | ✅ **verified**   | Programmatic scan: **0** unlabeled icon controls; all 5 labelled and all are shell chrome.                                                                                                                                                               |
| Dev latency metadata ("122ms") in mail-in dog search                          | Low            | ✅ **verified**   | No `NNNms` pattern anywhere on the mail-in route.                                                                                                                                                                                                        |
| "Trial Saturday Trial" doubling                                               | Low            | ❌ **still open** | → SEC-UX-12, now on 4 surfaces including printed paperwork.                                                                                                                                                                                              |
| Raw RPC error toast / ringside write-on-view (0.A)                            | High           | ⛔ **blocked**    | Deliberately not exercised — see §7.                                                                                                                                                                                                                     |
| Show Desk shows closeout/incidents a month pre-show (dormancy)                | Medium         | ⛔ **blocked**    | Show is T-3 days; needs a show >30 days out. Dormancy labelling ("During the show") does now exist.                                                                                                                                                      |

---

## 6. Consolidation observations (pre-launch phase constraint)

Per CLAUDE.md — consolidate, don't duplicate. **This walk recommends no new page, sheet, or dialog.** Every recommendation above is a fix, a deep link, or the adoption of an existing pattern:

- **SEC-UX-08** explicitly recommends adopting the header **Show Desk already has**, not building a compact view. _Does this duplicate an existing page? No — it deletes a divergence between five tabs of one workbench._
- **SEC-UX-11** recommends a **deep link** from the attention card to the signature action already on that page — not a new signature surface.
- **SEC-UX-05** recommends fixing the judge column that already exists and adding an inline action to it — not a judge-assignment page.
- **SEC-UX-01/02/03** are data-path fixes; no UI is added.

**Duplication worth deleting:** `classes.total_entries_count` is a dead denormalized column — **no application code reads it** anywhere (verified by grep across `apps/` and `packages/`) except the two broken fallback mappers in SEC-UX-01. It should be dropped or maintained, not read.

**Positive consolidation observed:** the waitlist deep link (`?tab=waitlist&trial=`), the publish banner anchor (`#setup-publish`), the `returnTo` round-tripping on Show Desk attention links, and Manage Classes moving inside the workbench shell are all exactly the pattern the phase calls for. The `attention` → `queue` param translation (§4) is the mechanism working as designed.

---

## 7. Blocked coverage

A blocked check is a coverage gap, not a pass.

| #   | Blocked check                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                        | Fixture / proof required                                                                                              |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| B1  | Prior **Critical** "Judges not assigned" fix-it chip → destination can clear it | The shared DB holds **exactly one show**, published and fully configured (SQL confirmed). The ASCA/UKC draft shows the prior walks used are gone. Draft-show readiness chips cannot be rendered.                                                                                                                                                                                                                                           | A **draft show with ≥1 class lacking a judge assignment**, owned by the secretary account.                            |
| B2  | Ringside write-on-view suppression (prior 0.A)                                  | Deliberately not exercised. Tapping a ringside entry card is the exact trigger that produced the `ringside_update_entry` OCC conflict storm recorded as a P0 in `docs/qa/findings.md` (platform-wide 503s) and still open as [MYK9-115](https://linear.app/myk9-platform/issue/MYK9-115/prevent-ringside-occ-conflict-storms-from-causing-a-production-scoring) (Todo); ringside writes are prohibited in QA runs against shared Supabase. | An isolated local Supabase fixture, or a code-level regression test asserting a view-intent tap enqueues no mutation. |
| B3  | Show Desk pre-show dormancy (prior 4.H)                                         | Show is **T-3 days**; the "month before" condition cannot be produced without editing show dates on the shared DB.                                                                                                                                                                                                                                                                                                                         | A show >30 days out, or unit coverage of the dormancy-window logic.                                                   |
| B4  | "Add entry" popover contents in-browser                                         | Base UI popovers do not open under synthetic click (walk error, §4).                                                                                                                                                                                                                                                                                                                                                                       | Real user-event driving, or a Playwright spec; flow already verified via source + its unit test.                      |
| B5  | SEC-UX-04 header overlap at 768 / 375                                           | The transient live-region was not present on those loads.                                                                                                                                                                                                                                                                                                                                                                                  | Trigger a save/refresh and re-measure at each viewport.                                                               |

---

## 8. Coverage matrix — routes walked vs skipped

Route inventory derived from the live router (the `audit-pages` secretary list is **stale**: it omits the `/shows/:showId/*` workbench entirely and still lists `/secretary/entries/:showId`, `/secretary/results-control`, `/secretary/reports` as the primary surfaces — worth updating).

### Walked

| Route                                                              | 1280 | 768 | 375 | Notes                                                                            |
| ------------------------------------------------------------------ | ---- | --- | --- | -------------------------------------------------------------------------------- |
| `/sign-in` (two-step)                                              | ✅   | —   | —   | Real flow; email step → password step in place with an "Edit" affordance. Clean. |
| `/secretary/dashboard`                                             | ✅   | —   | —   | SEC-UX-15                                                                        |
| `/shows/:showId` (Setup/Overview; `/setup` redirects here)         | ✅   | —   | —   | **SEC-UX-01**, SEC-UX-21, SEC-ENV-03                                             |
| `/shows/:showId/show-desk`                                         | ✅   | —   | —   | SEC-UX-07, SEC-UX-11, SEC-UX-14; counts correct here                             |
| `/shows/:showId/entry-management`                                  | ✅   | ✅  | ✅  | **SEC-UX-06**, SEC-UX-08/09/10/17/18/20                                          |
| ↳ queues + `?queue=all` + `?mode=/attention=` variants             | ✅   | —   | —   | §4 rejected hypothesis                                                           |
| `/shows/:showId/reports` + check-in sheet preview                  | ✅   | —   | —   | **SEC-UX-03**, C3 ✅, SEC-ENV-02                                                 |
| `/shows/:showId/results-control`                                   | ✅   | —   | —   | **SEC-UX-02**; 4.G ✅                                                            |
| `/shows/:showId/submit-results`                                    | ✅   | —   | —   | 4 prior fixes ✅; SEC-UX-20                                                      |
| `/shows/:showId/classes/:trialId` (via `/trials/:trialId/classes`) | ✅   | —   | —   | **SEC-UX-05**; 4 prior fixes ✅                                                  |
| `/shows` (browse, Managing)                                        | ✅   | —   | —   | C2 ✅, "Entered as exhibitor" ✅                                                 |
| `/at-show/:showId` (ringside class list)                           | ✅   | —   | —   | Exit ✅, vocab ✅, dates ✅; SEC-UX-12                                           |
| `/secretary/register/:showId` (mail-in, step 1)                    | ✅   | —   | —   | 4.F ✅, silent-Next ✅, latency leak ✅                                          |

Viewport legend: ✅ walked. `—` not exercised at that viewport (mobile/tablet effort was concentrated on the workbench shell and entry-management, the highest-traffic secretary surfaces).

### Skipped — coverage gaps, not passes

| Route                                                                                                                                 | Why it matters                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/secretary/create-show/wizard`, `/secretary/create-show`                                                                             | The cold secretary's **first** task; prior audit found silent-disabled Next and a blocking field below the fold. Only the _mail-in_ wizard was walked. **Highest-value gap.**                                                                                                             |
| `/secretary/shows/:showId/edit`                                                                                                       | Where judge assignment actually lives (per prior Critical #1).                                                                                                                                                                                                                            |
| `/secretary/waitlist`, `?tab=waitlist`                                                                                                | Deep-link target verified as a _link_; the destination content was not walked.                                                                                                                                                                                                            |
| `/secretary/day-of`, `/secretary/check-in`, `/secretary/run-order`                                                                    | Show-day surfaces; reliability tie-breaker.                                                                                                                                                                                                                                               |
| `/secretary/results-submission`, `/secretary/reports`                                                                                 | Legacy standalone twins of workbench tabs — worth checking for duplication.                                                                                                                                                                                                               |
| `/secretary/messages`, `/secretary/messages/:showId`, `/messages/:showId`                                                             | Broadcast/communication path.                                                                                                                                                                                                                                                             |
| `/secretary/volunteers`, `/secretary/volunteer-scheduling`, `/secretary/tasks`, `/secretary/settings`, `/secretary/pipeline/:trialId` | Not exercised at all.                                                                                                                                                                                                                                                                     |
| `/at-show/:showId/class/:classId` and `/score/:entryId`                                                                               | Deliberately avoided (B2).                                                                                                                                                                                                                                                                |
| `/shows/:showId/trials/:trialId/...`, `/scoring/classes/:classId/entries`                                                             | Class/scoring detail.                                                                                                                                                                                                                                                                     |
| `/dogs`, `/clubs`, `/people`, `/users/:id`                                                                                            | Browse surfaces the secretary reaches from the sidebar.                                                                                                                                                                                                                                   |
| `/my-entries`, `/exhibitor/entries`                                                                                                   | The secretary's "As Exhibitor" sidebar section.                                                                                                                                                                                                                                           |
| `/tv/:showId`, `/notifications`, `/account`, `/support`                                                                               | Peripheral.                                                                                                                                                                                                                                                                               |
| Public view of `/shows/:showId` signed **out**                                                                                        | Prior Codex finding (no "preview as exhibitor"): **still structurally true** — "Copy Link" yields `/shows/:showId`, which for the signed-in secretary renders management chrome _and_ the show access codes, so she cannot see what exhibitors see. Not walked signed-out, so not graded. |

Light/dark: walked in **dark** theme only (`html.theme-dark dark`). Light-mode contrast unverified — relevant to SEC-UX-07.

---

## 9. Compact lifecycle ledger

`ID | P# | source severity | status | first/last seen | runs | owner | evidence | next proof`

```
SEC-UX-01 | P1 | High   | unchanged (recurrence of MYK9-65, closed Done 2026-07-19) | 2026-07-19/2026-07-29 | 2 | MYK9-65 (reopened 2026-07-30) | Setup "0 entries" x9 vs SQL 63-66 (514); total_entries_count=0 for 9/9, max 0 table-wide; ShowDesk/ManageClasses/ringside/report all correct; timeline.ts:189 + :244 map dead column | cold-cache browser check shows 63/65/66/3 + fallback-mapper unit test
SEC-UX-02 | P1 | High   | new       | 2026-07-29/2026-07-29 | 1 | MYK9-118 | readiness "514 unscored" vs SQL 511 (3 scored: is_scored=t, result_status=qualified, total_score=100); readinessSummary.ts:28 hasResult reads score/time/placement/status, never is_scored; safeToSend needs 0 | unit test on buildResultsReadinessSummary with mapped scored entry
SEC-UX-03 | P1 | High   | new       | 2026-07-29/2026-07-29 | 1 | MYK9-119 | check-in sheet HANDLER blank all rows; SQL handler_id set, resolves to names; REG# blank verified honest | regenerate preview, handler names render for armbands 100/103/105
SEC-UX-04 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | "Updated just now" x812-951 overlaps title x513-868 by 56px + AKC chip; both static/z-auto; 2 screenshots | zero bbox intersection at 375/768/1280
SEC-UX-05 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | Manage Classes rows print b0728006-...-a35b; SQL resolves to person "Test Judge"; 0 judge/assign affordances on page | rows read "Test Judge" + inline assign action
SEC-UX-06 | P2 | High   | unchanged (recurrence of MYK9-57, closed Done 2026-07-17) | 2026-07-17/2026-07-29 | 2 | MYK9-57 (reopened 2026-07-30) | @768 "Review registration" x777-905 vs vw768; row card clientW408/scrollW616 overflow-x hidden, no scrollable inner ancestor, body.scrollWidth 757 | action visible @768 w/o h-scroll; confirm row-tap navigates
SEC-UX-07 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | rgb(140,131,118) 14px/400: 4.26:1 on tinted attention card (fails AA), 4.55:1 plain, 4.9:1 page bg; alpha-composited | axe contrast pass on Show Desk, 0 AA violations
SEC-UX-08 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | @375x812 first queue row y=2016 (2.48 viewports), heading y=1352, queue bar y=1670; @768 y=1698; Show Desk uses ~110px compact header for same identity | first row within 1 viewport @375
SEC-UX-09 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | @375 armband form/label/input right=385 vs vw375 (min-w-[176px]); page scrollWidth stays 375; screenshot shows breadcrumb collision | no element exceeds vw @375
SEC-UX-10 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | @375 23 sub-44px targets (Home 24x24, Shows 46x20, premium 273x32, status 161x34, queues h40); @768 19; "Add entry" 142x44 complies | 0 sub-44px controls @375/@768
SEC-UX-11 | P2 | Medium | new       | 2026-07-29/2026-07-29 | 1 | unassigned | Show Desk "1 class needs judge signature" card has no link/button; siblings do; "Collect judge signature" exists lower on same page | card carries action reaching signature control
SEC-UX-12 | P3 | Low    | unchanged | 2026-07-01/2026-07-29 | 2 | unassigned | "Trial Saturday Trial" on Setup/ShowDesk/ringside + "Trial #: Saturday Trial" on printed form; SQL trial_number='Saturday Trial'; trialLabel() CompactScheduleTimeline.tsx:35 | rename field or label; 4 surfaces clean incl. print
SEC-UX-13 | P3 | Medium | unchanged | 2026-07-01/2026-07-29 | 2 | unassigned | "Complete" (Show Desk) vs "Completed" (Setup/ringside); prior C4 otherwise resolved | one shared status-label map
SEC-UX-14 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | Show Desk attention cards repeat sentence x3 as heading/desc/CTA (y602/632/672) | distinct heading/desc/action copy
SEC-UX-15 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | dashboard "1 item need attention across your shows" | pluralisation fixed
SEC-UX-16 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | @375 Account menu avatar "E" (email-derived) vs sidebar "Test, Secretary +2" | one identity derivation across shell
SEC-UX-17 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | 4 queue buttons aria-pressed/aria-current/data-state all null; selection visual only | selected queue exposed to AT
SEC-UX-18 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | a11y tree: per-row checkbox "Select <name>" + duplicate checkbox named "on"; same for select-all | one checkbox node per row, named
SEC-UX-19 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | 5 date formats, all correct values (C2 drift resolved) | one shared date formatter
SEC-UX-20 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | "No confirmation" ambiguous; "Immediately·Check-in" missing spaces; AKC reg warning rendered 3x | copy pass
SEC-UX-21 | P3 | Low    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | "Closes Sep 1" beside "AUG 1-3"; SQL entry_close 2026-09-01 vs end 2026-08-03 => missing validation, not formatter bug | wizard/edit warns when entry close > start
SEC-ENV-01 | P2 | -      | new (env) | 2026-07-29/2026-07-29 | 1 | ops | 511 "Load 01" load-test registrations on the only demo show (shared Supabase), all identical; drive the 514s in hero/readiness/submit | cleanup + load-fixture teardown step
SEC-ENV-02 | P3 | -      | new (env) | 2026-07-29/2026-07-29 | 1 | unassigned | report preview iframe 18,272px tall for 514 entries | pagination/virtualisation decision
SEC-ENV-03 | P3 | -      | new (env) | 2026-07-29/2026-07-29 | 1 | unassigned | "Interactive map not configured" on Setup venue panel; likely local-env only | confirm on staging
```

**Filed 2026-07-30:** created MYK9-118 (SEC-UX-02), MYK9-119 (SEC-UX-03); reopened MYK9-65 (SEC-UX-01), MYK9-57 (SEC-UX-06). P2/P3 remain report-only.
**Existing refs reused:** MYK9-65 (SEC-UX-01) · MYK9-57 (SEC-UX-06) · MYK9-30 (SEC-UX-03) · MYK9-64 + MYK9-8 (SEC-UX-08) · MYK9-115 (B2)
**Blocked:** B1 draft-show judge chip · B2 ringside write-on-view · B3 pre-show dormancy · B4 Add-entry popover · B5 header overlap @768/@375
**Rejected:** stale deep-link params · workbench scroll lock · 514 rows not rendering · REG# blank · dimmed main content
**Resolved this run:** 19 prior findings (§5)

---

## 10. Top improvements, in order

1. **Give the two broken fallback mappers the entry-counts map** (SEC-UX-01) and drop or maintain `classes.total_entries_count` — no app code reads it. One fix removes the app's loudest self-contradiction.
2. **Make the closeout readiness verdict agree with `is_scored`** (SEC-UX-02) so "safe to send" can actually fire. The structure shipped; the arithmetic didn't.
3. **Print the handler on the check-in sheet** (SEC-UX-03). Smallest of the three P1s, most direct show-day consequence.
4. **Adopt Show Desk's compact header on the four work tabs** (SEC-UX-08) — deletes a divergence and reclaims 2.5 screens on mobile.
5. **One accessibility sweep on the workbench shell**: contrast token (SEC-UX-07), 44px targets (SEC-UX-10), mobile overflow (SEC-UX-09), tablet clipping (SEC-UX-06). These are the persona INTENT names, and they are the dimension the last remediation didn't cover.
6. **Render the judge's name, not their UUID** (SEC-UX-05), and give judge assignment an action where the chip points.
7. **Reseed the demo show** (SEC-ENV-01) and add load-fixture teardown, so the next walk audits something show-shaped.

---

## 11. Next proof

The single highest-value next run is the **show-creation wizard** (`/secretary/create-show/wizard`) at 375 and 1280 — the cold secretary's first task, the largest skipped route, and the surface where the entry-close validation gap (SEC-UX-21) would be caught. Pair it with a **draft show fixture** (B1) so the readiness-chip cluster — the prior walk's worst moment and the one Critical still unverified — can finally be re-tested.

---

_Walk side-effect note: no records created, edited, or deleted; no shared-DB writes; ringside entry cards deliberately untouched. One clipboard write ("URL copied"). The mail-in wizard was opened to step 1 and abandoned unsaved. Show access codes were displayed on the Setup surface during the walk and are deliberately not reproduced in this report._
