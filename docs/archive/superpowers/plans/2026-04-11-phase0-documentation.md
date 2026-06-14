# Phase 0 — Write Down the Truth: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the three remaining Phase 0 documentation deliverables — journey maps (secretary + exhibitor), feature audit, and navigation/IA sketch — so that Phase 1 code changes have an unambiguous written reference to work against.

**Architecture:** Documentation only. No code changes. Each document is drafted via `/ultraplan` (Claude Code research preview, v2.1.94+), reviewed by the user inline in the browser, corrected in this session if needed, then committed. Sequential approval gates: journeys must be approved before the audit is drafted; audit must be approved before the nav sketch is drafted.

**Tech Stack:** `/ultraplan` for long-context drafting, Mermaid for flow diagrams, Markdown for all deliverables.

**Design spec:** `docs/superpowers/specs/2026-04-11-phase0-documentation-design.md`

---

## File Map

| Action | Path                         | Purpose                                                  |
| ------ | ---------------------------- | -------------------------------------------------------- |
| Create | `docs/journeys/secretary.md` | Secretary 4-phase journey with Mermaid diagrams          |
| Create | `docs/journeys/exhibitor.md` | Exhibitor 4-phase journey with Mermaid diagrams          |
| Create | `docs/feature-audit-2026.md` | Keep/park/delete classification of all ~50 pages         |
| Create | `docs/navigation-ia.md`      | Role home screens + consolidation decisions + new routes |

---

## Task 1: Draft Secretary Journey Map

**Files:**

- Create: `docs/journeys/secretary.md`

**Reference material for this task:**

- `docs/mySWT/mySWT User-Guide.txt` (sections 3.7–3.30 — the full secretary workflow)
- `docs/roles/secretary.md` (role intent and scope)
- `apps/myk9show/src/pages/secretary/` (current page structure)
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (Manage nav group)
- `docs/superpowers/specs/2026-04-11-phase0-documentation-design.md` (format spec)

- [ ] **Step 1: Run /ultraplan with the following prompt**

Invoke from the CLI:

```
/ultraplan Draft docs/journeys/secretary.md for the myK9 platform.

FORMAT (repeat for each of the 4 phases):
## Phase N: [Name]
[2–4 sentence narrative: what the secretary is trying to accomplish; what the app should make feel easy]
### Steps
1. [action] → [screen/page]
2. ...
### Current-state notes
- [Where the app today differs from the intended flow — gaps for Phase 2]
### Mermaid flowchart
[Happy-path flowchart for this phase only]

PHASES:
1. Show Setup — create show → trials → classes → assign judges → publish
2. Entry Management — accept/waitlist/reject entries, record mail-ins, communicate with exhibitors
3. Day-of Operations — check-in desk, day-of entries, scratches, move-ups, run order, scoring
4. Closeout — reports, results verification, AKC XML export, financial reconciliation

PRIMARY REFERENCE: docs/mySWT/mySWT User-Guide.txt sections 3.7–3.30 map the secretary workflow step by step. Use them as the authoritative source for what a secretary does, in what order. Where the mySWT workflow differs from myK9Show, note it in Current-state notes.

SECONDARY REFERENCE: apps/myk9show/src/pages/secretary/ shows what pages currently exist. Match step descriptions to real page names (e.g., ShowCreationWizardPage, EntryManagementPage, DayOfOperationsPage, ReportsPage, ResultsSubmissionPage).

ROLE CONTEXT: docs/roles/secretary.md defines the role intent ("In control of this show") and what the secretary must accomplish for fall 2026. Scope the journey to the fall deliverables only.

TONE: Write steps in second person ("You open the Secretary Dashboard"). Keep Mermaid diagrams to happy-path only — no error branches.
```

- [ ] **Step 2: Monitor ultraplan progress**

In the CLI, run:

```
/tasks
```

Watch for `◆ ultraplan ready` status. Open the review URL shown in the output when it appears.

- [ ] **Step 3: Review the draft in Claude Code web**

In the browser, read each phase section. Use inline comments to flag:

- Steps that don't match how myK9Show actually works today
- Phases that are out of order
- Missing steps that are on the secretary golden path
- Current-state notes that are wrong or missing

- [ ] **Step 4: Apply corrections in this session**

After closing the ultraplan review, apply any corrections to `docs/journeys/secretary.md` directly using Edit. Common corrections to check:

