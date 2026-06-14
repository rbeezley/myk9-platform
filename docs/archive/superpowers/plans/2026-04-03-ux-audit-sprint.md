# myK9Show UX Audit Sprint Plan

> **For agentic workers:** This is a UX audit plan, not a code implementation plan. Each task is a page-level audit using the `/UX-Audit` skill (6 diagnostic passes). Tasks are independent and can run in parallel. Output is written to `docs/ux-audits/` as markdown files.

**Goal:** Audit the 22 highest-priority myK9Show pages across 5 tiers, producing actionable findings ranked by severity, with fixes tracked in TO-DOS.md.

**Architecture:** Each audit reads the page's component code + INTENT.md role context, runs the 6-pass diagnostic (mental model, IA, affordance, cognitive load, state coverage, flow integrity), and writes a structured findings document. Audits within the same tier can run in parallel since pages are independent.

**Reference docs:**

- `docs/INTENT.md` — role intent words and design guardrails
- `docs/ux-audit-priority.md` — page ranking and rationale
- `.claude/skills/UX-Audit/SKILL.md` — the 6-pass audit methodology

---

## Phase 0: Setup

- [ ] **Step 1: Create output directory**

```bash
mkdir -p docs/ux-audits
```

- [ ] **Step 2: Verify INTENT.md is current**

Read `docs/INTENT.md` and confirm the role intent words:

- Exhibitor: "This respects my time"
- Secretary: "That was easy"
- Judge: "Invisible technology"
- Steward: "I've got this under control"

---

## Phase 1: Exhibitor Core Journey (6 audits, run in parallel)

Each audit uses the `/UX-Audit` skill scoped to one page. The auditor must read INTENT.md first and evaluate against the exhibitor intent: **"This respects my time."**

### Task 1: Show Details Page

**Scope:** Page audit of `/shows/:id`
**Role context:** Exhibitor — "This respects my time." This is the entry point to registration and the first impression for every exhibitor.

**Files to read:**

- `apps/myk9show/src/pages/ShowDetailsPage.tsx` (387 lines)
- `apps/myk9show/src/components/shows/ShowDetails/` (ShowHeader, ShowMainCard, ShowInformationCard, HostingClubCard, TrialsList, EntriesTab, ShowStatistics, ShowGroupedSidebar, ShowEmptyStateView)

**Output:** `docs/ux-audits/01-show-details.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `ShowDetailsPage.tsx` and all sub-components in `ShowDetails/`
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/01-show-details.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 2: Registration Wizard

**Scope:** Flow audit of `/shows/:showId/register`
**Role context:** Exhibitor — "This respects my time." INTENT says registration should take "30 seconds." This is the money flow — friction means lost entries.

**Files to read:**

- `apps/myk9show/src/pages/RegistrationWizardPage.tsx` (653 lines)
- `apps/myk9show/src/components/shows/RegistrationWorkflow/` (40+ components: DogSelectionStep, ClassSelectionStep, HandlerAssignmentStep, PaymentStep, ConfirmationStep, RegistrationManagementPanel)

**Output:** `docs/ux-audits/02-registration-wizard.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `RegistrationWizardPage.tsx` and key step components in `RegistrationWorkflow/`
- [ ] **Step 3:** Run `/UX-Audit` as a flow audit (walk through the full registration journey), writing output to `docs/ux-audits/02-registration-wizard.md`
- [ ] **Step 4:** Specifically evaluate against the "30 seconds" INTENT target — count decisions, taps, and required fields per step
- [ ] **Step 5:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 3: Exhibitor Dashboard

**Scope:** Page audit of `/exhibitor/dashboard`
**Role context:** Exhibitor — "This respects my time." Landing page after login — sets the tone for "everything in one place."

**Files to read:**

- `apps/myk9show/src/pages/ExhibitorDashboard.tsx` (284 lines)

**Output:** `docs/ux-audits/03-exhibitor-dashboard.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `ExhibitorDashboard.tsx`
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/03-exhibitor-dashboard.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 4: My Entries

**Scope:** Page audit of `/exhibitor/entries`
**Role context:** Exhibitor — "This respects my time." Exhibitors check this constantly before and during show day.

**Files to read:**

- `apps/myk9show/src/pages/MyEntriesPage/index.tsx` (369 lines)
- `apps/myk9show/src/pages/MyEntriesPage/modules/`

**Output:** `docs/ux-audits/04-my-entries.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `MyEntriesPage/index.tsx` and modules
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/04-my-entries.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 5: Show Day

**Scope:** Page audit of `/exhibitor/show-day`
**Role context:** Exhibitor — "This respects my time." Day-of experience — stress is high, UX must be calm. INTENT says "Clear, simple view — ring, time, class. No clutter."

**Files to read:**

- `apps/myk9show/src/pages/ShowDayPage.tsx` (211 lines)

