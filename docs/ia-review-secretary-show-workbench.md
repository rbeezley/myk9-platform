# IA Review: Secretary Show Workbench

> **Status:** Active

**Date:** 2026-10-20
**Auditor:** Claude (cloud session)
**Sources:** route audit (`routes/secretaryRoutes.tsx`, `routes/publicRoutes.tsx`, `routes/showManagementSections.ts`); a code map of the header, the four tabs and every per-show page outside them; the secretary findings of the 2026-10-20 new-user walk as filed in Linear (MYK9-1276, 1277, 1282, 1293, 1294); owner decisions on MYK9-953 and MYK9-959; active plans `plan-secretary-show-home.md`, `plan-show-tools-into-actions.md`, `plan-secretary-show-actions.md`.
**Scope:** the secretary's show workbench at `/shows/:id` (header, Overview, Entry Forms, Results, Reports, the Tools sheet) and every route a secretary can reach that operates on one show, trial or class. Exhibitor and public surfaces are out of scope.
**Purpose:** a deletion list. Every surface gets one verdict: **stays**, **merges** (into a named home) or **goes**. The held Linear issues are re-triaged against it at the end.

## Owner review (2026-10-20)

Reviewed against `origin/main` by the session that ran the usability walk; every orphan route, stranded card and duplicate door below was re-checked by grep and holds. Corrections are folded in below and marked **[review]**: the deletion is about 1,900 lines including tests rather than 4,000, and the plan now carries a counted control inventory as an exit criterion because this audit measured structure, not controls. Deletion list approved with those edits; the Gate 0 decisions are recorded in the plan. One review edit was overturned by the Phase A run on 2026-10-21: the review claimed the wizard's edit mode carries the map pin, but the wizard has no edit mode for an existing show's location, so `VenueLocationCard` was stranded too and was re-homed, not deleted (MYK9-1296, #3155; cold-load check in MYK9-1313).

## Evidence limits — read first

- **No live walk.** This ran in a cloud container with no Supabase credentials, so Step 2 is a code walk plus the walk findings already filed in Linear. Every "goes" verdict below is backed by a grep for incoming links, re-run by hand, not by a browser.
- **No usage data.** The owner's rule (MYK9-953 decision 4) was that any Show Day tool or filter unused at the Oct 6 rehearsal or the Oct 10 show becomes a deletion candidate. No used/unused checklist was recorded, and the owner noted on MYK9-959 that it is unknown whether the secretary used the Results tab at Oct 10. Verdicts here therefore rest on structure and duplication. A tool that is reachable and not duplicated stays, however rarely it may be used.
- The 2026-10-20 walk document (`docs/qa/usability-walk-new-user-2026-10-20.md`) is not on any pushed branch; its findings were read from the Linear issues that quote it.

## Step 1: Route Audit

**Surface scope:** secretary, one show.

| Route                                                | Purpose                                                                                              | Parent in IA     | Component                                           | Incoming links                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/shows/:id`                                         | Overview: the show home cockpit (schedule, focused class, attention, readiness, Tools)               | (top for a show) | `ShowManagementShell` → `ShowWorkbenchShowDeskPage` | dashboard cards, Shows list, wizard save, breadcrumbs, `/secretary` redirect |
| `/shows/:id/entries`                                 | Entry Forms: registration queues, waitlist, pulls, move-ups, registration numbers                    | `/shows/:id`     | `EntryManagementPage`                               | tab, Actions menu, many "Manage Entries" links                               |
| `/shows/:id/results` (`?step=submit`, `?step=close`) | Results: per-class check, release, print, initials; then Submit and Close                            | `/shows/:id`     | `ShowResultsSection`                                | tab, Actions "Close out show", Overview handoff                              |
| `/shows/:id/reports`                                 | Reports: the print library, 33 cards in four phase groups                                            | `/shows/:id`     | `ReportsPage`                                       | tab, many "print" links                                                      |
| `/shows/:id/trials/:tid`, `/trials/:tid`             | Trial page: classes, entries table, **Financials** (staff)                                           | `/shows/:id`     | `TrialDetailsPage`                                  | trial row menu, schedule spine, breadcrumbs                                  |
| `/shows/:id/trials/:tid/classes/:cid`                | Class page: run sheet, check-in select, Score button                                                 | trial            | `ClassDetailsPage`                                  | cockpit "View entries and results", class lists                              |
| `/scoring/classes/:cid/entries(/:eid)`               | Paper scoring                                                                                        | class            | `PaperScoresheetPage`, `ScoresheetPage`             | Results Fix, run sheet, cockpit                                              |
| `/secretary/register/:showId`                        | Secretary enters a dog (incl. late entry)                                                            | Entry Forms      | `RegistrationWizardPage`                            | Entry Forms, Actions "Add entry", dashboard                                  |
| `/secretary/volunteers`                              | Volunteer scheduling                                                                                 | (none — flat)    | `VolunteerSchedulingPage`                           | **only** the Volunteers tool card                                            |
| `/secretary/messages(/:showId)`                      | Communication history                                                                                | (none — flat)    | `SecretaryMessagesPage`                             | message center, people roster                                                |
| `/secretary/dashboard`                               | Cross-show home                                                                                      | (top)            | `SecretaryDashboardPage`                            | rail "Manage"                                                                |
| `/secretary/settings`                                | Show Settings: results visibility, self check-in, access codes, withdrawal, refund-all, venue, Wi-Fi | (none)           | `ShowSettingsPage`                                  | **none**                                                                     |
| `/secretary/pipeline/:trialId`                       | "Mission Control" trial stage pipeline                                                               | (none)           | `TrialPipelineDetail`                               | **none live**                                                                |
| `/shows/:id/trials/:tid/classes/:cid/secretary`      | Per-class secretary dashboard: Results Entry, Placements                                             | (none)           | `SecretaryClassDashboard`                           | **none live**                                                                |

**Orphan routes (verified by grep, 2026-10-20):**

- `/secretary/pipeline/:trialId`: its only link is in `TrialPipelineCard`, rendered only by `PipelineColumn`, which nothing imports.
- `/shows/:id/trials/:tid/classes/:cid/secretary`: its only links are in `ClassPipelineCard`, which nothing imports.
- `/secretary/settings`: no in-app link at all; it appears only in `config/surface.ts`. It also takes its show from the store's `selectedShowId`, whose only writers are the orphaned pipeline hook and the Volunteers page (from its route) **[review: Entry Forms keeps its own local state and never writes the store]**, so even by typed URL it opens on whichever show Volunteers last showed, or on "select a show" if neither ever ran.

**Duplicate-purpose routes:** the trial page re-presents three workbench jobs for one trial (classes, entries, money). The class page and Overview's focused class both own run order and check-in for a class.

**URL that doesn't reflect the hierarchy:** `/secretary/volunteers` and `/secretary/messages` are per-show work under a flat `/secretary/` prefix, carrying the show as `?showId=`. Breadcrumbs on every tab read `Shows → <show>`, where "Shows" is the Browse list.

## Step 2: Task Flow Walk (code walk)

Tasks: open my show; review entries; get show-day paperwork; run a class from start to released results; close the show; refund every entry of a cancelled show; set the show's Wi-Fi.

### Task: open my show (every session)

| Step | Action                 | Route                  | Friction                                                                                 | Severity |
| ---- | ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------- | -------- |
| 1    | Rail "Manage"          | `/secretary/dashboard` | Manage means the dashboard, not the show                                                 | Low      |
| 2    | "Go to show" on a card | `/shows/:id`           | Same-named shows are indistinguishable (MYK9-1277)                                       | High     |
| 3    | Look at the rail       | `/shows/:id`           | Rail highlights **Browse** (`useActivePath.ts:73` prefix match); breadcrumb says `Shows` | Med      |
| 4    | Read the header        | `/shows/:id`           | Five status widgets plus a chip; "Published" beside "Premium not published" (MYK9-1282)  | Med      |

**Verdict:** completable with friction. Two context switches every session.

### Task: run a class from start to released results (show day)

| Step | Action                           | Route                                                  | Friction                                                                                                                                                           | Severity |
| ---- | -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1    | Start the class (status control) | Overview                                               | none                                                                                                                                                               | None     |
| 2    | Enter paper scores               | `/scoring/...`                                         | Two "Enter results from scoresheet" doors on the same page (Your show row, Class work)                                                                             | Low      |
| 3    | Mark the class complete          | Overview                                               | none                                                                                                                                                               | None     |
| 4    | Check scores, release            | Results                                                | Class panel on Overview lists these as checklist items that link away; Results then says "Open on Overview" / "Mark Class Complete on Overview" for earlier phases | High     |
| 5    | Print results sheet and labels   | Results "Then" rows, or Overview checklist, or Reports | Three places print the same two documents                                                                                                                          | Med      |
| 6    | Judge initials                   | Results                                                | none                                                                                                                                                               | None     |

**Context switches:** 3 (Overview → scoring → Overview → Results). **Verdict:** completable with friction. The class lifecycle is split across two tabs that point at each other.

### Task: get today's paperwork

Overview's focused class already lists the class's tracked paperwork (check-in sheet, score sheets, results sheet, armband labels, result labels) with print-in-place and printed state. Reports holds the same documents among 33 cards, plus a "Also on Overview, per class" link. MYK9-1294 proposes a third home, a "Today" strip on Reports. **Verdict:** completable; the documents already have a daily home.

### Task: refund every entry of a cancelled show; set the venue Wi-Fi; set a per-show withdrawal policy

All three exist only on `/secretary/settings`, which nothing links to. **Verdict: Broken.** A secretary cannot reach them without typing a URL, and even then the page may open on the wrong show. Venue Wi-Fi matters more than it looks: the armband labels print it (`ArmbandLabelCell`), so today the labels cannot carry the Wi-Fi without a typed URL. **[review, overturned 2026-10-21]** The review first read venue location as wizard-owned; the Phase A run found the wizard has no edit mode for an existing show's location, so `VenueLocationCard` was stranded too and now lives in the Edit show details panel.

### Task: review entries, close the show

Entry Forms is the single home of approve (`showMapRoutes.ts:36-46`), and every other surface links to it. Close is a Results step with an Actions-menu shortcut. **Verdict:** completable. The only friction is the empty default queue (MYK9-1276, already carved out).

## Step 3: Mental Model Check

**Method:** domain grouping (how a kennel-club trial secretary's work is organised) checked against the owner's prior decisions on MYK9-630, MYK9-953 and MYK9-959. Not validated with a real secretary; MYK9-958 is the issue for that.

**User mental grouping:**

- **The show itself:** details, publishing, status, settings (withdrawal policy, venue, Wi-Fi), cancel and refund.
- **Entries:** review, payment, waitlist, move-ups, pulls, late entries.
- **The day:** schedule, start a class, scoring, check-in, people at the show, access codes, incidents.
- **A class, start to finish:** run order, scoring, complete, check, release, print, initials.
- **Paperwork:** what to print today, and the full library.
- **After:** submit to the registry, close the show, money.

**Actual route grouping:**

- `/shows/:id` (Overview): the day, a class up to "complete", paperwork per class, Tools.
- `/shows/:id/results`: a class after "complete", and After.
- `/shows/:id/reports`: the paperwork library.
- Edit show panel: the show itself, except settings, cancel-and-refund, venue and Wi-Fi.
- `/secretary/settings` (unreachable): the rest of the show itself.
- `/trials/:tid`: per-trial money and a second view of classes and entries.

**Mismatches:**

| Capability                                 | User expects in          | Actually lives in                          | Severity |
| ------------------------------------------ | ------------------------ | ------------------------------------------ | -------- |
| Refund all entries (cancelled show)        | The show itself          | Unreachable page                           | High     |
| Venue location, Wi-Fi, per-show withdrawal | The show itself          | Unreachable page                           | High     |
| Check and release a class's results        | A class, start to finish | A different tab from the rest of the class | High     |
| Trial money                                | After / money            | The trial page's Financials tab only       | Med      |
| "Where am I"                               | Managing my show         | Browse (rail and breadcrumb)               | Med      |

## Step 4: Duplication & Orphan Scan

**Task duplication:**

| Task                              | Paths available                                                                                                        | Recommended consolidation                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a trial                       | Actions menu; Overview "Your show" row                                                                                 | Actions menu only (shell INTENT: verbs live in the Actions menu)                                                                             |
| Add classes                       | Actions menu; per-trial "Add Classes" on Overview; trial page                                                          | Keep the per-trial inline link (it carries the trial); Actions menu; drop the trial page's copy                                              |
| Enter paper scores                | "Your show" row; focused class "Class work"; class page Score; Results Fix                                             | Per class only; drop the "Your show" row button                                                                                              |
| Open a show tool                  | Tools button (accordion sheet); `?tool=` links from Entry Forms, Reports, Show Settings                                | Actions menu rows, one tool per panel (owner-approved, `plan-show-tools-into-actions.md`)                                                    |
| Publish the premium               | Actions "Generate & publish premium"; details panel card; attention chip; readiness line                               | One verb (the card); chip and readiness line stay as pointers that land on it (INTENT "chips land on the fix")                               |
| Print a class's paperwork         | Overview class checklist (in place); Results "Then" rows (in place); Reports; class page; trial page; show-map actions | Overview class checklist is the daily home; Reports is the library; the rest stay **links** only. Add no new door (closes MYK9-1294's strip) |
| Release results                   | Results class detail; `ResultsControlPage` bulk release inside the Visibility settings sheet                           | Release on Results only; the sheet keeps visibility settings (verify in browser before removing)                                             |
| Classes and entries for a trial   | Overview (trial group, Select classes) and Entry Forms filtered by trial; the trial page                               | Workbench; the trial page becomes a link into it (owner decision)                                                                            |
| Access codes                      | Tools; `ShowOverviewTab` (exhibitor tab, manager branch); Show Settings; wizard success overlay                        | Tools and the wizard success moment; delete the other two                                                                                    |
| Results visibility, self check-in | Results "Visibility settings" and Tools; Show Settings "Manage" cards that forward there                               | Delete the Settings forwarders                                                                                                               |

**Orphan routes:**

| Route                                           | Status                            | Recommendation                                                                                                                                       |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/secretary/pipeline/:trialId`                  | No live incoming link             | **Delete** the page, `PipelineColumn`, `TrialPipelineCard`, `ClassPipelineCard` and stage UI. Keep `useMissionControlData` (the dashboard reads it). |
| `/shows/:id/trials/:tid/classes/:cid/secretary` | No live incoming link             | **Delete** `SecretaryClassDashboard` (567 lines). Scoring has one canonical path (`ClassDetailsPage` INTENT); results live on Results.               |
| `/secretary/settings`                           | No incoming link; wrong-show risk | **Re-home** the four cards with no other home (below), then **delete** the page.                                                                     |
| `/tv/:showId`                                   | No in-app link                    | Out of scope (venue display, typed on purpose). Keep.                                                                                                |

**Modal/inline duplications:** the Tools sheet holds every tool as a collapsible section, against INTENT "a slide-out holds one thing" (already planned). The Volunteers tool is a card whose only content is a link to another page.

## Step 5: Severity Scoring

Scoring note: the rubric labels Fix invasiveness "INVERSE — lower is better". It is scored here so that a cheap fix scores high (5 = one small change, 1 = architecture), which makes the sum rank cheap, frequent, painful fixes first.

| #     | Finding                                                                                                     | Step | Freq | Friction | Fix (inv) | Sum | Priority |
| ----- | ----------------------------------------------------------------------------------------------------------- | ---- | ---- | -------- | --------- | --- | -------- |
| IA-1  | Refund all entries, venue location, Wi-Fi, per-show withdrawal policy are unreachable                       | 1, 2 | 2    | 5        | 4         | 11  | Critical |
| IA-2  | Header carries five status widgets plus a chip that read as contradictory                                   | 2    | 5    | 2        | 4         | 11  | Critical |
| IA-3  | Inside a managed show the rail highlights Browse and the breadcrumb says Shows                              | 2, 3 | 5    | 2        | 4         | 11  | Critical |
| IA-4  | Overview "Your show" button row duplicates Actions-menu verbs and per-class scoring                         | 4    | 4    | 2        | 5         | 11  | Critical |
| IA-5  | Class lifecycle split between Overview and Results, which point at each other                               | 2, 3 | 4    | 3        | 2         | 9   | High     |
| IA-6  | Tools sheet is an accordion of eight tools (one is only a link)                                             | 4    | 3    | 2        | 3         | 8   | High     |
| IA-7  | Two release paths (class detail and the Visibility sheet's bulk bar)                                        | 4    | 2    | 3        | 4         | 9   | High     |
| IA-8  | Three orphan pages: pipeline, class secretary dashboard, Show Settings (~1,500 source lines, ~400 of tests) | 1, 4 | 1    | 1        | 5         | 7   | Medium   |
| IA-9  | Trial page re-presents classes, entries and holds the only per-trial money view                             | 1, 3 | 2    | 2        | 2         | 6   | Medium   |
| IA-10 | Premium publish has two verbs                                                                               | 4    | 2    | 1        | 5         | 8   | High     |
| IA-11 | Access codes card rendered in four places                                                                   | 4    | 2    | 1        | 5         | 8   | High     |
| IA-12 | Six print doors for the same class paperwork; a seventh is proposed                                         | 2, 4 | 3    | 2        | 3         | 8   | High     |

**Top findings to fix next:** IA-1 to IA-4 (Critical), then IA-5, IA-6, IA-7, IA-10, IA-11, IA-12 (High).
**Documented, not fixed now:** IA-8 is cheap and has no user friction; it rides Phase A because deletions are free. IA-9 needs an owner decision.

## The deletion list

| Surface                                                                                               | Verdict            | Home / reason                                                                                                                                                                | Finding |
| ----------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `/secretary/pipeline/:trialId` + `PipelineColumn`, `TrialPipelineCard`, `ClassPipelineCard`, stage UI | **Goes**           | Unreachable; its stages duplicate the four tabs. Keep `useMissionControlData`.                                                                                               | IA-8    |
| `/shows/:id/trials/:tid/classes/:cid/secretary` (`SecretaryClassDashboard`)                           | **Goes**           | Unreachable; duplicates Results and paper scoring                                                                                                                            | IA-8    |
| `/secretary/settings` (`ShowSettingsPage`)                                                            | **Gone** (#3155)   | Its four cards moved to the Edit show panel; the route redirects to the dashboard                                                                                            | IA-1, 8 |
| Show Settings → venue location, venue Wi-Fi, per-show withdrawal policy                               | **Merged** (#3155) | Edit show details panel (show-level facts), keyed on the route show. Club admins of the owning club keep access (owner, 2026-10-21).                                         | IA-1    |
| Show Settings → Refund all entries                                                                    | **Merged** (#3155) | Edit show details panel, shown only once the show is cancelled (status select or "Mark Cancelled"); the card mounts unchanged, refunds stay human-approved. Owner 2026-10-21 | IA-1    |
| Show Settings → Results visibility "Manage", Self check-in "Manage"                                   | **Goes**           | Forwarders to pages that already own them                                                                                                                                    | IA-1    |
| `ShowAccessCodesCard` in `ShowOverviewTab` (manager branch) and Show Settings                         | **Goes**           | Tools → Access codes is the home; wizard success overlay keeps its moment                                                                                                    | IA-11   |
| Overview "Your show" row: Add Trial, Select classes, Enter results from scoresheet, Tools             | **Merges**         | Actions menu (Add Trial, Select classes, tools); scoring stays per class                                                                                                     | IA-4, 6 |
| Tools button and accordion sheet                                                                      | **Merges**         | Actions menu rows, one tool per panel (`plan-show-tools-into-actions.md`, owner-approved 2026-10-09)                                                                         | IA-6    |
| Volunteers tool card                                                                                  | **Merges**         | Its Actions row links straight to `/secretary/volunteers?showId=`                                                                                                            | IA-6    |
| Actions "Generate & publish premium"                                                                  | **Goes**           | The details panel's premium card is the one verb; chip and readiness line point at it                                                                                        | IA-10   |
| `ResultsControlPage` bulk release inside the Visibility settings sheet                                | **Goes** (verify)  | Release on the Results class detail only; the sheet keeps visibility                                                                                                         | IA-7    |
| Header: sync status, offline badge, live-update indicator                                             | **Merges**         | One device line (MYK9-1282)                                                                                                                                                  | IA-2    |
| Header: status pill + publish attention chip                                                          | **Merges**         | One show status line (MYK9-1282)                                                                                                                                             | IA-2    |
| Results "Open on Overview" / "Mark Class Complete on Overview" ping-pong                              | **Merges**         | Owner decision 2026-10-20: Option 1, the focused class owns the lifecycle, by mounting `ResultsClassDetail` there unchanged (see Phase C)                                    | IA-5    |
| Trial page Overview and Entries tabs (for managers)                                                   | **Merges**         | Owner decision 2026-10-20: a link into the workbench filtered by trial; per-trial Financials sits beside Reports' Financial Report                                           | IA-9    |
| Overview cockpit, focused class, class checklist                                                      | **Stays**          | The day's home and the daily paperwork home                                                                                                                                  | —       |
| Entry Forms                                                                                           | **Stays**          | The one home of entries (fix the default queue, MYK9-1276)                                                                                                                   | —       |
| Results (cross-class list, Submit, Close)                                                             | **Stays**          | After-the-show home                                                                                                                                                          | —       |
| Reports                                                                                               | **Stays**          | The print library; owner closed MYK9-959 without merging it                                                                                                                  | IA-12   |
| Class page, paper scoring, `/secretary/register`, messages, volunteers page                           | **Stays**          | Each is the canonical home of its job                                                                                                                                        | —       |
| Header armband lookup, presence avatars, details disclosure                                           | **Stays**          | Single homes                                                                                                                                                                 | —       |

## Re-triage of the held issues

Only the issues that touch this surface are decided here. The rest are on exhibitor, public or wizard surfaces and need their own audit or can proceed.

| Issue                                                                 | Verdict                   | Why                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MYK9-1294                                                             | **Narrow**                | Drop the "Today" strip: it is a third home for paperwork that Overview's class checklist already owns. Keep the one-sentence printed-state explanation.                                                                  |
| MYK9-1282                                                             | **Keep, rescope**         | It is IA-2. Its "Tools sheet" string disappears with Phase B; fix the rest in Phase A.                                                                                                                                   |
| MYK9-1262                                                             | **Merge into the plan**   | Duplicates `plan-show-tools-into-actions.md`, which is already owner-approved. Make 1262 that plan's implementation issue; drop "needs a plan first".                                                                    |
| MYK9-1269                                                             | **Keep**                  | Owner decision 2026-10-20. Absorb MYK9-1293 item 1 (highlight) into it so one change owns "where am I".                                                                                                                  |
| MYK9-1293                                                             | **Split**                 | Item 1 (Browse highlight) moves to 1269. Item 2 (My Club flyout) is outside this surface and stays.                                                                                                                      |
| MYK9-1278                                                             | **Keep, run last**        | Vocabulary; the tab name "Entry Forms" is in scope but no surface is deleted by it.                                                                                                                                      |
| MYK9-1295                                                             | **Out of scope, proceed** | Add Show wizard copy.                                                                                                                                                                                                    |
| MYK9-1279, 1280, 1283, 1284, 1285, 1286, 1287, 1288, 1290, 1291, 1292 | **Out of scope**          | Exhibitor, public and account surfaces. This audit deletes nothing they touch. An exhibitor-surface audit (`ia-review-exhibitor-surface.md` is the prior) should re-triage 1286, 1287, 1288, 1292 before they are built. |
| MYK9-1281, 1289                                                       | **Proceed**               | Seed data and a wizard correctness bug; survive any redesign, like the carve-out.                                                                                                                                        |
| MYK9-1275, 1276, 1277                                                 | **Carve-out, proceed**    | As the owner directed. 1277's card fields also serve IA-3.                                                                                                                                                               |

**New issues this audit implies:** IA-1 (re-home the four Show Settings capabilities, delete the page), IA-8 (delete the two orphan pages), IA-4 (fold the "Your show" row), IA-7 (single release path), IA-10 and IA-11 (single premium verb, single access-codes card), and an owner decision for IA-5 and IA-9. Nothing is filed yet.

## Step 6: Phased Remediation Plan

**Plan doc:** [`plan-ia-secretary-show-workbench.md`](plan-ia-secretary-show-workbench.md)

| Phase | Scope                                                                                                                  | Entry trigger                                                 | Exit criterion                                                                                          | PRs |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --- |
| A     | Free deletions and the orphaned capabilities: IA-1, IA-8, IA-10, IA-11; header copy (IA-2)                             | Owner approves the deletion list                              | Orphan routes gone; four capabilities reachable from Edit show; one premium verb; one access-codes card | 3   |
| B     | One door per verb: Tools into Actions (existing plan), "Your show" row folded (IA-4, IA-6), single release path (IA-7) | Phase A merged                                                | Overview body has no button row; Actions menu lists tools; one release path                             | 3–4 |
| C     | Where-am-I and the class lifecycle: IA-3 via MYK9-1269, IA-5 and IA-9 per owner decision                               | Owner decides IA-5 and IA-9; MYK9-958 observation if possible | Rail and breadcrumb name the show; a class has one home tab                                             | 2–3 |

---

## Summary

**Overall IA health:** Needs Work. The tab structure is sound and the canonical homes are real; the debt is extra doors and three abandoned pages, one of which strands four real capabilities.

**Top 3 findings:**

1. IA-1: refund-all, venue, Wi-Fi and per-show withdrawal policy are reachable only from a page nothing links to — Critical.
2. IA-4 / IA-6: Overview's button row and the Tools accordion duplicate the Actions menu — Critical / High.
3. IA-5: a class's lifecycle is split across Overview and Results — High, needs an owner decision.

**Phase A shipped 2026-10-21** (#3155, #3156, #3157; MYK9-1312 removed the importer-less leftovers): the three orphan pages gone, four capabilities reachable from the show, one premium verb, one header status line, and the secretary phase spec in `docs/INTENT.md`. Baseline for Phase B: 22 controls at 375px and 36 at 1280px on the Overview (MYK9-1298). **Next:** Phase B (MYK9-1262, 1317, 1318), then Phase C (MYK9-1269, 1319, 1320).
**Total estimated remediation effort:** 8–10 PRs across three phases.
