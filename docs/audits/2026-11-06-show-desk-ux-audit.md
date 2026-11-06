# UX Audit: Show Desk tab (secretary show home)

**Date:** 2026-11-06
**Auditor:** Claude (six-pass, plus an IA task-coverage walk)
**Branch:** `claude/ui-polish-2026-11-06` (includes today's MYK9-1727 polish)
**Sources:**

- Code: `apps/myk9show/src/pages/secretary/ShowWorkbenchShowDeskPage.tsx`, `apps/myk9show/src/features/show-map/ShowDeskPanel.tsx`, `ShowDeskToolsSheet.tsx`, `showDeskPendingSignals.ts`, everything under `features/show-map/cockpit/` named in the brief, `components/shows/tabs/useTrialRowActions.tsx`, `features/actions/actionRegistry.ts`, `routes/showManagementSections.ts`.
- Intent: `docs/INTENT.md` (secretary six-phase table), `// INTENT:` comments in `ShowDeskPanel.tsx:29`, `ShowDeskPanel.tsx:175`, `ShowDeskToolsSheet.tsx:34`, `showDeskActionable.ts:1`, `ClassChecklistSection.tsx:233`, `ShowMapRunOrderMenu.tsx:42`.
- Prior audit: `docs/show-desk-cockpit-ux-audit.md` (2026-07-22).
- Live walk (read only, secretary test user, dev server on this worktree, live DB, nothing written), show `dededede-0000-0000-0000-000000000010` (Heartland Scent Work Classic, AKC, Dec 7–9 2026, 4 trials). Screenshots in `/private/tmp/claude-501/-Users-richardbeezley-AI-Projects-myk9-platform/82951dd5-938c-45d3-b5cf-e690159820d4/scratchpad/audit/`:
  - `desk-375x812.png`, `desk-1280x900.png` (light), `focus-dark-768x1024.png`, `focus-dark-1280x900.png` (dark, `?focus=dec1a55e-…0033`)
  - `actions-menu-375x812.png`, `actions-menu-1280x900.png`, `trial-menu-375x812.png`, `trial-menu-1280x900.png`
  - `crop-phone-header.png`, `crop-phone-focused.png` (crops of the 375 shot)
  - No page errors were logged in any run.

**Intent frame.** Per `docs/INTENT.md` § "The secretary's six phases", Show Desk is the home of **The day** (schedule, start a class, check-in, people at the show, access codes, incidents; tools open one at a time from the Actions menu) and **A class, start to finish** (focused class panel; paper scoring its own page), plus **today's paperwork**. Entries, After (submit, close, money) and the paperwork library live on Entry Forms, Results and Reports by design. `ClassChecklistSection.tsx:233` records that check, release, print-after and judge initials happen on Results. Findings that would pull those jobs onto Show Desk are therefore not proposed.

---

## Pass 1: Mental Model Alignment

**What UI suggests:** "Your show, right now": a Needs attention strip, the show's schedule by trial, and one class's settings, work links and paperwork beside it. The Actions menu holds show-wide edits and the show-day tools.

**What it actually does:** That, faithfully. Status, judge, expected and actual start, run order, move-ups and paperwork print records are edited in place; everything else deep-links to its home (`ShowDeskPanel.tsx:29`).

**Misalignment gaps:**

| UI Element                                                                                                                                    | User Expects                                  | Actually Does                                                                                                                                                   | Severity |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pre-show banner "Entries are on the Entry Forms tab, and show setup is here on Overview." (`ShowDeskPanel.tsx:185-186`)                       | A tab called "Overview"                       | The tab is "Show Desk" (`routes/showManagementSections.ts:28`); no tab named Overview exists                                                                    | Medium   |
| "1 class needs judge's initials" pill (`showDeskPendingSignals.ts:214-227`, rendered `CockpitAttentionStrip.tsx:82-88`)                       | A pill like its neighbours that opens the fix | A non-clickable `<span>` styled identically to the clickable pills; `href: null`                                                                                | Medium   |
| Same strip, `desk-1280x900.png`                                                                                                               | 3 different problems ("Needs attention · 3")  | Two of the three pills are the same problem: the show-level "1 class needs judge's initials" and the class-level "Interior Advanced · Collect judge's initials" | Medium   |
| Focused class fact line "0 entries" (`SecretaryCockpitFocusedClass.tsx:98-103`) next to its row "0 entered · 1 pending" (`desk-1280x900.png`) | The same number in both places                | Header counts entered only; row counts entered + pending                                                                                                        | Low      |
| "Run order" label with nothing beside it (`SecretaryCockpitFocusedClass.tsx:221-239`, `crop-phone-focused.png`)                               | A control or a value                          | The menu hides itself under 2 entries (intentional, `ShowMapRunOrderMenu.tsx:42`), but the label stays                                                          | Low      |

**Jargon found:**

- "Focused Class" eyebrow (`SecretaryCockpitFocusedClass.tsx:113`) and "Select a Class…" (`:70`): internal noun, odd capital C. "Class" or the trial name alone reads fine.
- "Needs closeout" status filter option (`cockpitStatusFilter.ts:19`): still borderline, carried from the prior audit.
- Entries-failed state: "Entry counts, Check-in desk, and Show Map are paused so they do not show a false zero-entry state." (`ShowWorkbenchShowDeskPage.tsx:439`, `ShowDeskEntriesFailed.tsx:19`). "Show Map" is not a name the secretary sees anywhere; "false zero-entry state" is developer language.
- "No Classes match this filter." / "No Classes are scheduled…" (`SecretaryCockpitSchedule.tsx:128-129`, `CockpitTrialGroup.tsx:289`): capitalised "Classes".

## Pass 2: Information Architecture

**Current structure (top to bottom, `ShowDeskPanel.tsx:173-248`, `SecretaryCockpit.tsx:212-308`):**

- Show header (name, registry, club, dates, entries, status pill, premium state, save-for-show-day, presence) and the 5-tab strip.
- Tool slide-out (only when `?tool=` is set).
- Pre-show banner (status `setup` only).
- Ready for show day checklist (night-before window only, `ReadyForShowDaySection.tsx:167-180`).
- Needs attention strip (foldable; folded on phones).
- "Every class is complete…" hand-off to Results (only when all classes complete).
- Schedule heading, Filter (Day + Status) with chips, "Showing N of M".
- Trial cards (collapsible, ⋮ menu: Edit Trial, Add classes, High in Trial, Entry forms, Judge supplies, Trial financials) → class rows.
- Focused class: header (Edit class) → Class settings (Status, Judge, Expected start + Announce the delay, Actual timing, Run order) → per-class attention → Class work (View entries and results, Enter results from scoresheet, Class reports) → Can change class (move-ups) → Other paperwork / Class checklist → Continue on Results.
- Header Actions menu: show group (Edit show, Add entry, Add Trial, Add classes, Select classes, Open Entry Forms, Close out show), Show day (Check-in desk, Self check-in, Access codes, [Emergency trial packet when used]), Show logistics (Volunteers, Lunch orders, Tasks and notes, Incident log), Create (`actions-menu-1280x900.png`).

**IA issues:**

| Issue                                          | Location                                                | Problem                                                                                                                                                                                                                                                                        | Recommendation                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dead-end attention signals                     | `showDeskPendingSignals.ts:214-241`                     | "N classes need judge's initials" and "Close out N results" have `href: null`. The comment says no destination existed; the Results tab now owns initials and close-out (`ClassChecklistSection.tsx:233`, `cockpitRoutes.ts:135-149`)                                          | Link both to `getCockpitResultsControlHref` (Results tab), or drop the show-level judge-initials pill whenever class-level pills for the same classes are present |
| Duplicate attention                            | Strip, `desk-1280x900.png`                              | Show-level count pill + per-class pill for the same class; count reads 3 for 2 problems                                                                                                                                                                                        | De-duplicate in `buildSecretaryCockpitSnapshot` (one of the two, not both)                                                                                        |
| Link to the tab you can already see            | `actionRegistry.ts:372-383`                             | "Open Entry Forms" sits in the Actions menu while the Entry Forms tab is on screen one row below                                                                                                                                                                               | Suppress it on every show tab, not only on Entry Forms (`entryForms` flag)                                                                                        |
| Close out show offered a month before the show | `actionRegistry.ts:384-399`, `actions-menu-375x812.png` | Hidden only for completed/cancelled shows; shown during setup                                                                                                                                                                                                                  | Show only once the show has started (same rule `showDeskStatus.ts:87` uses for wrap-up)                                                                           |
| Pull / no-show not reachable from the class    | `buildSecretaryCockpitSnapshot.ts:113-121, 154-191`     | Move up is on the focused class; Pull is "under Entry Management" with no class-scoped link. `getCockpitEntryManagementHref` (`cockpitRoutes.ts:83-94`) supports `classId` + `tab: 'pulls'` but has **no callers**                                                             | Add one Class work link "Entries for this class" (Entry Forms filtered to the class) using the existing helper                                                    |
| Messaging not in the show's tool index         | Actions menu (`ShowWorkbenchShowDeskPage.tsx:255-364`)  | Messaging exists (`/secretary/messages?showId=…`, reached from the bell's Message Center and About's "Email delivery", `ShowAboutPage.tsx:76`), but the Show day group has no row for it; on Show Desk only the delay script posts an announcement (`AnnounceDelayButton.tsx`) | Add a "Message exhibitors" row (a door, `href` like Volunteers) to the existing Message Center for this show                                                      |
| Empty schedule has no next step                | `SecretaryCockpitSchedule.tsx:125-131`                  | "No Classes are scheduled for this day yet." with no action                                                                                                                                                                                                                    | Add the existing "Add classes" link (`getAddClassesHref`) to that empty state                                                                                     |

**Visibility problems:**

- Hidden but should be visible: on a phone the Actions menu (the only door to Check-in desk, Access codes, Incident log) is an unlabeled "···" button (`crop-phone-header.png`); the tab strip clips Results/Reports/About at 375px and About at 768px (`desk-375x812.png`, `focus-dark-768x1024.png`); the attention pill's reason is only in a `title` tooltip (`CockpitAttentionStrip.tsx:84, 95, 108`).
- Prominent but should be secondary: on a phone the show header (title, meta, status, save-for-show-day, presence avatar) takes ~350px before the tabs (`crop-phone-header.png`); "Close out show" during setup.

## Pass 3: Affordance Clarity

| Element                                                               | Looks Like                                                       | Actually Is                                                                             | Clear?                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Class card                                                            | Card with hover border                                           | Focuses the class; inner name button carries keyboard (`CockpitTrialGroup.tsx:166-210`) | Yes                                                                 |
| Row status pill                                                       | Pill                                                             | Read-only on the row; editable in the panel (`CockpitTrialGroup.tsx:211-216`)           | Yes (chevron only on the editable one)                              |
| Attention pill with destination                                       | Rounded pill                                                     | Link/button                                                                             | Yes                                                                 |
| Attention pill without destination ("1 class needs judge's initials") | Same rounded tinted pill                                         | Plain text                                                                              | **No** (false affordance)                                           |
| Collapsed "Class checklist" (`ClassChecklistSection.tsx:76-83`)       | Section heading with nothing under it (`crop-phone-focused.png`) | A `<details>` disclosure                                                                | **No** (no chevron, no count)                                       |
| Expected start "Set expected start" + pencil                          | Text with faint pencil                                           | Inline editor                                                                           | Yes (pencil now `opacity-60`, `ClassOperationalControls.tsx:203`)   |
| Trial ⋮                                                               | Kebab                                                            | Trial menu                                                                              | Yes for most users; a 6-item menu behind a kebab is acceptable here |
| Actions on phone ("···")                                              | Generic overflow                                                 | The show's whole tool index                                                             | Weak                                                                |

**False affordances:** the null-destination attention pill.

**Hidden affordances:** "Class checklist" disclosure; attention reasons in `title`; Actions behind "···" on phones.

**Recommended fixes:**

- Render a destination-less attention item as plain text without the pill fill, or (better) give it the Results destination.
- Give the checklist `<summary>` the same chevron the trial cards and attention strip use.
- Show the reason under the pill on tap/expand instead of `title` (INTENT: "No hover-only interactions").

## Pass 4: Cognitive Load

| Screen/Step     | Decisions Required                                         | Can Be Reduced?                                                                  |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Landing         | Scan attention → pick class                                | Already low; focus, filters and anchor persist in the URL                        |
| Attention strip | Pick a pill                                                | Yes: remove the duplicate pill so the count matches the work                     |
| Focused class   | Status, judge, start times, run order, move-ups, paperwork | Reasonable; an empty "Run order" row adds one meaningless label                  |
| Actions menu    | 4 groups, ~16 rows                                         | Slightly: drop "Open Entry Forms" (tab is visible) and pre-show "Close out show" |

**Missing defaults:** none found; day/status default to all, attention folds automatically on phones (`CockpitAttentionStrip.tsx:43-45`).

**Unnecessary complexity:**

| Complexity                                                                          | Who Needs It                                      | Recommendation                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| "Add classes" in both the Actions menu (show-level) and each trial ⋮ (trial-scoped) | Both are real entry points to the one create flow | Keep: same flow, different starting scope, no second implementation |
| Same wrench icon on every tool row (`showToolActions.ts:62`)                        | Nobody                                            | Low: distinct icons help scanning a 7-row tool list                 |

**Cognitive load score:** Low. The cockpit remains the strongest part of the secretary experience.

## Pass 5: State Coverage

### Show Desk page (`ShowWorkbenchShowDeskPage.tsx`)

| State                          | Implemented? | Quality   | Issue                                                                               |
| ------------------------------ | ------------ | --------- | ----------------------------------------------------------------------------------- |
| Loading                        | Yes          | Good      | Skeleton (`:417-423`)                                                               |
| Schedule read failed / pending | Yes          | Good      | `ShowDeskScheduleUnavailable` + retry (`:425-434`)                                  |
| Entries read failed            | Yes          | Poor copy | Whole desk replaced; copy says "Show Map" and "false zero-entry state" (`:436-443`) |
| Entries unavailable (offline)  | Yes          | Good      | Banner + retry, desk still renders (`:456-458`)                                     |
| Not permitted (club admin)     | Yes          | Good      | Secretary-only rows grey with one reason (`:113-114, 319`)                          |

### Schedule / attention / focused class

| State                          | Implemented? | Quality | Issue                                                                                                     |
| ------------------------------ | ------------ | ------- | --------------------------------------------------------------------------------------------------------- |
| Empty (no classes for the day) | Yes          | Partial | Text only, no Add classes link (`SecretaryCockpitSchedule.tsx:125-131`)                                   |
| Filtered empty                 | Yes          | Good    | "Showing N of M" + Show all (`:87-94`); focused panel waits while hidden (`SecretaryCockpit.tsx:264-291`) |
| Split, nothing focused         | Yes          | Good    | "Pick a class from the schedule…" (`SecretaryCockpit.tsx:284-291`)                                        |
| Attention overflow             | Yes          | OK      | "View N more issues" has no way back to the short list (`CockpitAttentionStrip.tsx:116-124`)              |
| Run order, 0–1 entries         | Partial      | Poor    | Label rendered with empty value (`SecretaryCockpitFocusedClass.tsx:221-239`)                              |
| Print history unknown          | Yes          | Good    | "Print history unavailable" (`CockpitPaperworkRow.tsx:121`)                                               |
| Status change errors           | Yes          | Good    | Toast + ConfirmDialog for unentered scores (`ClassOperationalControls.tsx:83-107, 157`)                   |
| All classes complete           | Yes          | Good    | Results hand-off banner (`CockpitResultsHandoff.tsx`)                                                     |

**Dead ends found:** empty schedule (no CTA); the two `href: null` attention items.

**Missing error handling:** none new found.

## Pass 6: Flow Integrity

**Primary flow tested:** show-day morning on a phone and a laptop — open Show Desk, triage attention, open a class, check settings and paperwork, find check-in and tools (read only; no writes).

| Step | Action                       | Friction                                                                                                                     | Severity |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Open Show Desk on a phone    | ~350px of show header before tabs; Results/Reports/About clipped in the tab strip (`desk-375x812.png`)                       | Medium   |
| 2    | Triage attention             | Folded on phone (intentional, MYK9-1727); on desktop one pill does nothing and one repeats another (`desk-1280x900.png`)     | Medium   |
| 3    | Open a class                 | Inline panel on phone, split on desktop; fine                                                                                | None     |
| 4    | Read class settings          | "Run order" label with nothing beside it                                                                                     | Low      |
| 5    | Print armband labels         | Label "Armband labels" clipped behind the Print button at 375px (`crop-phone-focused.png`, `CockpitPaperworkRow.tsx:95-115`) | Medium   |
| 6    | Find check-in / access codes | Behind unlabeled "···" on phone; labeled "Actions" on desktop                                                                | Medium   |
| 7    | Pull a dog from this class   | No class-scoped link; Entry Forms tab, then find the dog                                                                     | Medium   |
| 8    | Post a general announcement  | Only the delay script; general messaging via bell → Message Center                                                           | Low      |

**Abandonment risks:** a low-tech secretary on a phone may not find the tools behind "···" or the clipped tabs.

**Recovery gaps:**

- Missing back/undo: none (tool panel closes with Back; run order has undo).
- No cancel option: none.
- Destructive with no confirm: none (Mark incorrect, complete-over-unscored and trial delete all confirm).

**Flow verdict:** Completable with friction (phone-width friction is the main cost).

---

## Task coverage (secretary jobs across a show's life)

"From Show Desk" = done on the tab itself. "One click" = a link/menu row on Show Desk lands on the place it is done. "Elsewhere" = reachable only by switching tab/page and finding it.

| Phase    | Job                                       | Where it is done                                                 | From Show Desk?                                                                                                         | Evidence                                                                     |
| -------- | ----------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Before   | Edit show details / publish               | Edit show panel; status pill in header                           | One click (Actions → Edit show; header pill)                                                                            | `actionRegistry.ts:333-338`                                                  |
| Before   | Add / edit trials                         | Add Trial flow; trial edit dialog                                | One click (Actions → Add Trial; trial ⋮ → Edit Trial)                                                                   | `actionRegistry.ts:356-360`, `useTrialRowActions.tsx:89-137`                 |
| Before   | Add / edit classes                        | Class create flow; Edit class panel                              | One click (Actions / trial ⋮ → Add classes; focused class → Edit class)                                                 | `FocusedClassSetupActions.tsx:32-36`                                         |
| Before   | Assign judges                             | Focused class Judge picker; Select classes → Assign judge        | From Show Desk                                                                                                          | `SecretaryCockpit.tsx:127-143`, `ScheduleBulkBar.tsx:134`                    |
| Before   | Review / approve entries                  | Entry Forms (one home for approve)                               | One click (attention "Review N entries"; row "N pending"; trial ⋮ → Entry forms)                                        | `showDeskPendingSignals.ts:170-180`, `ClassEntryBreakdownLine.tsx:10`        |
| Before   | Payments due                              | Entry Forms                                                      | One click (attention "Resolve N payments")                                                                              | `showDeskPendingSignals.ts:198-211`                                          |
| Before   | Waitlist                                  | Entry Forms → Waitlist                                           | Elsewhere (Entry Forms tab)                                                                                             | `entryManagementCockpitParams.ts:14`                                         |
| Before   | Premium list                              | Premium editor / About                                           | One click only inside the night-before checklist window; otherwise via About or header "premium list not yet published" | `ReadyForShowDaySection.tsx:60-64`                                           |
| Before   | Run order                                 | Focused class → Run order (auto-sort, hand place, undo)          | From Show Desk (classes with 2+ entries)                                                                                | `SecretaryCockpitFocusedClass.tsx:221-253`                                   |
| Before   | Print paperwork for a class               | Focused class → Other paperwork / checklist; Class reports       | From Show Desk                                                                                                          | `ClassChecklistSection.tsx`, `ClassPrintPanel.tsx`                           |
| Before   | Print the whole library / trial packets   | Reports                                                          | One click (Class reports; trial ⋮ → High in Trial, Trial financials)                                                    | `buildSecretaryCockpitSnapshot.ts:181-191`                                   |
| Before   | Judge supplies                            | Trial ⋮ → Judge supplies (move to show level filed as MYK9-1728) | From Show Desk                                                                                                          | `useTrialRowActions.tsx:120-125`                                             |
| Before   | Night-before readiness                    | Ready for show day checklist                                     | From Show Desk (time-windowed)                                                                                          | `ReadyForShowDaySection.tsx:167-180`                                         |
| Show day | Check-in                                  | Entry Forms → Check-in desk                                      | One click (Actions → Check-in desk; attention "Check in N entries")                                                     | `ShowWorkbenchShowDeskPage.tsx:259-267`, `showDeskPendingSignals.ts:184-195` |
| Show day | Self check-in settings                    | Tool panel                                                       | From Show Desk (Actions → Self check-in)                                                                                | `ShowWorkbenchShowDeskPage.tsx:268-287`                                      |
| Show day | Access codes for judges/ringside          | Tool panel                                                       | From Show Desk (Actions)                                                                                                | `:288-302`                                                                   |
| Show day | Run order changes                         | Focused class                                                    | From Show Desk                                                                                                          | as above                                                                     |
| Show day | Start / complete a class                  | Focused class Status; Actual timing editor                       | From Show Desk                                                                                                          | `ClassOperationalControls.tsx`, `ClassActualStartEditor.tsx`                 |
| Show day | Running late                              | Expected start + Announce the delay                              | From Show Desk                                                                                                          | `AnnounceDelayButton.tsx`                                                    |
| Show day | Move-ups                                  | Focused class → Can change class                                 | From Show Desk                                                                                                          | `SecretaryCockpitFocusedClass.tsx:304-350`                                   |
| Show day | Pulls / no-shows                          | Entry Forms (Pulls, Check-in desk)                               | **Elsewhere** — no class-scoped link (helper exists unused)                                                             | `cockpitRoutes.ts:83-94`                                                     |
| Show day | Scoring hand-off (ringside)               | `/at-show` via access codes; paper → scoresheet entry            | One click (Enter results from scoresheet; Access codes)                                                                 | `buildSecretaryCockpitSnapshot.ts:173-180`                                   |
| Show day | Judge initials                            | Results                                                          | One click (class pill "Collect judge's initials"; Continue on Results). Show-level pill is not a link                   | `ClassChecklistSection.tsx:233-245`, `showDeskPendingSignals.ts:225`         |
| Show day | General announcement / message exhibitors | Message Center `/secretary/messages?showId=`                     | **Elsewhere** (header bell → Message Center); only the delay script is on Show Desk                                     | `AnnounceDelayButton.tsx`, `MessageCenterPanel.tsx:216`                      |
| Show day | Incidents, tasks, volunteers, lunch       | Tool panels / Volunteers page                                    | From Show Desk (Actions)                                                                                                | `ShowWorkbenchShowDeskPage.tsx:311-363`                                      |
| Show day | Emergency paper fallback                  | Tool panel (when the show uses the packet)                       | From Show Desk (Actions)                                                                                                | `:303-310`, `showDeskToolSwitches`                                           |
| After    | Check / release results                   | Results                                                          | One click (Continue on Results; all-complete hand-off)                                                                  | `CockpitResultsHandoff.tsx`                                                  |
| After    | Submit to registry                        | Results → Submit step                                            | Elsewhere (Results tab); no Show Desk link before all classes complete                                                  | `cockpitRoutes.ts:151-165`                                                   |
| After    | Close out show                            | Results → Close step                                             | One click (Actions → Close out show)                                                                                    | `actionRegistry.ts:384-399`                                                  |
| After    | Refunds                                   | Entry Forms reconciliation (Issue/Deny refund)                   | Elsewhere (Entry Forms)                                                                                                 | `PullReconciliationActions.tsx`                                              |
| After    | Financials                                | Reports (Financial Report; trial financials)                     | One click (trial ⋮ → Trial financials)                                                                                  | `useTrialRowActions.tsx:126-135`                                             |
| After    | Reports library                           | Reports                                                          | One click (tab; Class reports)                                                                                          | —                                                                            |

**Verdict:** a secretary can do or reach in one click the large majority of show-day and class work from Show Desk (≈24 of 31 jobs). The "elsewhere" jobs are Entries and After jobs that INTENT.md deliberately homes on Entry Forms and Results, except two show-day gaps: **pull/no-show for a class** and **messaging exhibitors**, both fixable with links.

---

## Prior audit reconciliation (`docs/show-desk-cockpit-ux-audit.md`, 2026-07-22)

| Prior finding                                                    | Status now                                                         | Evidence                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Hover-only pencil on Expected start (High)                       | Fixed                                                              | `ClassOperationalControls.tsx:203` (`opacity-60 group-hover:opacity-100`) |
| Empty cockpit renders blank (High)                               | Partly fixed: message shown, still no next step                    | `SecretaryCockpitSchedule.tsx:125-131`                                    |
| `window.confirm` in status guard and print-history void (Medium) | Fixed: `ConfirmDialog`                                             | `ClassOperationalControls.tsx:157-163`, `CockpitPaperworkRow.tsx:224`     |
| "Use scheduled time" revert has no feedback (Medium)             | Fixed: saving state + toasts                                       | `ClassOperationalControls.tsx:226-233, 276-280`                           |
| Row click-to-focus not keyboard accessible (Medium)              | Fixed: inner name button bubbles to the card                       | `CockpitTrialGroup.tsx:203-210`                                           |
| Attention CTA "Open" not verb-first (Low)                        | Fixed: pill text is class + action                                 | `CockpitAttentionStrip.tsx:76`                                            |
| No date on single-day shows (Low)                                | Moot: trial heading carries the date; day chips replaced by Filter | `secretaryCockpitModel.ts:362`                                            |
| Paperwork reads "Not confirmed printed" while loading (Low)      | Fixed: "Print history unavailable" when unknown                    | `CockpitPaperworkRow.tsx:119-122`                                         |
| "Needs closeout" jargon (Low)                                    | Still open (now a Filter option)                                   | `cockpitStatusFilter.ts:19`                                               |
| Strip count `all.length` vs listed items (Pass 5 note)           | Still open in a new form: the count includes a duplicate           | `CockpitAttentionStrip.tsx:62`, `desk-1280x900.png`                       |

---

## Summary

**Overall UX health:** Good. No Critical findings; the remaining debt is phone-width polish, two dead-end attention pills, and two missing deep links.

### Critical

None.

### High Priority

| Finding                                                                                                                                                        | Pass | Impact                                                                                 | Effort |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- | ------ |
| Phone: Actions is an unlabeled "···" and tabs clip, so show-day tools and Results/Reports/About are hard to find (`crop-phone-header.png`, `desk-375x812.png`) | 2, 6 | A low-tech secretary on a phone may not find Check-in desk or Access codes on show day | Small  |

### Medium Priority

| Finding                                                                                                                                                                   | Pass | Impact                                              | Effort  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------- | ------- |
| Show-level "N classes need judge's initials" pill is non-clickable and duplicates the class pill (`showDeskPendingSignals.ts:214-227`; `CockpitAttentionStrip.tsx:82-88`) | 1, 3 | Tap does nothing; count overstates work             | Small   |
| "Close out N results" pill also has `href: null` (`showDeskPendingSignals.ts:229-241`)                                                                                    | 2    | Dead-end chip, against "chips land on the fix"      | Trivial |
| Pull/no-show has no class-scoped link (`cockpitRoutes.ts:83` unused)                                                                                                      | 2, 6 | Day-of scratch takes a tab switch + search          | Small   |
| "Armband labels" clipped behind Print at 375px (`CockpitPaperworkRow.tsx:95-115`, `crop-phone-focused.png`)                                                               | 6    | Paperwork name unreadable on phone                  | Small   |
| Pre-show banner names a tab called "Overview" (`ShowDeskPanel.tsx:185-186`)                                                                                               | 1    | Points to a tab that does not exist                 | Trivial |
| Attention reason only in `title` (`CockpitAttentionStrip.tsx:84, 95, 108`)                                                                                                | 3    | Invisible on touch; INTENT bans hover-only          | Small   |
| No "Message exhibitors" row in the Actions Show day group                                                                                                                 | 2    | General announcements are off the show's tool index | Trivial |

### Low Priority

| Finding                                                                                                                                                                                          | Pass | Impact                                   | Effort  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------- | ------- |
| Empty "Run order" label for 0–1 entry classes (`SecretaryCockpitFocusedClass.tsx:221-239`)                                                                                                       | 1, 5 | Looks broken                             | Trivial |
| "Class checklist" disclosure has no chevron/count (`ClassChecklistSection.tsx:76-83`)                                                                                                            | 3    | Looks like an empty section              | Trivial |
| Empty schedule lacks Add classes link (`SecretaryCockpitSchedule.tsx:125-131`)                                                                                                                   | 5    | Dead end on a new show                   | Trivial |
| "Open Entry Forms" duplicates the visible tab (`actionRegistry.ts:372-383`)                                                                                                                      | 2    | Menu noise                               | Trivial |
| "Close out show" shown before the show starts (`actionRegistry.ts:384-399`)                                                                                                                      | 2    | Irrelevant, final-sounding step in setup | Trivial |
| Focused "0 entries" vs row "1 pending" (`SecretaryCockpitFocusedClass.tsx:98-103`)                                                                                                               | 1    | Two numbers for one class                | Trivial |
| Copy: "Focused Class", "Select a Class", "No Classes…", "1 needs attention" (`SecretaryCockpitFocusedClass.tsx:70,113`; `SecretaryCockpitSchedule.tsx:128-129`; `CockpitTrialGroup.tsx:254,289`) | 1    | Polish                                   | Trivial |
| Entries-failed copy says "Show Map" / "false zero-entry state" (`ShowWorkbenchShowDeskPage.tsx:439`, `ShowDeskEntriesFailed.tsx:19`)                                                             | 1, 5 | Jargon in a stressful state              | Trivial |
| "View N more issues" cannot fold back (`CockpitAttentionStrip.tsx:116-124`)                                                                                                                      | 5    | Minor                                    | Trivial |
| Same wrench icon for every tool row (`showToolActions.ts:62`)                                                                                                                                    | 4    | Scanning                                 | Small   |
| "Needs closeout" filter label (`cockpitStatusFilter.ts:19`)                                                                                                                                      | 1    | Borderline jargon                        | Trivial |

### Quick Wins

- Give the two null-destination signals the Results href; drop the show-level judge-initials pill when class pills cover it.
- Banner copy: "show setup is here on Show Desk".
- Hide the "Run order" `<dt>` when the menu hides.
- Add a chevron to the checklist `<summary>`.
- Add "Add classes" link to the empty schedule.
- Suppress "Open Entry Forms" on all show tabs; hide "Close out show" until the show has started.

### Recommendations

1. Fix the phone shell first (labelled Actions or a visible "Tools" door, non-clipping tab strip, shorter header): it decides whether show-day tools are findable at all.
2. Make every attention pill land on its fix and count each problem once.
3. Close the two show-day gaps with links, not new UI: "Entries for this class" (pulls/no-shows) and "Message exhibitors".

---

## Answer to the owner

**Are secretaries able to do most of their tasks from Show Desk?** Yes. About 24 of 31 secretary jobs are done on Show Desk or one click from it (task table above). The rest are Entries and After jobs that INTENT.md deliberately homes on Entry Forms and Results. Two show-day jobs have no direct door: pulling a dog from a class, and messaging exhibitors.

### Add (as a link, unless a link can't work)

- **"Entries for this class" link in Class work** (pulls, no-shows, waitlist for the class) — Medium — `cockpit/buildSecretaryCockpitSnapshot.ts:154-191`, `cockpit/cockpitRoutes.ts:83-94`. Duplication? No: a deep link to Entry Forms filtered by `classId` using the existing, unused `getCockpitEntryManagementHref`; no pull UI is rebuilt.
- **"Message exhibitors" row in the Actions → Show day group** — Medium — `pages/secretary/ShowWorkbenchShowDeskPage.tsx:255-364`. Duplication? No: a door (`href`, like Volunteers) to the existing Message Center at `/secretary/messages?showId=…`; no composer is added.
- **Results destination on the "judge's initials" and "Close out N results" attention pills** — Medium — `features/show-map/showDeskPendingSignals.ts:214-241`. Duplication? No: links to the Results tab, which already owns initials and close-out.
- **"Add classes" link in the empty-schedule state** — Low — `cockpit/SecretaryCockpitSchedule.tsx:125-131`. Duplication? No: same `getAddClassesHref` flow the Actions menu uses.

### Move / take away

- **Remove the duplicate show-level "N classes need judge's initials" pill when per-class pills exist** — Medium — `showDeskPendingSignals.ts:214-227`, `cockpit/buildSecretaryCockpitSnapshot.ts:200-215`. Duplication? Yes, today the same problem appears twice in one strip; removing one is the fix.
- **Remove "Open Entry Forms" from the Actions menu on every show tab** — Low — `features/actions/actionRegistry.ts:372-383`. Duplication? Yes: the Entry Forms tab is always visible on the show page; the menu row is a second door with no justification.
- **Hide "Close out show" until the show has started** — Low — `features/actions/actionRegistry.ts:384-399`. Duplication? No; it moves out of view, not to a new place (Results step 3 stays its home).
- **Judge supplies to show level** — already filed as MYK9-1728; not re-proposed.
- Keep "Add classes" in both the Actions menu and the trial ⋮ — Duplication? Two doors to one flow at different scopes (show vs trial), no second implementation: justified.

### Polish (look)

- **Phone header and tools door: label the "···" Actions button (or show "Actions"), stop the tab strip clipping Results/Reports/About, and compress the show header** — High — `components/layout/AppHeader.tsx`, show header/tab strip (`desk-375x812.png`, `focus-dark-768x1024.png`). Duplication? No new surface.
- **Unclip "Armband labels" beside Print on phones** — Medium — `cockpit/CockpitPaperworkRow.tsx:95-115`. Duplication? None.
- **Show attention reasons without hover** — Medium — `cockpit/CockpitAttentionStrip.tsx:84, 95, 108`. Duplication? None.
- **Fix the pre-show banner's "Overview" tab name** — Medium — `ShowDeskPanel.tsx:185-186`. Duplication? None.
- **Hide the empty "Run order" label for 0–1 entry classes** — Low — `cockpit/SecretaryCockpitFocusedClass.tsx:221-239`. Duplication? None.
- **Chevron on the collapsed "Class checklist"** — Low — `cockpit/ClassChecklistSection.tsx:76-83`. Duplication? None.
- **One entry count in the focused header and row** (entered + pending) — Low — `cockpit/SecretaryCockpitFocusedClass.tsx:98-103`. Duplication? None.
- **Copy sweep: "Focused Class", "Select a Class", "No Classes…", "1 needs attention", "Show Map"/"false zero-entry state", "Needs closeout"** — Low — `SecretaryCockpitFocusedClass.tsx:70,113`, `SecretaryCockpitSchedule.tsx:128-129`, `CockpitTrialGroup.tsx:254,289`, `ShowWorkbenchShowDeskPage.tsx:439`, `cockpitStatusFilter.ts:19`. Duplication? None.
- **Distinct icons per tool row** — Low — `features/actions/showToolActions.ts:62`. Duplication? None.

---

## Not verified

- Ready for show day checklist, Check in N entries pill, Announce the delay, move-up list and the all-complete hand-off: the demo show is a month out, so none of their time windows were open in the live walk (code-read only).
- Emergency trial packet row: hidden for this show by its "uses" switch.
- Seed oddities seen but not judged: Container Novice A "3:15 AM started"; two "Interior Advanced" rows in Trial 1, one complete with "Judge not set" (may be sections or seed data).
- Club-admin view of the tab (walk used the secretary account only).
- No writes were made, so save/error toasts were verified from code, not live.
