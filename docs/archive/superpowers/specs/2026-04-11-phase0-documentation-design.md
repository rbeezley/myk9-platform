# Design: Phase 0 — Write Down the Truth

**Date:** 2026-04-11
**Status:** Approved

## Context

Phase 0 of the Fall 2026 North Star plan. Produces the three remaining documentation deliverables needed before any code changes begin. Two deliverables are already done: `docs/INTENT.md` and `docs/roles/` (6 role files). This spec covers the remaining three.

**Working model:** Claude drafts each document; user reviews and corrects. Sequential approval gates: journeys approved before audit is drafted; audit approved before nav sketch is drafted.

**Reference material:**

- `docs/mySWT/mySWT User-Guide.txt` — sections 3.7–3.30 map to the secretary workflow
- `docs/mySWT/*.png` — 40+ workflow screenshots
- `apps/myk9q/src/` — exhibitor-facing pages (check-in, run order, results/stats)
- `apps/myk9show/src/pages/` — all ~50 myK9Show pages
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` — current nav per role

---

## Deliverable 1: Journey Maps

**Files:** `docs/journeys/secretary.md`, `docs/journeys/exhibitor.md`

### Format (per document)

Each journey is broken into phases. Each phase contains:

1. **Narrative** (2–4 sentences) — what the user is trying to accomplish; what the app should make feel easy
2. **Numbered steps** — e.g., "1. Open Secretary Dashboard → 2. Click 'Create Show'…"
3. **Current-state notes** — where the app today differs from the intended flow; flags gaps for Phase 2
4. **Mermaid flowchart** — happy-path diagram for that phase

### Secretary Journey — 4 Phases

| Phase                | Scope                                                                   | Primary source                                               |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Show Setup        | Create show → trials → classes → assign judges → publish                | mySWT 3.9–3.11, ShowCreationWizardPage                       |
| 2. Entry Management  | Accept/waitlist/reject, record mail-ins, communicate with exhibitors    | mySWT 3.14–3.21, EntryManagementPage, WaitlistManagementPage |
| 3. Day-of Operations | Check-in desk, day-of entries, scratches, move-ups, run order, scoring  | mySWT 3.20, DayOfOperationsPage, RunOrderPage                |
| 4. Closeout          | Reports, results verification, AKC XML export, financial reconciliation | mySWT 3.26–3.30, ReportsPage, ResultsSubmissionPage          |

### Exhibitor Journey — 4 Phases

| Phase              | Scope                                                                 | Primary source                                             |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Discovery       | Browse shows, view show details, decide to enter                      | myK9Show: BrowseShowsPage, ShowDetailsPage                 |
| 2. Entry & Payment | Registration wizard, pay via Stripe or mail check                     | myK9Show: RegistrationWizardPage, CartPage, Checkout       |
| 3. Pre-Show        | Confirmation, view entry status, receive announcements, see run order | myK9Show: MyEntriesPage; myK9Q: schedule view              |
| 4. Show Day        | Check-in, running order, view results, stats                          | myK9Q: check-in, run order, results; myK9Show: ShowDayPage |

### Notes on sources

- The Access app (mySWT) was secretary-only. It is **not** a reference for the exhibitor journey.
- The exhibitor's pre-show experience (discovery, entry, payment) is myK9Show-native — draft from the current registration wizard and entries pages.
- The exhibitor's show-day experience (check-in, run order, results) was previously served by myK9Q — draft from myK9Q exhibitor-facing pages.

### Approval gate

User approves both journey maps before the feature audit is drafted. Journey corrections flow directly into audit classifications.

---

## Deliverable 2: Feature Audit

**File:** `docs/feature-audit-2026.md`

### Classifications

| Label             | Meaning                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| **critical-path** | On the secretary or exhibitor golden path; must work perfectly for fall       |
| **park**          | Real feature, not on the fall golden path; hide from nav, revisit post-launch |
| **delete/hide**   | Demo page, duplicate, or feature that shouldn't exist yet; remove from router |

### Table format (per row)

| Page / Feature | Route | Classification | Rationale |
| -------------- | ----- | -------------- | --------- |

### Sections

1. **Secretary** — Manage nav group pages
2. **Exhibitor** — Exhibitor-only sidebar pages
3. **Admin** — Admin nav group pages
4. **Judge / Steward** — Judging nav group pages
5. **Browse / Public** — Shared browse and public-facing pages
6. **Utility / Infrastructure** — Auth, legal, offline test, sync dashboard, demo pages

### Drafting approach

Classifications are derived from the approved journey phases: anything outside the 8 journey phases above defaults to **park** unless it is clearly infrastructure (auth, legal) or clearly a dev artifact (demo/test pages → **delete/hide**).

### Approval gate

User approves audit before the navigation/IA sketch is drafted. Park/delete decisions from the audit become direct inputs to the consolidation table.

---

## Deliverable 3: Navigation / IA Sketch

**File:** `docs/navigation-ia.md`

### Three sections

**1. Role home screens**
One paragraph per role (Secretary, Exhibitor, Admin for fall; Judge/Steward deferred) describing:

- The single screen they land on after login
- What that screen must show at a glance
- What the primary nav items are

**2. Consolidation decisions**
Table of every "X should be a tab/section of Y" call derived from the audit.

| Current page(s) | Disposition | Destination | Notes |
| --------------- | ----------- | ----------- | ----- |

Examples of patterns to resolve:

- `ShowDetailsPage` + `TrialDetailsPage` + `ClassDetailsPage` — may collapse into a tabbed show page
- Old `SecretaryDashboard` vs new `SecretaryDashboard/` — remove the old one
- Browse pages (Dogs, People) that aren't on either golden path — park from nav

**3. New routes needed**
Short list of routes the journeys require that don't currently exist. Each item becomes a Phase 2 work item. Likely candidates: public show detail page (no login required for discovery).

---

## Sequencing

```
Draft secretary journey
  → user approves
Draft exhibitor journey
  → user approves both
Draft feature audit (against approved journeys)
  → user approves
Draft navigation/IA sketch (against approved audit)
  → user approves
Phase 0 complete → invoke writing-plans for Phase 1
```

---

## Out of Scope

- Refreshing `docs/INTENT.md` — current version is solid; no changes needed for fall
- Judge and steward journeys — deferred post-fall (these roles primarily live in myK9Q)
- Non-scent sports
- Any code changes — Phase 0 is documentation only
