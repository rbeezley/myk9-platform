# Plan: Stabilize myK9 Platform Toward a Solid Fall 2026 Launch

## Context

After months of feature-by-feature building without a written north star, the app has drifted into a state where individual features look reasonable but the whole feels incoherent: navigation is unclear, workflows are unclear, the same action (e.g. "add a dog") has multiple inconsistent implementations, and several pages exist that should really be tabs/sections of other pages. Testing from the previous session produced a TO-DO list of breakages that blocked further testing.

**The root cause** is not the code — it is the absence of written role definitions and end-to-end user journeys to build *against*. Every subsequent decision has been made without a spine, so features accumulated without cohesion.

**The goal** is a solid fall 2026 launch (~5–6 months, no hard deadline) where first impressions justify adoption by the target audience: retired, elderly dog-sport volunteers and exhibitors who are not computer-savvy. Technology must disappear behind the task.

**Scope decision for fall:**
- **Primary (must be polished):** Secretary, Exhibitor
- **Functional (enough to run the platform):** Site Admin (just the user)
- **Bare-bones or deferred:** Judge, Steward (these roles mostly live in myK9Q anyway)
- **Deletion policy:** Cut, but cautiously — hide/disable before deleting, delete later once confirmed unneeded
- **Sports scope:** The three scent sports (AKC Scent Work, UKC Nose Work, ASCA Scent Detection) only

---

## Guiding Principles

1. **One canonical path per task.** Multiple entry points are fine; multiple *implementations* are not. All "add dog" buttons land in the same canonical flow.
2. **One home per role.** A secretary opens the app and sees their whole job. Same for exhibitor. No hunting.
3. **Cut before polishing.** We simplify by removing, not reorganizing.
4. **Critical path first.** Everything off the two golden paths waits.
5. **Protect intent.** Preserve `// INTENT:` comments and the emotional intent per role (see `docs/INTENT.md`).

---

## Pre-Work: Finish Two In-Flight Feature Plans (~4–7 weeks)

Two detailed feature plans already exist and should be completed **before** the North Star work begins. Both are on the secretary golden path, neither touches navigation or IA, and both are low-risk with respect to later consolidation decisions.

### 1. AKC XML Results Export (~1–2 weeks)
- Plan: `docs/superpowers/plans/2026-04-09-akc-xml-results-export.md`
- Scope: real `AKCScentWorkFormatter`, `useAKCSubmissionData` hook, `send-results` Supabase Edge Function (via Resend), wire-up in the existing `ResultsSubmissionPage`
- UX surface: single page (`ResultsSubmissionPage`) — navigation untouched
- **New reference assets** (under `docs/mySWT/`):
  - `Norwegian Elkhound Association of America-Results_20260409082032.xml` — real, valid `electres.xml` output from the Access app. Use as golden-fixture test input for the new formatter.
  - `mod_XML.bas` — the Access VBA module that generates the XML. Reference implementation; use for field-by-field parity when porting to TypeScript.
  - `tbl_Show.txt`, `tbl_Trial.txt`, `tbl_Class.txt`, `tbl_Entry.txt`, `tbl_Person.txt`, `tbl_Exhibitor.txt` — the source Access schema the VBA reads from; use to disambiguate field mapping between the Access source and the Supabase destination.
- Rework risk if nav later changes: low — formatter, hook, and edge function are reusable; only the page location could move

### 2. Phase 2 Reports — Expanded Scope (~3–5 weeks)
- Plan: `docs/superpowers/plans/2026-04-09-phase2-reports.md` (**needs expansion before execution** — see additional reports below)
- Reference material: all screenshots now captured under `docs/mySWT/`, including per-report PDFs (`SW-EntryForm.pdf`, `SW-JudgeReport.pdf`, `SW-Scoresheet.pdf`, `SW-TCReport.pdf`, `SW-TSReport.pdf`, `SW-Transfer.pdf`)
- UX surface: single page (`ReportsPage`) — navigation untouched
- Rework risk if nav later changes: low — report components are pure and the registry pattern is location-agnostic

**Originally planned (6 reports):**
Show Catalog, Result Catalog, Judge's Schedule, Trial Secretary Report, Judge's Certification, Trial Chairman Report