**Output:** `docs/ux-audits/05-show-day.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `ShowDayPage.tsx`
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/05-show-day.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 6: Dog Detail

**Scope:** Page audit of `/dogs/:id`
**Role context:** Exhibitor — "This respects my time." Exhibitors' emotional center — their dog's career and profile. INTENT says "Dog profiles, entry history, title progress — no hunting."

**Files to read:**

- `apps/myk9show/src/pages/DogDetailPage.tsx` (82 lines — thin wrapper)
- `apps/myk9show/src/components/dogs/DogDetails/` (DogDetailsCard, DogTabNavigation, DogActionsMenu, EmptyStateView)
- Subdirectories: `Competitions/`, `HealthRecords/`, `Pedigree/`, `Registrations/`, `Statistics/`, `TitleTracking/`, `TrainingJournal/`

**Output:** `docs/ux-audits/06-dog-detail.md`

- [ ] **Step 1:** Read `docs/INTENT.md` exhibitor section
- [ ] **Step 2:** Read `DogDetailPage.tsx` and all sub-components in `DogDetails/`
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/06-dog-detail.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

---

## Phase 1 Checkpoint

- [ ] **Step 1:** Read all 6 audit files and compile a cross-cutting summary
- [ ] **Step 2:** Identify patterns that appear across multiple pages (these are systemic issues worth fixing once)
- [ ] **Step 3:** Write `docs/ux-audits/phase-1-summary.md` with:
  - Cross-cutting themes
  - Top 10 findings ranked by severity
  - Suggested fix order (quick wins first)
- [ ] **Step 4:** Add Critical and High findings to `TO-DOS.md` under a new "UX Audit Findings" section
- [ ] **Step 5:** Commit all Phase 1 audit files

```bash
git add docs/ux-audits/
git commit -m "docs: UX audit phase 1 — exhibitor core journey (6 pages)"
```

- [ ] **Step 6:** Decide whether to proceed to Phase 2 or fix Phase 1 findings first

---

## Phase 2: Secretary Operations (5 audits, run in parallel)

Evaluate against the secretary intent: **"That was easy."**

### Task 7: Pipeline Dashboard

**Scope:** Page audit of `/secretary/dashboard`
**Role context:** Secretary — "That was easy." Secretary's home base — must surface problems, not data.

**Files to read:**

- `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx` (275 lines)
- Same directory: ClassPipelineColumn, TrialPipelineDetail, PipelineColumn, ClassPipelineCard, TrialPipelineCard

**Output:** `docs/ux-audits/07-pipeline-dashboard.md`

- [ ] **Step 1:** Read `docs/INTENT.md` secretary section
- [ ] **Step 2:** Read `PipelineDashboard.tsx` and pipeline sub-components
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/07-pipeline-dashboard.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 8: Day-of Operations

**Scope:** Flow audit of `/secretary/day-of`
**Role context:** Secretary — "That was easy." Show-day chaos — scratches and move-ups must be 1-tap operations. INTENT says "calm one-tap operations, not multi-step wizards."

**Files to read:**

- `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx` (160 lines)
- Same directory: ClassAvailabilityTable, DayOfEntryDialog, MoveUpDialog, MoveUpEntriesTable, ScratchDialog, ScratchEntriesTable

**Output:** `docs/ux-audits/08-day-of-operations.md`

- [ ] **Step 1:** Read `docs/INTENT.md` secretary section
- [ ] **Step 2:** Read `DayOfOperationsPage/index.tsx` and all dialog/table sub-components
- [ ] **Step 3:** Run `/UX-Audit` as a flow audit (walk through scratch and move-up flows), writing output to `docs/ux-audits/08-day-of-operations.md`
- [ ] **Step 4:** Count taps for scratch and move-up — INTENT target is 1 tap each
- [ ] **Step 5:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 9: Results Control

**Scope:** Page audit of `/secretary/results-control`
**Role context:** Secretary — "That was easy." Recently built (PR #37) — good time to audit while fresh.

**Files to read:**

- `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx` (203 lines)
- Same directory: BulkOperationsBar, ClassOverrides, PresetSelector, SelfCheckinSection, TrialOverrides, resultsControlUtils

**Output:** `docs/ux-audits/09-results-control.md`

- [ ] **Step 1:** Read `docs/INTENT.md` secretary section
- [ ] **Step 2:** Read `ResultsControlPage/index.tsx` and all sub-components
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/09-results-control.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 10: Show Creation Wizard

**Scope:** Flow audit of `/secretary/create-show/wizard`
**Role context:** Secretary — "That was easy." Complex multi-step flow — high cognitive load risk. INTENT says "Smart defaults, clone from previous shows, minimal required fields."

**Files to read:**

- `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx` (583 lines)
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/` (transformers, validation, actions hook, types)

**Output:** `docs/ux-audits/10-show-creation-wizard.md`

- [ ] **Step 1:** Read `docs/INTENT.md` secretary section
- [ ] **Step 2:** Read `ShowCreationWizardPage.tsx` and wizard utility files
- [ ] **Step 3:** Run `/UX-Audit` as a flow audit (walk through full show creation), writing output to `docs/ux-audits/10-show-creation-wizard.md`
- [ ] **Step 4:** Specifically evaluate: Are there smart defaults? Can you clone from a previous show? How many required fields per step?
- [ ] **Step 5:** Verify the audit covers all 6 passes and has a prioritized summary

