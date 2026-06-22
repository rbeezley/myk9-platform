# IA Review: Secretary Entry Management

> **Status:** Active

**Date:** 2026-06-21
**Auditor:** Claude
**Sources:** Route audit + component/codebase read (cross-codebase orphan/duplication scan). Live-browser walk recommended but deferred — see Step 2.
**Scope:** The Secretary Entry Management page — `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx` and `apps/myk9show/src/components/entries/management/**`. This is the "cognitive load 6/8 FAIL" track from the impeccable-page critique. Theming was already fixed separately (PR #893); this review owns the **structural** defect only.

---

## TL;DR

The page scored 6/8 on cognitive load not because it has too many controls, but because **its controls lie about what they do**. Four families of control are rendered with near-identical chrome (chips and dropdowns) yet fall into four *categorically different* behavior classes:

| Control | Looks like | Actually does |
|---------|-----------|---------------|
| `TrialClassFilters` (trial → class) | A filter pair | A **router**: derives `viewMode` → empty = list, trial = roster, trial+class = **redirect off-page to `/scoring/...`** |
| `attentionFilter` chips `move-ups` / `pulled` | Status filters | **Swap the entire content pane** for full 500-line management sub-apps |
| `EntryWorkModeSwitch` (Review / Day-of) | A mode toggle | A **macro** that silently rewrites `attention` + `payment` + `view` |
| `attentionFilter` chips `pending`/`accepted`/… + payment + search | Filters | Actually filter the list in place (the only honest controls) |

The user cannot predict what a control will do from its appearance. That is the defect. The fix is to make each control's *class* legible (or to stop overloading one affordance with four jobs) — **not** to mechanically collapse state, which the original critique correctly warned against.

This review also confirms three concrete, lower-risk findings: an **orphan filter component** (`EntryFiltersCard`), two **overloaded action menus** (9 and 7 items mixing lifecycle/money/destructive), and **two embedded sub-surfaces with no other home** (move-ups, pulled).

---

## Step 1: Route Audit

**Surface scope:** Secretary Entry Management and its embedded sub-surfaces.

| Route | Purpose | Target user | Parent in IA | Component |
|-------|---------|-------------|--------------|-----------|
| `/shows/:showId/entry-management` | Manage all entries for one show: triage, status, payment, comms | Secretary / Club admin | Show workbench | `pages/secretary/EntryManagementPage.tsx` |
| ↳ `?tab=entries` (default) | Entries surface (the whole problem space below) | Secretary | (this page) | `EntryManagementPage` → `RegistrationView` / `TrialRosterView` / `ScoringModeWrapper` |
| ↳ `?tab=waitlist` | Per-class waitlist management | Secretary | (this page) | `pages/secretary/WaitlistManagementPage/` |
| `/scoring/classes/:classId/entries` | Paper scoresheet entry list (dedicated) | Secretary | (top) | `PaperScoresheetPage` |
| `/scoring/classes/:classId/entries/:entryId` | Individual scoresheet (dedicated) | Secretary | scoring | `ScoresheetPage` |
| `/at-show/:showId/...` | Ringside live scoring (dedicated, owns scoring) | Judge / steward | at-show | `AtShow*Page` |

**The four "axes" of the Entries surface (the cognitive-load core):**

| Axis | Type | Where defined | Values | Independent? |
|------|------|---------------|--------|--------------|
| `activePageTab` | Real tab | `EntryManagementPage.tsx:46` | `entries` \| `waitlist` | Yes — legitimate top-level split |
| `viewMode` | **Derived** | `useEntryManagementFilters.ts:161-165` | `registration` \| `roster` \| `scoring` | **No** — computed from trial/class presence |
| `workMode` | **Preset macro** | `EntryWorkModeSwitch` / presets `entryManagementFilters.ts:28-46` | `review` \| `day-of` | **No** — writes `attention`+`payment`+`view` |
| `entryViewMode` | Display toggle | `useEntryManagementFilters.ts:145` | `table` \| `cards` | Yes — honest display switch |
| `attentionFilter` | Mixed | `entryManagementFilters.ts:5-13` | `all`/`pending`/`accepted`/`waitlist`/`issues` **+ `move-ups`/`pulled`** | Partly — last two swap the surface |

> **Reframe vs. the original critique:** the critique called these "four orthogonal mode axes." Only **two** are genuinely independent (`pageTab`, `entryViewMode`). `viewMode` is *derived* and `workMode` is a *macro* — which is worse for the user, not better, because the page changes shape from controls the user didn't knowingly touch.

**Orphan routes:** `/secretary/waitlist` exists but redirects to `/secretary/dashboard` (dead). `WaitlistManagementPage` is reachable only as the embedded `?tab=waitlist`.

**Duplicate-purpose routes:** Scoring has dedicated homes (`/scoring/...`, `/at-show/...`). The page's `scoring` viewMode is a **redirect bridge** to `/scoring/classes/:classId/entries` (`ScoringModeWrapper.tsx`), not a reimplementation — but it is reached through what looks like a filter.

**Routes whose URL doesn't reflect their data hierarchy:** `move-ups` and `pulled` are full management surfaces encoded as `?attention=` query values on a page titled "Entry Management," with no route of their own.

---

## Step 2: Task Flow Walk

**Method:** Code-path trace (route → component → conditional render). A live playwright/qa-feature walk is **recommended** to *feel* the silent mode transitions but was deferred — the code paths are unambiguous and the findings don't hinge on runtime behavior. (Note from memory: Preview MCP is pinned to the main checkout in a worktree session, so a live walk would need the playwright-test MCP against a seeded show + secretary login.)

**Tasks traced:** (1) review pending entries, (2) take a payment, (3) approve a move-up request, (4) process a pull/refund, (5) see a trial's roster, (6) score a class.

### Task: Review pending entries → take a payment
| Step | Action | Result | Friction | Severity |
|------|--------|--------|----------|----------|
| 1 | Land on page | Defaults to `review` workMode = pending + table | none | None |
| 2 | Open a row's status menu | 9-item menu: 6 lifecycle + Request/Refund payment + Remove | Money and destructive actions buried in a lifecycle menu | High |
| 3 | Switch to card view, open payment menu | 7 money actions in one dropdown | Over-threshold; no grouping of "mark paid" vs "refund" | Med |
**Verdict:** Completable with friction.

### Task: Approve a move-up request
| Step | Action | Result | Friction | Severity |
|------|--------|--------|----------|----------|
| 1 | Find move-ups | It's an `attention` chip, visually identical to "Pending" | User must *know* a filter chip hides a whole sub-app | High |
| 2 | Select it | Entire content pane replaced by `MoveUpRequestsTab` (approve/deny/target-class UI) | The bulk bar, table, and stats silently vanish | High |
**Context switches:** 0 routes, but a full surface swap with no nav signal. **Verdict:** Completable, but unpredictable.

### Task: See a trial's roster → score a class
| Step | Action | Result | Friction | Severity |
|------|--------|--------|----------|----------|
| 1 | Pick a trial in "Trial / Class Filters" | Page silently switches `registration` → `roster` (`TrialRosterView`) | A "filter" reshaped the page | High |
| 2 | Pick a class | `viewMode` becomes `scoring` → **redirects off the page** to `/scoring/classes/:classId/entries` | A second "filter" ejected the user to a different route | Critical |
**Context switches:** 1 (silent redirect). **Verdict:** Completable, but the trigger is indistinguishable from filtering.

**Dead ends:** none fatal. **Pattern:** every High/Critical friction point is the same root cause — *a control whose visual class does not match its behavioral class.*

---

## Step 3: Mental Model Check

**Method used:** Domain-expert grouping (kennel-club show secretary workflow) + product-owner intent encoded in `CLAUDE.md` consolidation phase.

**Capabilities (what a secretary can DO on this surface):**
- Triage entries by status (pending/accepted/issues)
- Take/record/refund payments
- Assign armbands; comp/uncomp; remove
- Communicate (decision emails, resend confirmations)
- Manage waitlist (per-class)
- Approve/deny move-up requests
- Process pulls / no-shows (incl. refunds)
- See a trial roster
- Score a class

**User mental grouping (5 buckets a secretary would draw):**
- **A — Entry decisions:** status triage, accept/reject, missing-info, comp, remove
- **B — Money:** record payment, request payment, refund
- **C — Exceptions:** move-ups, pulls, waitlist
- **D — Day-of logistics:** armbands, check-in, roster
- **E — Scoring:** (mentally a *different room* — owned by ringside/at-show)

**Actual route grouping:** A, B, C, D, **and a redirect into E** are all crammed onto one URL, switched by overloaded chips/dropdowns.

**Mismatches:**
| Capability | User expects in | Actually lives in | Severity |
|------------|-----------------|-------------------|----------|
| Score a class | E — a different room (at-show owns it) | A "filter" combo that redirects off-page | Critical |
| Move-ups / pulls | C — clearly-labeled exceptions area | Filter chips identical to status filters | High |
| Take payment | B — a money affordance | Buried inside a 9-item lifecycle menu | High |
| Trial roster | D — day-of logistics | Derived from the trial "filter" | Med |

---

## Step 4: Duplication & Orphan Scan

**Task duplication:**
| Task | Paths available | Recommended consolidation |
|------|-----------------|---------------------------|
| Score a class | Entry Mgmt (redirect) + `/scoring/...` + `/at-show/...` | Keep dedicated routes as the home; the page should *link*, not silently route through a filter |
| Manage waitlist | `?tab=waitlist` (live) + `/secretary/waitlist` (dead redirect) | Single embedded tab is fine; the dead route is harmless but document it |

**Orphan components / routes:**
| Item | Status | Recommendation |
|------|--------|----------------|
| `EntryFiltersCard.tsx` (+ 2 test files, barrel `index.ts:10`) | **Orphan** — imported only by its own tests and the barrel; the live page uses `ListControls` + `ENTRY_MANAGEMENT_FILTERS` | **Delete** component + 2 tests + barrel line. **Migrate** its `// INTENT:` note (no second status control — `EntryFiltersCard.tsx:32-44`) into `entryManagementFilters.ts` next to `ENTRY_MANAGEMENT_FILTERS`, so the live system inherits the guarantee. |
| `/secretary/waitlist` route | Dead (redirects to dashboard) | Leave; note in plan. Not worth a change. |
| `MoveUpRequestsTab`, `PullManagementTab` | **No standalone home** — only reachable as filter chips here | Product decision (Step 6 / Decision 2): de-disguise vs. promote to routes. |

**Modal/inline duplications:** none material. The status/payment dropdowns each open their own dialogs (armband, comp, refund, withdrawal) — consistent and fine.

**Immovable INTENT locks (do not touch):**
- `EntryListCard.tsx:263-268` — deliberate absence of "Waitlisted" (waitlisting is per-class via `waitlist_entries`).
- `EnrollmentCard.tsx:329-336` — deliberate absence of "Waitlist All" (same reason).
- `EntryFiltersCard.tsx:32-44` — the no-second-status-control guard (must survive the file's deletion by migrating into the live filter constants).

---

## Step 5: Severity Scoring

Axes 1–5 each; sum 3–15. Fix-invasiveness is inverse (5 = architecture-level).

| # | Finding | Step | Freq | Friction | Fix-inv | Sum | Priority |
|---|---------|------|------|----------|---------|-----|----------|
| F1 | Trial/class "filters" silently derive viewMode and redirect off-page to scoring | 2,3 | 3 | 5 | 4 | **12** | **Critical** |
| F2 | `move-ups`/`pulled` chips swap the whole surface for sub-apps; look like status filters | 2,3 | 4 | 4 | 3 | **11** | **Critical** |
| F3 | `EntryListCard` status menu = 9 items mixing lifecycle + money + destructive | 2 | 5 | 3 | 2 | **10** | **High** |
| F4 | `workMode` macro silently rewrites attention+payment+view (two ways to set same state) | 1,3 | 3 | 3 | 3 | 9 | **High** |
| F5 | `EnrollmentCard` payment menu = 7 money actions, no grouping | 2 | 4 | 3 | 2 | 9 | **High** |
| F6 | Orphan `EntryFiltersCard` (dead code; INTENT note stranded) | 4 | 1 | 2 | 1 | 4 | **Low** (but cheap → do it) |
| F7 | `/secretary/waitlist` dead redirect | 4 | 1 | 1 | 1 | 3 | **Low** (document only) |

**Top to fix next phase (Critical + High):** F1, F2, F3, F4, F5.
**Documented, not fixed:** F6 (do it opportunistically — one deletion), F7 (leave).

---

## Step 6: Phased Remediation Plan

**Plan doc:** [`docs/plan-ia-secretary-entry-management.md`](plan-ia-secretary-entry-management.md) (written once the product decisions below are resolved).

**Three findings are genuine product/IA decisions, not execution choices.** Per `CLAUDE.md` ("state the duplication question explicitly"; "one concern, one page") these must be answered before the plan is finalized:

1. **F1 — the trial→class→scoring drilldown.** Should this page *stop* routing into scoring (trial/class become honest in-place list filters; "score a class" becomes an explicit deep-link to the dedicated `/scoring` or `/at-show` surface)? Or keep the drilldown but make the mode transition *visible and intentional* (explicit "View roster" / "Score this class" affordances instead of derivation)?
2. **F2 — move-ups & pulled.** They have no home but this page. De-disguise them in place (lift out of the status-filter chip row into a clearly-labeled "Exceptions" area that signals "different surface"), or promote them to dedicated routes and deep-link? (Consolidation phase leans *de-disguise in place* — promoting adds surface area.)
3. **F3/F5 — overloaded menus.** Split money out of the lifecycle menu into its own affordance, or keep one menu but group with section headers + separators? (F4/F6 are execution, not decisions.)

**Provisional phase summary (pending decisions):**
| Phase | Scope | Entry trigger | Exit criterion | Est. PRs |
|-------|-------|---------------|----------------|----------|
| A | F6 orphan deletion + migrate INTENT note (zero-risk, unblocks confidence) | Now | `EntryFiltersCard` gone, INTENT note in `entryManagementFilters.ts`, tests green | 1 |
| B | F3/F5 menu de-overloading (per Decision 3) | Decision 3 answered | Each menu ≤ grouped sections; money/destructive visually separated | 1 |
| C | F2 de-disguise move-ups/pulled (per Decision 2) | Decision 2 answered | Move-ups/pulled no longer rendered as status-filter chips | 1–2 |
| D | F1 + F4 make mode transitions legible (per Decision 1) | Decision 1 answered; C merged | Trial/class no longer silently redirect; workMode macro is visibly a preset | 1–2 |

Phases are ordered by risk and dependency: A is free, B/C are independent, D is the architectural core and goes last so the smaller wins land first.

---

## Summary

**Overall IA health:** Needs Work (one Critical structural defect, replicated across four control families).
**Top 3 findings:**
1. F1 — Trial/class "filters" silently derive viewMode and redirect off-page — **Critical**
2. F2 — Move-ups/pulled chips swap the whole surface but look like status filters — **Critical**
3. F3 — 9-item status menu mixes lifecycle + money + destructive — **High**

**Root cause (one sentence):** controls of four different *behavioral* classes are rendered with one visual class, so the surface is unpredictable — the textbook cognitive-load IA failure.

**Recommended next phase:** Phase A (free orphan cleanup) immediately; resolve the three product decisions before Phases B–D.
**Total estimated remediation effort:** 4–6 PRs across 4 phases.