**Added to Phase 2 scope** (present in Access, absent from both Phase 1 done-list and Phase 2 plan):
1. **Result Labels** (`result_labels.png`)
2. **AKC Judge's Report** (`akc_judge_report.png`, `SW-JudgeReport.pdf`)
3. **AKC Secretary Certification** (`ac_secretary_certification.png`)
4. **Show Entry Counts** (`show_entry_counts.png`)
5. **Trial Entry Counts** (`trial_entry_counts.png`)
6. **Breed Entry Counts** (`breed_entry_counts.png`)
7. **Judge Entry Counts** (`judge_entry_counts.png`) + **Judge Entry Counts with Estimated Time** variant (`judge_entry_counts_estimated_time.png`)
8. **Financial Report — Accepted** (`financial_report_accepted.png`)
9. **Financial Report — Waitlist** (`financial_report_waitlist.png`)
10. **Steward Report** (`steward_report.png`)
11. **Waitlist Report** (`waitlist.png`)

**To reconcile before execution:**
- `preliminary_results.png` — may overlap with the existing `ResultsSheet` (Phase 1); verify before implementing separately
- `show_catalog_addresses.png` — likely a sort/option variant of Show Catalog rather than a separate report

**Expansion action:** `docs/superpowers/plans/2026-04-09-phase2-reports.md` has been updated (Tasks 9–20 added) to cover the additional reports. Total Phase 2 Reports scope grows from 6 to 16 report components (Financial Accepted+Waitlist combined into one component with a sort-option toggle, matching the Access pattern).

### Why these go before Phase 0 (not after)
- Both features are required for fall launch regardless of the audit outcome
- Both plans are already detailed — not finishing them is sunk-cost waste
- Completing them makes Phase 0's feature audit cleaner: we evaluate *finished* features, not half-baked ones
- Reports work is already informed by Access reference material (Phase 0 would have duplicated this effort)

### Pre-Work Exit Criteria
- AKC XML export plan fully executed; tests pass; output matches the Norwegian Elkhound sample XML structurally; "Send to AKC" email succeeds end-to-end
- Phase 2 Reports plan (expanded) fully executed; all ~17 reports render correctly against real show data; tests pass

---

## Phase 0 — Write Down the Truth (no code, ~3–7 days)

The paperwork phase. Produces the documents that should have existed from day one. **Claude drafts; user reacts** — this is the working model.

**Note:** Phase 0 was originally scoped at 1–2 weeks. With the `mySWT User-Guide.txt` (sections 3.7–3.30 are effectively the full secretary workflow) and the 40+ workflow screenshots in `docs/mySWT/`, the secretary journey can be drafted directly from existing reference material. Estimate dropped accordingly. The exhibitor journey still requires more original work since the Access app is a desktop secretary tool and does not document an exhibitor flow.

**Tooling:** Use `/ultraplan` for the Phase 0 drafting pass. The journey maps and feature audit are long-context, reference-material-heavy documents — a good fit for cloud-based planning with the `docs/mySWT/` assets attached, then reviewed and committed locally. Do not use it for Phase 1/2 execution (those are already detailed plans ready to run).

### Deliverables

All deliverables live under `docs/plans/` or `docs/` as appropriate and are committed to git as they are produced.

1. **Refreshed `docs/INTENT.md`**
   - Update the per-role emotional intent statements (Secretary = "in control of this show," Exhibitor = "I trust this with my day," Admin = "I can see and fix everything"). Wording TBD with user.

2. **Role definitions** — one short page each
   - Secretary, Exhibitor, Admin (full); Judge, Steward (stubs for fall).
   - Cover: who they are, computer-savviness, what they must accomplish, what they should *never* have to think about.
   - File: `docs/roles/<role>.md`

3. **End-to-end journey maps** (the critical deliverable)
   - **Secretary journey:** create show → manage entries → day-of operations → results → closeout.
   - **Exhibitor journey:** find show → enter dogs → payment → check-in → results.
   - Embedded **Mermaid flow diagrams** at each journey level plus step-by-step narration.
   - File: `docs/journeys/secretary.md`, `docs/journeys/exhibitor.md`

4. **Refreshed feature audit**
   - Walk the existing app; for every feature/page mark: **critical-path**, **park**, or **delete/hide**.
   - Measured against the journeys above, not "does it work today."
   - File: `docs/feature-audit-2026.md`