### Task 11: Entry Management

**Scope:** Page audit of `/secretary/entries/:showId`
**Role context:** Secretary — "That was easy." Bulk operations under time pressure.

**Files to read:**

- `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx` (493 lines)

**Output:** `docs/ux-audits/11-entry-management.md`

- [ ] **Step 1:** Read `docs/INTENT.md` secretary section
- [ ] **Step 2:** Read `EntryManagementPage.tsx`
- [ ] **Step 3:** Run `/UX-Audit` as a page audit, writing output to `docs/ux-audits/11-entry-management.md`
- [ ] **Step 4:** Verify the audit covers all 6 passes and has a prioritized summary

---

## Phase 2 Checkpoint

- [ ] **Step 1:** Read all 5 Phase 2 audit files and compile cross-cutting summary
- [ ] **Step 2:** Write `docs/ux-audits/phase-2-summary.md` with themes, top findings, fix order
- [ ] **Step 3:** Add Critical and High findings to `TO-DOS.md`
- [ ] **Step 4:** Commit all Phase 2 audit files

```bash
git add docs/ux-audits/
git commit -m "docs: UX audit phase 2 — secretary operations (5 pages)"
```

- [ ] **Step 5:** Decide whether to proceed to Phase 3 or fix accumulated findings

---

## Phase 3: Public Discovery (4 audits, run in parallel)

No specific role intent — these serve anonymous/new users. Evaluate against the platform soul: **"The software disappears so the dogs can shine."**

### Task 12: Browse Shows

**Files:** `apps/myk9show/src/pages/BrowseShowsPage.tsx`
**Output:** `docs/ux-audits/12-browse-shows.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Can a first-time visitor find and understand available shows? Is the filtering intuitive?

### Task 13: Landing / Home

**Files:** `apps/myk9show/src/pages/Home.tsx`
**Output:** `docs/ux-audits/13-landing-page.md`

- [ ] Run `/UX-Audit` page audit. Focus on: First impression. Does the page communicate what myK9Show is and who it's for within 5 seconds?

### Task 14: Sign Up

**Files:** `apps/myk9show/src/pages/SignUpPage.tsx`
**Output:** `docs/ux-audits/14-sign-up.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Conversion friction. How many fields? How many steps? What stops someone from completing registration?

### Task 15: Class Details

**Files:** `apps/myk9show/src/pages/ClassDetailsPage.tsx`
**Output:** `docs/ux-audits/15-class-details.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Can exhibitors find their dog's results quickly? Is the data presentation clear?

---

## Phase 3 Checkpoint

- [ ] Write `docs/ux-audits/phase-3-summary.md`
- [ ] Add Critical/High findings to `TO-DOS.md`
- [ ] Commit

---

## Phase 4: Judge & Scoring (3 audits)

Evaluate against judge intent: **"Invisible technology."**

### Task 16: Judge Class Interface

**Files:** Find via route `.../classes/:classId/judge` in `judgeRoutes.tsx`
**Output:** `docs/ux-audits/16-judge-class-interface.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Touch target sizes (INTENT: 48x48px), rhythm between entries, tap count per score.

### Task 17: Judge Dashboard

**Files:** Find via route `/judge/dashboard` in `judgeRoutes.tsx`
**Output:** `docs/ux-audits/17-judge-dashboard.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Glanceability of assignments, clarity of schedule.

### Task 18: TV Display

**Files:** `apps/myk9show/src/pages/TVDisplay.tsx` (or similar)
**Output:** `docs/ux-audits/18-tv-display.md`

- [ ] Run `/UX-Audit` page audit. Focus on: Readability at distance, auto-refresh, spectator comprehension without context.

---

## Phase 4 Checkpoint

- [ ] Write `docs/ux-audits/phase-4-summary.md`
- [ ] Add Critical/High findings to `TO-DOS.md`
- [ ] Commit

---

## Phase 5: Settings & Admin (4 audits)

Lower priority. Can be deferred if earlier phases produce enough work.

### Task 19-22: Profile, Preferences, Subscription, Admin Dashboard

**Output:** `docs/ux-audits/19-profile.md` through `docs/ux-audits/22-admin-dashboard.md`

- [ ] Run `/UX-Audit` page audit on each. Lower depth — focus on Pass 4 (cognitive load) and Pass 5 (state coverage) since these are settings pages where missing states are most common.

---

## Phase 5 Checkpoint & Final Summary

- [ ] **Step 1:** Write `docs/ux-audits/final-summary.md` combining all phase summaries
- [ ] **Step 2:** Rank all findings across all phases into a single priority list
- [ ] **Step 3:** Group related findings that can be fixed together (e.g., "all pages missing empty states")
- [ ] **Step 4:** Update `TO-DOS.md` with the final prioritized fix list
- [ ] **Step 5:** Commit everything

```bash
git add docs/ux-audits/
git commit -m "docs: complete UX audit sprint — 22 pages across 5 tiers"
```