- Phase 2 (Entry Management) should reference `EntryManagementPage` and `WaitlistManagementPage`, not generic "entries list"
- Phase 3 (Day-of) should reference `DayOfOperationsPage`, `RunOrderPage`, and that check-in desk is in myK9Show (not myK9Q)
- Phase 4 (Closeout) should reference `ReportsPage` and `ResultsSubmissionPage`

- [ ] **Step 5: Present draft to user for approval**

Tell the user: "Secretary journey draft is at `docs/journeys/secretary.md`. Please review it — do the 4 phases and steps match how you think about the secretary's workflow? Note anything wrong or missing."

**Wait for explicit approval before proceeding to Task 2.**

- [ ] **Step 6: Commit**

```bash
git add docs/journeys/secretary.md
git commit -m "docs(phase0): add secretary journey map"
```

---

## Task 2: Draft Exhibitor Journey Map

**Files:**

- Create: `docs/journeys/exhibitor.md`

**Reference material for this task:**

- `apps/myk9show/src/pages/BrowseShowsPage.tsx` (Phase 1: discovery)
- `apps/myk9show/src/pages/ShowDetailsPage.tsx` (Phase 1: show detail)
- `apps/myk9show/src/pages/RegistrationWizardPage.tsx` (Phase 2: entry)
- `apps/myk9show/src/pages/CartPage.tsx` (Phase 2: payment)
- `apps/myk9show/src/pages/CheckoutSuccessPage.tsx` (Phase 2: confirmation)
- `apps/myk9show/src/pages/MyEntriesPage/index.tsx` (Phase 3: status + run order)
- `apps/myk9show/src/pages/ShowDayPage.tsx` (Phase 4: show day in myK9Show)
- `apps/myk9q/src/pages/Home/` (Phase 4: myK9Q home)
- `apps/myk9q/src/pages/ClassList/` (Phase 4: run order)
- `apps/myk9q/src/pages/Results/` (Phase 4: results)
- `apps/myk9q/src/pages/Stats/` (Phase 4: stats)
- `docs/roles/exhibitor.md` (role intent and scope)

**Note:** The Access app (mySWT) was secretary-only and is NOT a reference for this journey.

- [ ] **Step 1: Run /ultraplan with the following prompt**

Invoke from the CLI:

```
/ultraplan Draft docs/journeys/exhibitor.md for the myK9 platform.

FORMAT (repeat for each of the 4 phases):
## Phase N: [Name]
[2–4 sentence narrative: what the exhibitor is trying to accomplish; what the app should make feel easy]
### Steps
1. [action] → [screen/page]
2. ...
### Current-state notes
- [Where the app today differs from the intended flow — gaps for Phase 2]
### Mermaid flowchart
[Happy-path flowchart for this phase only]

PHASES:
1. Discovery — browse shows, view show details, decide to enter (myK9Show: BrowseShowsPage, ShowDetailsPage)
2. Entry & Payment — registration wizard, pay via Stripe; mail-in exhibitors send a check and secretary marks it paid (myK9Show: RegistrationWizardPage, CartPage, CheckoutSuccessPage)
3. Pre-Show — see confirmation, check entry status, receive announcements, view run order once published (myK9Show: MyEntriesPage)
4. Show Day — check-in, view running order, get results, view stats (myK9Q: ClassList, Results, Stats; myK9Show: ShowDayPage)

KEY CONTEXT:
- The Access app (mySWT) was a secretary tool only — it has nothing to do with the exhibitor journey. Do not reference it.
- myK9Q was the original exhibitor show-day tool: check-in, run order, results, stats. myK9Show is building the pre-show experience (discovery, entry, payment).
- Mail-in entries are a real case: exhibitor sends a paper entry form and check; they do NOT go through the online wizard. Note this as an alternative path in Phase 2.
- "Silence after payment is the scariest state" (from docs/roles/exhibitor.md) — confirmation must be immediate and visible after checkout.

ROLE CONTEXT: docs/roles/exhibitor.md defines the role intent ("I trust this with my day") and fall 2026 scope.

TONE: Write steps in second person ("You open the show listing"). Keep Mermaid diagrams to happy-path only — no error branches.
```

- [ ] **Step 2: Monitor ultraplan progress**

```
/tasks
```