5. **Navigation / IA sketch**
   - One home per role. Journey reflected as primary nav. Page-consolidation decisions documented here ("X should be a tab of Y").
   - File: `docs/navigation-ia.md`

### Reference Material (read during Phase 0)

- **`docs/mySWT/mySWT User-Guide.txt`** — full text of the mySWT User Guide (converted from PDF). Sections 3.7–3.30 map directly to the secretary journey: Home Page, Clubs, Shows, Trials, Classes, People, Dogs, Scoreboard, Using the Application during a Trial, Entries List, Backup, Armband Labels, Check-In Sheets, Scoresheets, Results Catalog, Result Report, Result Labels, Statistics, Close-Out.
- **`docs/mySWT/*.png`** — 40+ workflow and report screenshots covering show/trial/class/dog/people list and detail pages, entry flow, results entry, email flow, exhibitor report, check-in, scoresheets, catalogs, all AKC organizational forms, entry counts, financials, waitlist, and labels.
- **`docs/mySWT/SW-*.pdf`** — the printed forms produced by the Access app (entry form, judge report, scoresheet, trial chairman report, trial secretary report, transfer). These are *format* specs, not screen designs.
- **`docs/mySWT/tbl_*.txt`** — Access table exports for the scent-work database (clubs, shows, trials, classes, entries, people, exhibitors, breeds, varieties, email templates, history, armband temporary). Useful for data-model reference and field mapping.
- **`docs/mySWT/mySWT User-Guide.pdf`** — original PDF, kept for any sections the text conversion garbled. Requires Poppler (`pdftoppm`) to read via the Read tool.
- **`https://myk9t.com/knowledge-base/`** — live knowledge base covering mySWT, myNWT, mySCT and the myK9Q online platform. Documents the mySWT nav model. Fetch relevant pages as needed.
- **Existing stale artifacts** (to refresh, not restart): prior feature audit, current `docs/INTENT.md`, yesterday's testing TO-DOs, `TO-DOS.md`.
- **Still to be supplied by user (exhibitor journey only):** a narrative or ordered walkthrough of how an exhibitor discovers, enters, pays for, and shows up to a trial in the current (non-Access) world — the Access app does not cover this side.

### Phase 0 Exit Criteria

- All five deliverables committed under `docs/`
- User has read and approved the journey maps and feature audit
- Phase 1 consolidation/deletion decisions are unambiguous

---

## Phase 1 — Quiet the Noise (~1 week)

The app stops fighting us. Three passes, in order.

### Pass 1: Hide/Disable
- Everything marked "park" or "delete/hide" in the feature audit gets hidden behind a feature flag or removed from the router.
- Code stays in git history, not in the user's way.
- **Expected outcome:** the visible app shrinks noticeably.

### Pass 2: Page Consolidation
- Execute the "X should be a tab of Y" decisions from the navigation sketch.
- Mostly routing + layout work, not rewriting features.

### Pass 3: Canonical Path
- For each duplicated action (starting with "add a dog"), pick one implementation as canonical.
- Make sure it works from every context that legitimately needs it.
- Replace every other entry point with a link/redirect into the canonical flow.
- Delete the duplicate implementations.

### Testing TO-DO Triage (same week)
- **On a golden path?** → defer to Phase 2, fix naturally while walking
- **On a hidden feature?** → close, no longer relevant
- **Blocking Phase 0/1 work?** → fix now

### Phase 1 Exit Criteria
- No hidden features appear in navigation or routes
- Each consolidated page is reachable via its new canonical location
- One canonical implementation per duplicated action

---

## Phase 2 — Walk the Golden Paths (~3–5 weeks)

The polish phase. Method: sit down, walk the journey as that role in a real browser with realistic data. Every gap — broken, confusing, ugly, slow, missing — gets fixed *before moving on*. No wandering to unrelated bugs. No new features.

### Order
1. **Secretary golden path** (~2–3 weeks) — reference against Access screenshots and the knowledge base
2. **Exhibitor golden path** (~1–2 weeks)
3. **Admin minimum** (~few days) — just enough for the user to run the platform: manage users, troubleshoot, see across shows

### Rules
- Fix the root cause, not the symptom (this is where the "add dog works here but not there" class of bug finally dies)
- No new features discovered mid-walk — park them for Phase 3
- No chasing unrelated bugs on hidden features