Wait for `◆ ultraplan ready`, then open the review URL.

- [ ] **Step 3: Review the draft in Claude Code web**

Flag inline:

- Any steps that reference screens that don't exist yet in myK9Show
- Missing mail-in entry alternative path in Phase 2
- Anything that implies myK9Q is required for pre-show activities (it isn't)
- Show-day steps that only reference myK9Show but should also mention myK9Q (and vice versa)

- [ ] **Step 4: Apply corrections in this session**

Apply edits to `docs/journeys/exhibitor.md`. Key checks:

- Phase 1 discovery should be possible without login (browsing is public)
- Phase 2 should note that account creation happens at entry time, not before
- Phase 3 run order view — only available after secretary publishes it; note this dependency
- Phase 4 — both myK9Show and myK9Q are valid for check-in; neither is the only option

- [ ] **Step 5: Present both journeys to user for approval**

Tell the user: "Both journey maps are ready — `docs/journeys/secretary.md` and `docs/journeys/exhibitor.md`. Please review the exhibitor journey particularly. Does the 4-phase flow (Discovery → Entry → Pre-Show → Show Day) match the actual experience you want to deliver? Note anything wrong or missing."

**Wait for explicit approval of BOTH journeys before proceeding to Task 3.**

- [ ] **Step 6: Commit**

```bash
git add docs/journeys/exhibitor.md
git commit -m "docs(phase0): add exhibitor journey map"
```

---

## Task 3: Draft Feature Audit

**Files:**

- Create: `docs/feature-audit-2026.md`

**Prerequisite:** Both journey maps approved by user.

**Reference material for this task:**

- `docs/journeys/secretary.md` (approved — source of truth for critical-path classification)
- `docs/journeys/exhibitor.md` (approved — source of truth for critical-path classification)
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (full page inventory per role)
- `apps/myk9show/src/pages/` (all ~50 page files — use for route and purpose verification)

- [ ] **Step 1: Run /ultraplan with the following prompt**

Invoke from the CLI:

```
/ultraplan Draft docs/feature-audit-2026.md for the myK9 platform.

CLASSIFICATION LABELS:
- critical-path: on the secretary or exhibitor golden path (as defined in docs/journeys/); must work perfectly for fall 2026
- park: real feature, not on the fall golden path; hide from nav, revisit post-launch
- delete/hide: demo page, dev artifact, duplicate, or feature that shouldn't be user-facing yet; remove from router

TABLE FORMAT (one table per role section):
| Page / Feature | Route | Classification | Rationale |

SECTIONS (produce one table per section):
1. Secretary (Manage nav group)
2. Exhibitor (exhibitor-only sidebar)
3. Admin (Admin nav group)
4. Judge / Steward (Judging nav group)
5. Browse / Public (shared browse and discovery pages)
6. Utility / Infrastructure (auth, legal, offline test, sync dashboard, demo/test pages)

CLASSIFICATION RULES:
- If a page/step appears in docs/journeys/secretary.md or docs/journeys/exhibitor.md → critical-path
- If a page is real but not in either journey → park (unless it's auth/legal infrastructure)
- If a page has "Demo", "Test", or "Sync" in the name and is not user-facing → delete/hide
- Judge and steward pages → park for fall (these roles primarily live in myK9Q)
- Admin pages: Dashboard, Users, Roles & Permissions → critical-path; Performance Mode, Load Testing, Sync, Data Lifecycle → park

FULL PAGE INVENTORY (classify every one of these):
From sidebar (Secretary/Manage): Pipeline(/secretary/dashboard), Create Show(/secretary/create-show), Entries(/secretary/entries), Day-of Ops(/secretary/day-of), Check-In(/secretary/check-in), Volunteers(/secretary/volunteers), Tasks(/secretary/tasks), Run Orders(/secretary/run-order), Settings(/secretary/settings), Wait List(/secretary/waitlist), Messages(/secretary/messages), Reports(/secretary/reports), Submit Results(/secretary/results-submission)

From sidebar (Exhibitor-only): Home(/exhibitor/dashboard), Show Day(/exhibitor/show-day), My Dogs(/dogs), My Entries(/exhibitor/entries), Find Shows(/shows), Clubs(/clubs), Calendar(/calendar), Settings(/preferences), Messages(/messages)

From sidebar (Admin): Dashboard(/admin/dashboard), Alerts(/admin/alerts), Performance(/admin/performance), Analytics(/admin/analytics), Data Lifecycle(/admin/data-lifecycle), Performance Mode(/admin/performance-mode), Load Testing(/admin/load-testing), Sync(/admin/sync), Users(/admin/users), Roles & Permissions(/admin/permissions), Permission Audit(/admin/permissions/audit), Templates(/admin/templates), Onboarding(/admin/onboarding)

From sidebar (Judge): Dashboard(/judge/dashboard), My Stats(/judge/stats), Check-In(/judge/check-in)

Additional pages (not in sidebar but in router): Home(/), AlertManagementPage, AnalyticsPage, AuthCallbackPage, BrowseClubsPage, BrowseDogsPage, BrowsePeoplePage, BrowseShowsPage, CalendarPage, CartPage, CheckoutCancelPage, CheckoutSuccessPage, ClassDetailsPage, ClubDetailPage, DogDetailPage, ExhibitorDashboard, ForgotPasswordPage, JudgeScoringPage, LegalPage, MyEntriesPage, OfflineTestPage, PersonDetailPage, PreferencesPage, PricingPage, ProfilePage, RegistrationWizardPage, ResetPasswordPage, ResultEntryDashboard, ScoringDemoPage, SecretaryDashboard (legacy), ShowDayPage, ShowDetailsPage, SignInPage, SignUpPage, SubscriptionPage, SyncDashboardDemoPage, TVDisplay, SecretaryTasksPage, ShowManagementPage, ShowSettingsPage, VolunteerSchedulingPage, WaitlistManagementPage, EntryManagementPage, DayOfOperationsPage, RunOrderPage, ResultsControlPage, ResultsSubmissionPage, ReportsPage

IMPORTANT: Do not invent pages. Classify only from the inventory above.
```

- [ ] **Step 2: Monitor ultraplan progress**

```
/tasks
```

Wait for `◆ ultraplan ready`, then open the review URL.

- [ ] **Step 3: Review the draft in Claude Code web**

Flag inline:

- Any page classified critical-path that isn't in either journey (upgrade to park or delete)
- Demo/test pages that are classified park instead of delete/hide
- Pages that are clearly the same thing twice (e.g., legacy SecretaryDashboard vs new SecretaryDashboard/)
- Missing pages from the inventory

- [ ] **Step 4: Apply corrections in this session**

Apply edits to `docs/feature-audit-2026.md`. Key checks:

- `ScoringDemoPage`, `OfflineTestPage`, `SyncDashboardDemoPage`, `MigrationTest` → delete/hide
- Legacy `SecretaryDashboard` (flat file) vs `SecretaryDashboard/` (directory) — mark one delete/hide
- `TVDisplay` — park (not on either golden path for fall)
- `PricingPage`, `SubscriptionPage` — park unless exhibitor payment requires them
- `SyncDashboardPage`, `SyncMonitoringPage` — park (admin ops, not critical-path)

- [ ] **Step 5: Present audit to user for approval**

Tell the user: "Feature audit draft is at `docs/feature-audit-2026.md`. This is the most consequential document — Phase 1 will hide or remove everything marked park/delete. Please review each section and correct any misclassifications before approving."

**Wait for explicit approval before proceeding to Task 4.**

- [ ] **Step 6: Commit**

```bash
git add docs/feature-audit-2026.md
git commit -m "docs(phase0): add feature audit 2026"
```

---

## Task 4: Draft Navigation / IA Sketch

**Files:**

- Create: `docs/navigation-ia.md`

**Prerequisite:** Feature audit approved by user.

**Reference material for this task:**

- `docs/feature-audit-2026.md` (approved — source of consolidation decisions)
- `docs/journeys/secretary.md` (approved)
- `docs/journeys/exhibitor.md` (approved)
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (current nav)

- [ ] **Step 1: Run /ultraplan with the following prompt**

Invoke from the CLI:

```
/ultraplan Draft docs/navigation-ia.md for the myK9 platform.

SECTIONS TO PRODUCE:

## 1. Role Home Screens
One paragraph per role describing:
- The single screen they land on after login
- What it must show at a glance (based on the approved journey maps)
- What primary nav items they see

Cover: Secretary, Exhibitor, Admin (for fall). Note Judge/Steward as deferred.

## 2. Consolidation Decisions
A table of every "X should be a tab or section of Y" decision derived from the feature audit.

TABLE FORMAT:
| Current page(s) | Disposition | Destination | Notes |

Include decisions for:
- Any pages in docs/feature-audit-2026.md marked park or delete/hide that need a consolidation action (not just hiding)
- Duplicate pages that serve the same purpose (e.g., legacy vs new SecretaryDashboard)
- Detail pages that should become tabs of a parent (e.g., ClassDetailsPage as a tab of ShowDetailsPage)
- Browse pages whose content could be surfaced elsewhere

## 3. New Routes Needed
A bullet list of routes required by the approved journeys that do NOT currently exist in the app. For each:
- Route path
- Purpose
- Which journey phase it serves
- Whether it requires login

CLASSIFICATION RULE: A route is "needed" only if a step in docs/journeys/secretary.md or docs/journeys/exhibitor.md requires it and no current page covers it. Do not invent routes for hypothetical future features.

INPUTS:
- Approved feature audit: docs/feature-audit-2026.md (use park/delete decisions as the source of consolidation decisions)
- Approved journeys: docs/journeys/secretary.md, docs/journeys/exhibitor.md (use for role home screen descriptions and new routes)
- Current nav: apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts (use for existing route inventory)

TONE: Terse and decision-oriented. This is a reference document for Phase 1 execution, not a design essay. Every sentence should resolve a question a developer would ask before making a nav change.
```

- [ ] **Step 2: Monitor ultraplan progress**

```
/tasks
```

Wait for `◆ ultraplan ready`, then open the review URL.

- [ ] **Step 3: Review the draft in Claude Code web**

Flag inline:

- Consolidation decisions that contradict the approved audit
- Role home screen descriptions that don't match the journey Phase 1 entry points
- New routes that already exist (remove them)
- Missing new routes that the journeys require

- [ ] **Step 4: Apply corrections in this session**

Apply edits to `docs/navigation-ia.md`. Key check:

- Secretary home = `/secretary/dashboard` — must show active shows, pending entries, and quick actions at a glance
- Exhibitor home = `/exhibitor/dashboard` — must show upcoming entries and any pending action items
- Admin home = `/admin/dashboard` — minimal: user management + platform health

- [ ] **Step 5: Present nav sketch to user for approval**

Tell the user: "Navigation/IA sketch is at `docs/navigation-ia.md`. This drives Phase 1 — every page-consolidation and hide decision flows from this document. Please confirm the role home screens and consolidation table before we proceed."

**Wait for explicit approval.**

- [ ] **Step 6: Commit**

```bash
git add docs/navigation-ia.md
git commit -m "docs(phase0): add navigation and IA sketch"
```

---

## Task 5: Phase 0 Exit Check

**Files:**

- Modify: `TO-DOS.md` (mark Phase 0 complete)

- [ ] **Step 1: Verify all four deliverables exist and are committed**

```bash
git log --oneline -10
ls docs/journeys/ docs/feature-audit-2026.md docs/navigation-ia.md
```

Expected output:

```
docs/journeys/secretary.md
docs/journeys/exhibitor.md
docs/feature-audit-2026.md
docs/navigation-ia.md
```

- [ ] **Step 2: Confirm exit criteria against the design spec**

Check each criterion from `docs/superpowers/specs/2026-04-11-phase0-documentation-design.md`:

- [ ] `docs/journeys/secretary.md` exists and user has approved it
- [ ] `docs/journeys/exhibitor.md` exists and user has approved it
- [ ] `docs/feature-audit-2026.md` exists and user has approved it
- [ ] `docs/navigation-ia.md` exists and user has approved it
- [ ] All four files committed to git on `main`

- [ ] **Step 3: Mark Phase 0 complete in TO-DOS.md**

In `TO-DOS.md`, change:

```
- [ ] **Phase 0 — Write Down the Truth**
```

to:

```
- [x] **Phase 0 — Write Down the Truth** ✓ completed 2026-04-11
```

- [ ] **Step 4: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark Phase 0 complete"
```

- [ ] **Step 5: Announce Phase 0 complete**

Tell the user: "Phase 0 is complete. All four remaining deliverables are committed (journey maps, feature audit, nav sketch). Ready to begin Phase 1 — Quiet the Noise — when you are."