### Testing During Phase 2
- New unit tests for new/changed components, hooks, and utilities (per `CLAUDE.md` policy — no phase is complete without tests)
- Use `src/test/utils/testUtils.tsx` custom render
- Skip known-broken pre-existing test files (see memory: `PresenceService.test.ts`, `PerformanceService.test.ts`, etc.)

### Phase 2 Exit Criteria
- A user can walk the entire secretary and exhibitor journeys end-to-end without a dead end or a broken step
- All new/changed code has passing unit tests
- No TO-DOs remain on the golden paths

---

## Phase 3 — Real-User Testing (~1–2 weeks)

Non-negotiable. "It works for me" does not ship to retired volunteers.

### Method
1. Recruit 2–3 real test users — one secretary, one or two exhibitors. Not developers, not veterans who'll fill gaps mentally.
2. Give them a written task ("enter your dog in this show"), not a tour. Watch silently.
3. Every hesitation, wrong click, or "where do I…" is a bug.
4. Fix confusion, not just errors.
5. Iterate until users stop getting stuck.

### Parked-Item Revisit
- Once golden paths are clean, revisit the "park" pile from the feature audit and decide what to un-hide for a post-fall release.

### Phase 3 Exit Criteria
- Two test users complete the secretary and exhibitor journeys unassisted
- No confusion-level findings outstanding

---

## Critical Files and Paths

**To be created (Phase 0):**
- `docs/roles/secretary.md`, `docs/roles/exhibitor.md`, `docs/roles/admin.md` (stubs for judge, steward)
- `docs/journeys/secretary.md`, `docs/journeys/exhibitor.md`
- `docs/feature-audit-2026.md`
- `docs/navigation-ia.md`

**To be refreshed:**
- `docs/INTENT.md`
- `TO-DOS.md` (after Phase 1 triage)

**Reference (read-only, already present):**
- `docs/mySWT/mySWT User-Guide.pdf` (needs Poppler installed)
- `https://myk9t.com/knowledge-base/`
- `CLAUDE.md` (project rules)

**To be touched in Phase 1/2:** determined by the feature audit and navigation sketch, not pre-specified here.

---

## Verification

**Pre-Work — AKC XML Export:**
- `pnpm typecheck` and `pnpm lint` clean
- `pnpm test` passes in `packages/secretary` and `apps/myk9show`
- End-to-end: generate `electres.xml` from a real show, validate against AKC schema, send via edge function, confirm email received

**Pre-Work — Phase 2 Reports:**
- `pnpm typecheck` and `pnpm lint` clean
- `pnpm test` passes in `apps/myk9show`
- Visual: each of the 6 reports renders correctly against real show data via the `ReportsPage` preview

**Phase 0:** user reads and approves the journeys and feature audit; committed to git.

**Phase 1:**
- `pnpm typecheck` and `pnpm lint` clean
- `pnpm build` succeeds
- Manual: walk the navigation — every hidden feature is absent from nav; every consolidated page is reachable at its new location; every "add dog" button lands in the same canonical flow

**Phase 2:**
- `pnpm typecheck` and `pnpm lint` clean
- Unit tests pass for new/changed code (`pnpm test` in the relevant app)
- Manual walk: `pnpm dev:show` — the user completes the secretary journey end-to-end, then the exhibitor journey end-to-end, on localhost:5173, without hitting a blocker

**Phase 3:** 2–3 non-technical test users complete both journeys unassisted; confusion-level findings addressed.

---

## Out of Scope (Explicitly)

- Judge and steward dashboards in myK9Show (deferred post-fall)
- Non-scent sports (agility, obedience, conformation, rally, FastCAT) — deferred post-fall
- Performance monitoring, analytics dashboards beyond minimum
- New feature development during Phases 1–3
- Rebuilding myK9Q — it is separate and stays on its own track
- Copying the visual style of the Access apps — they are reference for *what*, not *how*

---

## Working Model

- **Claude drafts all Phase 0 documents**, user reviews and corrects
- User provides Access reference material (screenshots, report PDFs, sample data) during Phase 0
- Phase 1 consolidation and deletion decisions are made together, in writing, before any code changes
- Phase 2 is implementation with incremental commits per golden-path segment
- Testing TO-DOs stay in `TO-DOS.md` and are moved through the triage buckets defined in Phase 1
