# Plan — Workbench Collapse to Setup + Show Desk

**Date:** 2026-05-22
**Status:** Draft. Companion to [`plan-show-map-unified-tab.md`](plan-show-map-unified-tab.md) (Option A). PO chooses one.
**Related prior plans:** [`plan-ia-show-map.md`](plan-ia-show-map.md), [`ia-review-show-map.md`](ia-review-show-map.md), [`plan-show-desk-sequencing.md`](plan-show-desk-sequencing.md)

## What this plan is and isn't

This is a **fresh-eyes alternative** to [`plan-show-map-unified-tab.md`](plan-show-map-unified-tab.md) (Option A). It deliberately questions the constraints Option A preserved.

**Option A asked:** "Where does Show Map fit inside the existing 3-phase workbench?"
**Option B asks:** "What is the simplest workbench we'd ship if we started over today, while respecting the architectural commitments (single shared priority function, show-centric mental model, view-only public map)?"

The answer Option B converges on: **two tabs (Setup + Show Desk) with the Show Map as the operational hub of Show Desk, supported by an adaptive header and a collapsible tools drawer.**

## The PO's stated concern

> "I am concerned we will overload them with too many features and choices."

Option A added a 4th tab — net surface area went up, not down. Option B's commitment is to actively **delete** surface area, not just rearrange it. If a section can't justify its space, it doesn't survive the collapse.

## Goals

1. **One operational hub.** Setup is its own thing; everything else lives in Show Desk.
2. **Phase isn't a user choice.** The data tells the secretary what state the show is in; the secretary doesn't have to remember which tab corresponds to which mental mode.
3. **Aggressive simplification.** Delete the About-this-phase banners. Delete the "What do I do if…" help cards. Collapse 7 desk-tool cards into one drawer. Reduce the Phase checklist's prominence — its useful content becomes contextual signals in the adaptive header.
4. **Preserve every operational capability.** Nothing the secretary can do today disappears. Surfaces consolidate, capabilities stay.
5. **No regressions to existing architectural commitments** (single shared priority function, single shared attention function, show-centric mental model, view-only public map).

## What gets deleted, not reorganized

This is the part Option A didn't do. To honor "fewer features and choices," Phase B must delete:

| Item | Why delete | Replacement |
|---|---|---|
| Today tab | Subsumed by Show Desk | Show Desk tab |
| Wrap-up tab | Subsumed by Show Desk | Show Desk tab |
| "About Today" banner | Static educational copy; secretary reads it once, never again | Adaptive header tells the story by behavior |
| "About Wrap-up" banner | Same | Same |
| "What do I do if..." help card on Today | Help that's always visible is help that's never read | Optional `?` icon in the header opens this content on demand |
| "What do I do if..." help card on Wrap-up | Same | Same |
| Dedicated `PhaseChecklist` card (Today) | Item 1 below explains the replacement | Items become conditional signals in adaptive header |
| Dedicated `PhaseChecklist` card (Wrap-up) | Same | Same |
| 7 separate desk-tool cards (Today) | Visual sprawl; most are situational | Single collapsible **Tools** drawer |

This is the **non-negotiable simplification commitment** of Option B. Without these deletions, the plan is just Option A by another name.

## Architectural commitments this plan must respect

Same as Option A; carried forward from [`plan-show-desk-sequencing.md`](plan-show-desk-sequencing.md):

1. **Single shared priority function** — `getRankedActions(scope, state)` remains the only ranker. Phase B1 strengthens it (no phase-fork).
2. **Single shared attention function** — `attention.ts` remains the only source of "needs attention." `getAttentionNodeIds` simplifies (phase parameter retired post-migration).
3. **Show-centric mental model** — single-show management lives under `/secretary/shows/:showId`. Show Desk tab lives inside this route.
4. **View-only public map** — `ShowDetailsPage` continues to pass `canManageShow={false}`. Unchanged.

## Scoring & data flow

Scoring deserves explicit framing because it spans both apps and could be misunderstood when reviewing Show Map in isolation.

**Where scoring happens:**

| Where | Who | When | Route |
|---|---|---|---|
| **myK9Q (offline-first ringside PWA)** | Judge / steward | Live, at the ring | (separate app) |
| **myK9Show paper scoring** | Secretary | After-the-fact entry from paper, OR corrections to ringside-entered scores | `/scoring/classes/:classId/entries?mode=split` (per [`scoringRoutes.ts`](../apps/myk9show/src/pages/scoring/scoringRoutes.ts)) |

**Data layer:** Both apps write to the same `entries` table in the unified Supabase project. Scores entered ringside in myK9Q surface in myK9Show's Show Map within seconds (Running Now %, class progress, attention counts) via the replicated-tables layer. The secretary doesn't need to refresh; the tree updates as scoring happens elsewhere.

**Show Map's role in scoring:**

- **Class-level entry point:** `Score Class` is a class-row action (priority 70, only when class status is `active`). It navigates to `/scoring/classes/:id/entries?mode=split` — the paper-scoring screen — which walks entries in run order. This is the secretary's path to enter or correct scores.
- **Entry-level deep-link (Option B addition):** an `Edit score` action on the entry row deep-links to that specific entry's row in the scoring screen. For corrections, exhibitor protest resolution, or fixing a single entry without re-walking the whole class.
- **Progress visibility:** Show Map reflects scoring progress in three surfaces — the Running Now strip ("60% scored"), the class row's progress label ("12/20 scored · 60%"), and the unified Up Next queue (which surfaces wrap-up actions once scoring completes).

**What Show Map does NOT do:**

- Score entry data entry itself. Show Map navigates *into* the scoring screen; it doesn't embed a scoring UI inline. Scoring is a focused, step-through workflow that deserves its own screen, not a row-action dialog.
- Live ringside score capture. That's myK9Q's domain (offline-first, optimized for the judge's tablet at the ring). myK9Show consumes those scores; it doesn't compete with myK9Q for them.

**Plan implications:**

- Phase B2's unified Show Map preserves the existing `Score Class` class-row action. No behavioral change to the scoring entry point.
- A new `Edit score` entry-row action is a recommended addition for Option B — small, additive, deep-links into an existing screen.
- The scoring screen itself (`/scoring/classes/:id/entries`) is **out of scope** for this plan. If that screen needs its own simplification pass, it's a separate effort.

## Surface boundary with detail pages

myK9Show has separate detail pages that overlap with Show Map's scope:

- `/secretary/shows/:id/trials/:trialId` — Trial details
- `/secretary/shows/:id/trials/:trialId/classes/:classId` (Class Details page)
- `/secretary/shows/:id/entries` — Entries Management

**Show Map does NOT replace these pages.** The intended division is:

| Action class | Lives in |
|---|---|
| Operational / lifecycle (scratch, move-up, check-in, mark started/complete, score, scratch, message, edit score) | **Show Map** |
| Configuration / edit (judge assignment, run order metadata, entity metadata edits, bulk armband corrections) | **Detail pages** |
| Cross-show / bulk (find all entries by handler across shows, registry exports) | **Entries Management** |

**Precedent:** PR #293 already enforced this boundary once — removed `Mark In Progress` / `Mark Completed` from Class Details because Show Map owned them. This plan continues that pattern.

**Phase B4.5 (new audit checkpoint):** before Phase B5 ships, grep both the Class Details page and the legacy [`ShowDashboard.tsx`](../apps/myk9show/src/components/shows/ShowDashboard.tsx) for any operational action that duplicates Show Map. Two specific suspicions worth checking:

1. **Class Details may still leak operational actions** beyond what PR #293 removed.
2. **`ShowDashboard.tsx` and `ShowWorkbenchPage.tsx` coexist** — verify whether the Dashboard is legacy (deprecated, redirects) or an active second home that should be reconciled.

Output of the audit: either confirmed-clean (proceed to B5) or a small remediation PR before B5.

## Relationship to Secretary Dashboard

The [Secretary Dashboard](../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/) at `/secretary/dashboard` is **not collapsed by this plan.** It serves a different purpose: cross-show concerns. The two surfaces have a clean division of labor.

| Surface | Scope | Purpose |
|---|---|---|
| **Dashboard** | Multi-show | "Which show should I open? What needs attention *across* all my shows? Where are my personal tasks?" |
| **Workbench** | Single-show | "I'm in show X — let me run it." Setup + Show Desk. |

### What the dashboard uniquely owns

- **Multi-show list** with phase status per show (the secretary's home when they haven't picked a show yet).
- **Cross-show attention surface** — `attention.ts` rolled up across every show the secretary manages.
- **Personal / cross-show tasks** from the `secretary_tasks` table. (Per-show notes are accessible from Show Desk's Tools sheet; truly personal or multi-show tasks live on the dashboard.)
- **Messages tab** — inter-show / cross-stakeholder communication.

### What overlaps with the workbench (and becomes redundant *inside* a show)

- Per-show attention items — once the secretary is in Show X's workbench, the adaptive header surfaces them in-context; the dashboard's surface is a redundant entry point but isn't wrong.
- Per-show tasks — duplicated entry path (tools sheet vs dashboard), but the data is the same.

### Phase B1 cross-app audit dependency

The Phase B1 change to [`attention.ts`](../apps/myk9show/src/features/show-map/attention.ts) (removing `check_in_conflict` from the attention classifier) **also affects the dashboard's cross-show attention surface**, which reads from the same module. Phase B1 implementation must:

1. Grep `attention.ts` consumers across `apps/myk9show/src` — including the dashboard.
2. Verify the dashboard's attention render gracefully handles the removal (e.g., filters out the reason cleanly, doesn't error on undefined).
3. If the dashboard renders attention with reason labels, update or remove the "Check-in conflict" label there too.

This is small but **must be intentional, not silent** — a regression in the dashboard's attention surface is exactly the kind of side-effect that easy to ship and hard to catch.

### Out of scope for this plan

A full **dashboard refocus** — narrowing the dashboard to only the things genuinely cross-show, dropping anything that duplicates workbench surfaces — is **a separate plan**, written after Option B ships and you can observe post-collapse usage patterns. Trying to do both in this plan would balloon scope and risk.

**Candidate follow-up plan:** [`plan-dashboard-refocus.md`](plan-dashboard-refocus.md) (stub created 2026-05-22 — pre-work pending: observe post-Option-B usage patterns for one show cycle). Worth opening once Option B is stable in production.

## Role-surface map

The phrase "show day" is generic — every role at a trial has a day-of-show experience. To avoid conversational ambiguity ("which show day are we talking about?"), this section documents the three distinct role-surfaces and which app/route owns each. The secretary's new tab is named **Show Desk** specifically to disambiguate from the others.

| Role | Surface | App | Route | Purpose |
|---|---|---|---|---|
| **Secretary** | **Show Desk** (new — this plan) | myK9Show | `/secretary/shows/:id?phase=show-desk` | Operational hub for running a show — the secretary's desk metaphor (Show Map tree + Tools sheet + adaptive header + Closeout) |
| **Exhibitor** | Show Day page (existing) | myK9Show | `/exhibitor/show-day` ([`ShowDayPage.tsx`](../apps/myk9show/src/pages/ShowDayPage.tsx)) | Personal day-of-show view — check-in status, run order position, ring progress, live results for *my* entries |
| **Gate steward / judge** | myK9Q ringside views | myK9Q (separate app) | n/a (separate app routes) | Offline-first ringside operations — class lists, scoring, check-in cycling, run-order reorder at the ring |

### Why "Show Desk" not "Show Day" for the secretary tab

`Show Desk` was chosen over `Show Day`, `Live Ops`, `Workbench`, and other candidates because:

1. **Maps to physical reality.** At every trial, the secretary literally sits at a desk where exhibitors come for paperwork, late entries, ribbons, and questions. The metaphor is concrete.
2. **Promotes existing vocabulary.** The current Today tab already groups its operational tools under [`TodayDeskToolsSection`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx). The codebase already speaks "desk" — Show Desk just promotes internal vocabulary to user-facing.
3. **No collisions.** Avoids the exhibitor's existing Show Day page, the dog-show "judge's bench" vocabulary, and the code-level `ShowWorkbenchPage` collision a "Workbench" tab would have created.
4. **Secretary-coded without being corporate.** Identity-matching without leaning on stiff verbs like "Operate" or "Manage."

### Out of scope

This plan does not modify the exhibitor's Show Day page or any myK9Q ringside surface. Each role keeps its own primary day-of-show view, optimized for its audience. The shared concept ("the day of the show, viewed through my role's lens") is preserved across all three; only the secretary's surface is being collapsed and renamed.

## Non-goals

- Renaming "Show Map" — intentional per [`Show Map Naming Intent`](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_show_map_naming_intent.md) memory.
- URL-state sync inside the tree (deferred per IA-4).
- Touching the public `/shows/:id?tab=map` route (IA-1 view-only stands).
- Modifying `apps/myk9q`. (No Show Map equivalent there; cross-app scope is myK9Show-only.)
- Collapsing Setup into Show Desk. Setup is structurally different work (creating the tree, not operating on it) and remains its own tab.

## Implementation conventions

Every PR must satisfy these baseline conventions:

- **Package manager:** `pnpm` only. Never `npm`. Tests via `pnpm test` (from app dir); `pnpm typecheck` / `pnpm lint` from monorepo root.
- **React render helper:** all tests in `apps/myk9show` use the custom `render` from [`src/test/utils/testUtils.tsx`](../apps/myk9show/src/test/utils/testUtils.tsx).
- **File-size budget:** keep new and modified files under 500 lines per CLAUDE.md. The collapse should *reduce* `ShowMapTab.tsx` (extracts the Guidance card and Up Next into the adaptive header); new components should each stay well under the limit.
- **No comments unless WHY is non-obvious.** Preserve existing `// INTENT:` comments.
- **No emojis** in code or UI.
- **Pre-launch:** no real users; skip backwards-compat shims, redirect bridges, deprecation banners.

## URL param decision

`?phase=show-desk` becomes the new operational value. Reuses the existing `?phase=` parameter for the same reasons given in Option A — existing infrastructure speaks `?phase=`, dual params would create reconciliation overhead.

**Mapping during migration:**
- `?phase=setup` — unchanged.
- `?phase=show-desk` — new, the canonical operational URL.
- `?phase=today` and `?phase=wrap-up` — during the migration window (Phases B2–B5), these still work and render the old tabs. After Phase B5, both redirect to `?phase=show-desk`. Pre-launch means no bookmarks to break.
- `?phase=garbage` — falls back to the default tab (no crash). New unit test required.

## Default tab on `/secretary/shows/:id`

Today's behavior: `SecretaryIndexRedirect` lands users on the bare URL and `activePhase` resolves to Today.

**Decision for Option B:** flip the default to Show Desk in Phase B2 (the same PR that introduces the tab). Rationale: Setup is for pre-show structural work; the moment a show exists, Show Desk is the canonical landing. Setup remains explicitly reachable via the tab.

## Tab order and mobile layout

**Tab order:** `[Setup, Show Desk]`. Two tabs; left-to-right is structural→operational. Future Setup→Show Desk workflows can use this as a left-to-right reading model.

**Mobile:** at 375px, two tabs comfortably fit side-by-side; no overflow risk. Worth verifying in Phase B2 testing.

## Consistent UX patterns

These are cross-cutting interaction patterns the implementing agent must apply consistently across the Show Desk tab. Documented here once so the same rules apply to every surface.

### Pattern 1 — Counts are filter shortcuts

Every visible count is a one-click filter that scopes the Show Map to those items. The mental model is uniform: "if you see a number, you can click it to focus on what it represents." Surfaces this rule applies to:

- **Pending-signal chips** in the adaptive header (e.g., "5 entries waiting check-in") → filter the whole tree to those entries.
- **Need Attention summary tile** in the Show Map header → filter to attention items.
- **Row badges** on trial/class rows (e.g., "3 need attention" on a class row) → filter that node's subtree to attention items only.

Apply hover state + cursor-pointer + a proper Tooltip primitive (shadcn/ui `Tooltip`, not the native `title` attribute — `title` has known UX problems: delayed on hover, hidden on touch, inconsistent screen-reader support). Other summary tiles (Trials, Classes, Entries) stay informational for now; promote to clickable later if data shows secretaries reach for them.

**[ADDED — Pattern 1 implementation note]** The prototype at [`docs/option-b-prototype.html`](option-b-prototype.html) uses `title` attributes as a low-fi mockup affordance. Production must use shadcn `Tooltip` with explicit `delayDuration={300}`, keyboard focus support, and `aria-describedby` wiring. Verify in Phase B2 tests.

### Pattern 2 — CTA labels vary by action kind

The Up Next queue and row primary actions use action-kind-driven button labels, matching the existing `resolveShowMapActionExecution` split in production:

| Action kind | Button label | Behavior |
|---|---|---|
| `navigate` | "Open" / context-specific verb | Routes to a detail page (entry detail, scoring screen, results control). Print actions are also `navigate` — they route to a printable report URL that opens in a new tab. |
| `mutation` | "Start" / "Mark" / context verb | Fires the named mutation inline (`'mark-checked-in'`, `'mark-class-started'`, `'mark-class-complete'`); no navigation. Toast + undo. |
| `dialog` | "Move up" / "Scratch" / "Message" | Opens a confirmation/input dialog (`'move-up-entry'`, `'scratch-entry'`, `'message-handler'`). |
| `disabled` | (no button rendered) | Includes `disabledReason` for tooltip-only context. |

These are the actual kinds defined in [`showMapActionExecution.ts`](../apps/myk9show/src/features/show-map/showMapActionExecution.ts). Earlier drafts of this section called these `execute` and `print` — that's wrong; production uses `mutation` and treats print actions as a `navigate` to a printable-report URL.

The button label communicates whether the secretary stays in place or context-switches. This makes the Up Next queue feel less like a generic "list of things to click" and more like a meaningful operational checklist.

### Pattern 3 — Class primary action reflects class lifecycle

The class row's most-prominent inline button changes with class status, surfacing the next operational step without forcing the secretary to open the row menu:

| Class status | Primary button | Style |
|---|---|---|
| `neutral` / not started | **Mark Started** | Default button |
| `active` / in progress | **Score Class · {progress}%** | Accent / primary color (signals "this is the thing to click right now") |
| `complete` | **Open Class** | Default button (navigates to Class Details) |

The accent treatment on the in-progress state is deliberate — Score Class is the highest-frequency operation during a live class, and visual prominence saves the secretary the lookup.

### Pattern 4 — Slide-out panels for tools, popovers for menus

- **Tools** opens as a right-anchored slide-out sheet (see Phase B3).
- **Row menus** (3-dot, Run Order) open as small popovers anchored to their trigger button.
- **Dialogs** (move-up, scratch, message handler) stay as modals — they require confirmation/input, not browsing.

Popovers close on outside click and Escape. The slide-out sheet closes on outside-overlay click, X button, and Escape.

## The adaptive header — the design risk

The adaptive header is the single biggest new concept in Option B. It replaces:

- The two About-this-phase banners
- The two Phase checklists
- The Guidance card and Up Next queue currently nested inside Show Map
- The "What do I do if…" help cards (moved to a popover)

It must surface the right signals at the right time, or Option B fails. Sketch:

```
┌─ Show Desk ──────────────────────────────────────────────┐
│ STATUS PILL: Show in progress · May 22                  │
│ 3 of 5 classes complete · 2 need attention              │
│                                                         │
│ NEXT BEST ACTION                                        │
│ Review entry #101 (Alice Martin) — waiting for review  │
│ [Start]  [×]                                            │
│                                                         │
│ UP NEXT (3)  Review entry · Mark Class Started · …      │
│                                                         │
│ RUNNING NOW  Ring 1: Container Novice · 60% scored      │
└─────────────────────────────────────────────────────────┘
```

The header's content is **entirely derived from existing data + the unified action set from Phase B1.** No new sources of truth. The status pill ("Setup / Show in progress / Wrap-up / Closed") is computed from class statuses, not a user-chosen mode.

### What about the Phase checklist's content?

The Today and Wrap-up checklists today are:

- **Today (5):** Show Map is built · Entries are loaded · Run order has class times · Ring work has started · Attention queue reviewed
- **Wrap-up (5):** Classes are complete · Scores are accounted for · Results are reviewed · Reports are printed/exported · Submission packet is ready

Each item is either:
1. A **state question already derivable from data** (e.g., "Classes are complete" is true iff every class status is `complete`).
2. A **manual confirmation** the secretary checks off (e.g., "Attention queue reviewed").

The collapse strategy:

- **State-derived items** surface as conditional signals in the adaptive header — but only when they're *not yet true*. "5 entries waiting for check-in" appears at the top of the header; the moment that count hits zero, the signal disappears. The secretary no longer has to scan a checklist of mostly-green items.
- **Manual-confirmation items** become small chip-sized acknowledgments in a "Reviewed" section of the header, OR are deleted if the secretary doesn't actually need to track them deliberately.

For items where the team isn't sure if it's #1 or #2, default to #1 (state-derived) and observe. Easy to add manual chips back later.

### Closeout content (was Wrap-up tab)

The current Wrap-up tab has three operational sections beyond Show Map:
- Show Day Reconciliation
- Incident Closeout Summary
- 3 destination cards (Results Control / Reports / Submit Results)

In Option B, these become a **conditional Closeout section** that renders at the bottom of Show Desk **only when at least one class is in a wrap-up-eligible state** (e.g., `CLASS_READY_FOR_WRAP_UP`, `NEEDS_JUDGE_SIGNATURE`, etc.). When no class is in that state — i.e., mid-day before scoring starts — the Closeout section doesn't render at all, removing visual noise.

The 3 destination cards remain as quick links, scoped to the Closeout section.

## How to use this doc

- Phases are sized to one PR each.
- Each phase has an entry trigger, exit criterion, implementation steps, and testing section.
- Phases are sequenced by load-bearing dependency.
- Every phase includes testing per CLAUDE.md.

---

## Phase B0 — Adaptive header component scaffold

**Entry trigger:** PO sign-off on this plan, after comparing against Option A.
**Estimated PRs:** 1.
**Risk:** Low. Pure additive component creation; not yet wired into any visible surface.

### Scope

Create the new `ShowDeskAdaptiveHeader` component as a standalone unit, then unit-test it in isolation before mounting in Phase B2.

### Implementation

1. New file: `apps/myk9show/src/features/show-map/ShowDeskAdaptiveHeader.tsx`.
2. Component props:
   ```ts
   interface ShowDeskAdaptiveHeaderProps {
     showStatus: 'setup' | 'show-in-progress' | 'wrap-up' | 'closed';
     statusSummary: string; // e.g., "3 of 5 classes complete · 2 need attention"
     guidanceAction: ShowMapAction | undefined;
     upNextActions: ShowMapAction[]; // top 3
     runningNow: ShowMapRunningNowItem[];
     onStartAction: (action: ShowMapAction) => void;
     onDismissGuidance: () => void;
     onSelectRunning: (nodeId: string) => void;
     // pendingChecklistSignals: derived signals to surface, e.g., { id: 'entries-waiting-checkin', label: '5 entries waiting for check-in' }
     pendingSignals: ShowDeskPendingSignal[];
   }
   ```
3. New helper: `apps/myk9show/src/features/show-map/showDeskStatus.ts` — computes `showStatus` and `statusSummary`. **[VERIFIED via review]** the helper signature must take more than the tree alone, because the resolved date-aware rule (from Q1) depends on show start/end dates that aren't on `ShowMapTree.root`:
   ```ts
   export function computeShowDeskStatus(input: {
     show: Show;               // start_date, end_date, timezone
     trials: Trial[];          // per-trial dates if multi-day
     tree: ShowMapTree;        // class statuses for the activity check
     now?: Date;               // injectable for test determinism; defaults to new Date()
   }): { status: ShowDeskShowStatus; summary: string }
   ```
   The `now` injection is non-negotiable for testing — verifying boundary cases (show-day morning before any class started, day-2 of a multi-day show) requires a mockable clock. Default to `new Date()` in production calls.
4. New helper: `apps/myk9show/src/features/show-map/showDeskPendingSignals.ts` — computes the array of pending state-derived signals from `ShowMapTree` (e.g., entries waiting for check-in, classes not started, classes ready for judge signature, etc.).
5. Component renders the four tiers (status, guidance, up next, running now) plus the pending-signals chips. Uses shadcn/ui primitives. Keep file under 300 lines.
6. **Do not** mount the component anywhere yet. Phase B2 wires it.

### Exit criterion

- Component renders correctly in isolation against seeded test data.
- `showDeskStatus` and `showDeskPendingSignals` have unit-tested derivation logic.
- File-size budget respected (each new file under 500 lines; target under 300).

### Testing

- **Unit:** `apps/myk9show/src/features/show-map/__tests__/ShowDeskAdaptiveHeader.test.tsx`:
  - Render with each `showStatus` value; assert the status pill reflects it.
  - Render with no `guidanceAction`; assert the guidance card section is absent.
  - Render with three `upNextActions`; assert all three render with Open buttons.
  - Render with empty `pendingSignals`; assert no signals chips render.
  - Render with `pendingSignals` containing 3 items; assert each chip renders with its label.
- **Unit:** `apps/myk9show/src/features/show-map/__tests__/showDeskStatus.test.ts`:
  - Tree with all classes `neutral` → `'setup'` (or `'show-in-progress'` if the show date is today; verify intended logic with PO).
  - Tree with at least one class `active` → `'show-in-progress'`.
  - Tree with all classes `complete` but not all signed → `'wrap-up'`.
  - Tree with all classes signed and submitted → `'closed'`.
- **Unit:** `apps/myk9show/src/features/show-map/__tests__/showDeskPendingSignals.test.ts`:
  - Tree with 5 entries `not-checked-in` → signal `{ id: 'entries-waiting-checkin', count: 5, label: ... }`.
  - Tree with all entries checked in → signal absent.
  - Coverage for each derived signal type listed in the Phase B0 design.

---

## Phase B1 — Action-system unification

**Entry trigger:** Phase B0 merged.
**Estimated PRs:** 1.
**Risk:** Medium. Same refactor as Option A's Phase 1.

### Scope

Identical to [Option A Phase 1](plan-show-map-unified-tab.md#phase-1--action-system-unification-non-breaking-foundation): refactor `actionsForNode` so wrap-up and live-ops actions both surface when applicable, with a `phase` parameter preserved for backwards-compat during the migration window.

### Implementation, exit criterion, and testing

Refer to [Option A Phase 1](plan-show-map-unified-tab.md#phase-1--action-system-unification-non-breaking-foundation) for the detailed steps. This phase is identical between the two options; whichever option is chosen, this PR is the same work.

**Notable inclusion from Option A's verify-plan pass:** the dedup invariant check, the three-way `phase` value (`'today' | 'wrap-up' | undefined`), and the corresponding `getAttentionNodeIds` fork.

### [ADDED] Cross-app action ownership

This session surfaced that `resolve-check-in-conflict` (priority 100 in [`showMapActions.ts`](../apps/myk9show/src/features/show-map/showMapActions.ts)) is a gate-steward signal incorrectly classified as a secretary-facing attention reason. The exhibitor sets `check_in_status = 'conflict'` from myK9Q to notify the gate they may be late from another ring — the secretary has no action to take. Remove from Show Map:

1. **`actionsForNode` in [`showMapActions.ts`](../apps/myk9show/src/features/show-map/showMapActions.ts):** delete the `resolve-check-in-conflict` action emission entirely (currently at lines 240-256). Remove from the `showMapActionIds` array (line 31).
2. **`attention.ts`:** remove `'check_in_conflict'` from the `AttentionReason` union; remove the `if (entry.check_in_status === 'conflict')` branch in `getEntryAttention`. The function then only classifies `pending_review`.
3. **Update the comment at attention.ts:12-15** that explains the priority order — it'll no longer have two reasons to compare.
4. **[VERIFIED via review]** Update [`showMapStatus.ts`](../apps/myk9show/src/features/show-map/showMapStatus.ts) — TWO call sites currently classify conflict as `kind: 'attention'`:
   - **Line 116** in `classifyEntryRunStatus`: `if (checkInStatus === 'conflict') return { value: checkInStatus, label: 'Needs attention', kind: 'attention' };` — REMOVE this branch. The conflict still renders visibly (via existing labels) but no longer carries `kind: 'attention'` in the secretary's tree, so it stops triggering attention rollups / pulsing chips.
   - **Line 162** in a related classifier: `if (status === 'conflict') return { value: status, label: 'Conflict', kind: 'attention' };` — change `kind: 'attention'` to `kind: 'neutral'` (or remove). The "Conflict" label stays for informational visibility; only the attention classification drops.
5. **Audit related callers** — grep for `'check_in_conflict'` and `check_in_status === 'conflict'` across `apps/myk9show/src` (NOT `apps/myk9q/src` — myK9Q legitimately consumes the status). Update any UI that classified entries as "needs secretary attention" based on conflict.
6. **myK9Q is unchanged.** The status value itself stays in the schema; the gate steward's view continues to render it with priority. This is a secretary-perspective fix, not a data-model change.

#### Cross-app audit checkpoint for the other 5 entry-row actions

Before Phase B2 ships, sanity-check each remaining entry-row action against the question: *"Does the secretary actually do this, or is the primary actor in myK9Q?"*

| Action | Status | Confirmed? |
|---|---|---|
| Review entry | Keep — secretary's job (`submitted` state) | ✓ confirmed this session |
| Mark checked in | Keep — secretary backup path (primary actor is gate steward) | ✓ confirmed this session |
| Move up | Keep — both apps may initiate | ✓ confirmed this session |
| Scratch / no-show | Keep — secretary is canonical record-keeper | ✓ confirmed this session |
| Message handler | Keep — secretary's tool | ✓ confirmed this session |

If a future audit finds another miscategorized action, follow the same pattern: delete from Show Map's action list; preserve in myK9Q.

---

## Phase B2 split — B2a + B2b

**Why the split (from review):** the original Phase B2 bundled four distinct user-visible behaviors — introducing the tab, flipping default routing, refactoring `ShowMapTab` to compact mode, adding three entry-row actions, and changing class-row primary action behavior. That's too loaded for one PR. Split into two smaller PRs:

- **B2a:** Tab introduction + adaptive header wiring + compact mode + default-routing flip. Pure structural change, no row-action semantics.
- **B2b:** Row-action enhancements (entry-menu additions + class-row primary action lifecycle). Touches `showMapActions.ts` action emissions and `ShowMapStructureTable.tsx` rendering.

B2b depends on B2a (you need the new tab to surface the row enhancements). Both depend on B1.

## Phase B2a — Introduce Show Desk tab (parallel access)

**Entry trigger:** Phases B0 + B1 merged.
**Estimated PRs:** 1.
**Risk:** Medium. New top-level tab; user-visible. Old tabs preserved during migration.

### Scope

Add a `Show Desk` tab to the workbench, wired up with the adaptive header from Phase B0 and the unified Show Map from Phase B1. Today and Wrap-up tabs remain untouched for parallel access during the migration window.

### Implementation

1. In [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx), extend `PHASE_TABS`:
   ```tsx
   const PHASE_TABS: PrimaryTabDef[] = [
     { id: 'setup', label: 'Setup', icon: ListChecks },
     { id: 'today', label: 'Today', icon: ClipboardCheck },    // marked for removal in B5
     { id: 'wrap-up', label: 'Wrap-up', icon: Medal },         // marked for removal in B5
     { id: 'show-desk', label: 'Show Desk', icon: ListTree },    // new
   ];
   ```
   (During the migration window, all four exist. Note: 4 tabs at mobile width — verify visually before merging. If overflow, the Show Desk tab is the priority; the migration-only Today/Wrap-up may need a shorter label or scroll.)
2. Update phase-value parsing to accept `'show-desk'` AND fall back to default on unknown values.
3. Update `SecretaryShowPhaseRedirect`'s phase parameter type.
4. New `<PrimaryTabsContent value="show-desk">` block contains:
   ```
   <ShowDeskAdaptiveHeader {...derivedProps} />
   <ShowMapTab show={...} canManageShow ... />   {/* no actionPhase prop — unified mode */}
   <ShowDeskCloseoutSection {...} />              {/* implemented in Phase B4 */}
   <ShowDeskToolsSheet {...} />                  {/* implemented in Phase B3 */}
   ```
   For Phase B2, `<ShowDeskCloseoutSection>` and `<ShowDeskToolsSheet>` are placeholder stubs that render `null` — Phases B3 and B4 fill them in.
5. **Refactor `ShowMapTab`** to optionally hide its internal Guidance card, Up Next queue, and Running Now strip when a new prop `compact={true}` is passed (the Show Desk tab passes `compact`, since those surfaces are now hoisted into the adaptive header). The Today and Wrap-up tabs do NOT pass `compact`, so their internal versions render as today (no UX regression during migration).

6. Flip the default tab: if `?phase=` is omitted, route to `?phase=show-desk`. Today and Wrap-up remain reachable via the old phase values.
7. **Auth gate confirmation:** the new tab inherits `ProtectedRoute` from the route position. Phase B2 testing must explicitly verify this hasn't drifted.

### Exit criterion

- Workbench renders 4 tabs: `[Setup, Today, Wrap-up, Show Desk]`.
- Show Desk tab renders the adaptive header above the Show Map tree. Today and Wrap-up tabs unchanged.
- Direct navigation to `?phase=show-desk` lands on the new tab.
- Bare `/secretary/shows/:id` (no `?phase=`) lands on Show Desk.
- Non-secretary users hitting `?phase=show-desk` are bounced by `ProtectedRoute`.

### Testing

- **Unit:** Extend [`ShowWorkbenchPage.test.tsx`](../apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx):
  - Render with `?phase=show-desk`; assert Show Desk tab is active, adaptive header renders, Show Map tree renders, internal Guidance card on Show Map does NOT render.
  - Render with `?phase=today`; assert Today tab still renders embedded Show Map with internal Guidance card (regression guard).
  - Render with `?phase=garbage`; assert falls back to default (Show Desk).
  - Render bare `/secretary/shows/:id`; assert Show Desk is the default landing tab.
  - Render as non-secretary user with `?phase=show-desk`; assert `ProtectedRoute` bounces.
- **Unit:** New `ShowMapTab.compact.test.tsx` — render with `compact={true}`; assert internal Guidance, Up Next, Running Now do not render but tree + toolbar do.
- **Route:** Extend `secretaryShowPhaseRedirects.test.tsx` for all four phase values.
- **Accessibility:** Tab order traverses Setup → Today → Wrap-up → Show Desk. `aria-selected` correct.
- **Mobile layout:** Snapshot at 375px, 768px, 1280px. If 4-tab overflow at 375px, document remediation.
- **Visual regression seed:** Screenshot the new Show Desk tab in three states — empty show, mid-show (running classes), end-of-day (wrap-up state). Attach to PR.

---

## Phase B2b — Row-action enhancements

**Entry trigger:** Phase B2a merged.
**Estimated PRs:** 1.
**Risk:** Medium. Modifies `showMapActions.ts` emissions and `ShowMapStructureTable.tsx` rendering — visible behavior change on a heavily-used surface.

### Scope

Add three new entry-row actions and wire the class-row primary action lifecycle so the next operational step is always visible inline rather than buried in the row menu.

### Implementation

1. **Entry-row 3-dot menu additions** — three new entry-level actions beyond the existing six production actions in [`showMapActions.ts`](../apps/myk9show/src/features/show-map/showMapActions.ts):

   | Action | When it appears | Priority |
   |---|---|---|
   | **Open entry details** | Always | 28 (between scratch and message) |
   | **Edit score** | Class has been scored OR currently scoring; entry has a score row | 40 |
   | **View handler's other entries** | Entry has a `handlerId` AND that handler has 2+ entries in the show | 22 |

   `Edit score` is the deep-link into the scoring screen at `/scoring/classes/:classId/entries?mode=split` for that specific entry — see the [Scoring & data flow](#scoring--data-flow) section.

   **Edit score safety:** when an entry has no score row yet (class not yet started, entry not yet run), `Edit score` should render disabled with a tooltip *"No score recorded yet — start the class first."* — same disabled-with-reason pattern the prototype uses for Scratch on already-scored entries. Add a unit test asserting this conditional rendering.

2. **Class-row primary action lifecycle** — implement the dynamic primary button per [Pattern 3](#pattern-3--class-primary-action-reflects-class-lifecycle). The class row's most-prominent inline button changes based on `node.status`:

   - `neutral` → "Mark Started" button (default style)
   - `active` → "Score Class · {progress}%" button (accent / primary style)
   - `complete` → "Open Class" button (default style)

   **[VERIFIED via review — wiring gap]** The current inline primary button in [`ShowMapStructureTable.tsx:416`](../apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx) only renders when `primaryAction?.href` exists. That works for `score-class` (navigate to scoring screen) and `open-class` (navigate to class details) — both are `kind: 'navigate'` actions with href. **But `mark-class-started` and `mark-class-complete` are `kind: 'mutation'` actions** (per [`showMapActionExecution.ts`](../apps/myk9show/src/features/show-map/showMapActionExecution.ts)) — they have NO href and currently fall through the existing render guard.

   Two implementation options:

   | Option | Description | Tradeoff |
   |---|---|---|
   | **(a) Render mutation actions inline too** | Drop the `href` guard. For mutation actions, wire `onClick={() => executeAction(primaryAction, resolveShowMapActionExecution(primaryAction))}`. | Cleanest UX — every lifecycle step has a primary button. Requires threading the executor down to the table row. |
   | **(b) Hoist only navigate actions inline; keep mutations in menu** | Keep the existing `href` guard; rely on the row-action menu for Mark Started / Mark Complete. | No new wiring; minimal change. But "Mark Started" is the next step for every untouched class — leaving it in the menu defeats Pattern 3's intent. |

   **Recommendation: (a).** Pattern 3's purpose is "next step always visible." That doesn't hold if half the lifecycle steps need a menu open. The wiring cost is small — pass the executor through the existing component prop chain.

   Add a regression test: render `ShowMapStructureTable` with a `neutral` class node; assert "Mark Started" inline button is present and clicking it fires the mutation.

   **[FUTURE-PROOFING NOTE — auto-derivation candidate]** A candidate follow-up plan ([`plan-class-status-auto-derivation.md`](plan-class-status-auto-derivation.md)) proposes auto-deriving class status from scoring events (first score = `active`; all expected scored = `complete`). If that plan ships, the `mark-class-started` and `mark-class-complete` mutation actions will become **rare/conditional** rather than always-visible. Implementation guidance for B2b:

   - **Don't over-invest in always-visible primary buttons for these two actions** — they may end up rendered only when auto-derivation hasn't fired but the secretary needs manual override (weather cancellation, empty class closeout, etc.).
   - **Do** still wire them inline per option (a) above so they work when needed. The wiring isn't wasted; the *frequency of render* is what's expected to drop.
   - The `score-class` and `open-class` actions are unaffected — they remain the primary inline buttons for `active` and `complete` states regardless of how status transitions occur.

### Exit criterion

- The three new entry-row actions render with correct conditional visibility.
- The class-row primary button renders for all three lifecycle states (neutral / active / complete), with mutation actions correctly wired to `executeAction`.
- `Edit score` shows the disabled-with-reason state when no score row exists.

### Testing

- **Unit:** Extend [`showMapActions.test.ts`](../apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts) for the three new action emissions and their conditional triggers.
- **Unit:** New `ShowMapStructureTable.classPrimary.test.tsx` — render a class node in each lifecycle state; assert the right inline button renders; mutation buttons invoke the executor on click.
- **Integration:** Wire-through test confirming a `Mark Started` button click flips the class to `active` (mocked mutation).
- **Visual regression:** Screenshot a class row in each lifecycle state.

---

## Phase B3 — Tools slide-out sheet

**Entry trigger:** Phase B2a merged. (B3 depends on the tab existing, not on the row-action enhancements in B2b — B2b and B3 can ship in either order.)
**Estimated PRs:** 1.
**Risk:** Low. Pure UI consolidation; no new functionality.

### Scope

Wrap the 7 desk-tool cards (currently scattered across the Today tab) into a single right-anchored slide-out sheet inside the Show Desk tab. Closed by default; opens on click from a "Tools" button in the Show Desk header.

### Why slide-out, not inline drawer

An inline drawer (the original Phase B3 sketch) had two problems: opening it pushed the Closeout section down (layout shift), and it didn't let the secretary keep the tools open while browsing the tree. A right-anchored sheet stays open over the tree without disturbing layout. shadcn/ui's `Sheet` primitive is built for this.

### Implementation

1. New file: `apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx`.
2. Component renders TWO things:
   - **Trigger button:** "Tools" with a count badge (`7`, or a number reflecting active-state tools — e.g., open incidents). Placed in the Show Desk header row (right side, balancing the page).
   - **Sheet content:** uses shadcn/ui `Sheet` (or the equivalent primitive) anchored to the right. Width ~420px on desktop, full-width on mobile.
3. Sheet contains the 7 existing desk tools from the Today tab:
   - Late entry
   - **Hospitality** (renamed from "Judge hospitality" — covers volunteers, judges, stewards, ring crew, not just judges)
   - Quick broadcast
   - Class broadcast
   - Incident log
   - Schedule delay script
   - MyK9Q access codes

   No card rewrites — sheet is purely a container for existing components.

**[Scope discipline — deferred via review]** Volunteers and Tasks/Notes were earlier proposed as tile additions to the sheet. **Deferred to Phase B6.5** (post-collapse). Reasoning: adding tiles during a simplification pass dilutes the simplification message. Ship the 7-card collapse cleanly first, then add the 2 missing entry points once the collapse is stable and the team has lived with it for a show cycle. The hospitality rename stays (it's a fix to existing copy, not an addition).
4. **Default state:** closed.
5. **Persistence:** optionally remember last-pinned state per show in localStorage scoped to `showDeskToolsSheet:${showId}:open`. Decision deferred — start without persistence; add if PO finds it useful.
6. **Close interactions:** outside-overlay click, X button in the sheet header, Escape key.
7. **Badge state:** the count badge should reflect actionable state (e.g., open incident count), not just the number of available tools. If no tool has actionable state, show "7" (the number of available tools) in a muted style. This makes the badge a meaningful "you have unread/open items" signal, not just decoration.
8. The Today and Wrap-up tabs keep the 7 cards visible inline as today (no regression during migration window). Removed entirely in Phase B5 alongside the tab removal.

### Exit criterion

- Show Desk tab renders a Tools button in the header, default closed.
- Clicking the button slides a sheet in from the right; all 7 cards rendered inside.
- Sheet closes on outside-click, X button, and Escape.
- Today tab unchanged (still shows the 7 cards inline) during migration.
- Layout does not shift when the sheet opens (it overlays, not pushes).

### Testing

- **Unit:** New `ShowDeskToolsSheet.test.tsx`:
  - Renders trigger button with count badge (7).
  - Sheet hidden by default (`aria-hidden=true` or equivalent).
  - Click trigger → sheet opens, all 7 cards rendered, `aria-hidden=false`.
  - Escape closes the sheet.
  - Outside-click on the overlay closes the sheet.
- **Integration:** Confirm each of the 7 cards works inside the sheet (open the incident log, send a broadcast, etc.).
- **Accessibility:** Focus moves into the sheet on open and returns to the trigger on close. `aria-modal=true` on the sheet content. Screen reader announces "Tools panel, dialog."
- **Mobile:** At 375px, the sheet takes full width and has a visible close button at the top.
- **Visual regression:** Screenshot sheet closed (just the trigger button) and open (overlay + sheet visible).

### [ADDED] Rollback playbook

If a critical issue surfaces post-merge (e.g., one of the 7 tools breaks inside the sheet):

1. `git revert <phase-b3-commit-sha>`. The previous PR (Phase B2) had the Show Desk tab without a Tools sheet; reverting B3 leaves Show Desk functional minus the sheet trigger.
2. The 7 desk-tool cards remain accessible via the Today tab (B5 hasn't run yet), so secretaries always have a path to each tool.
3. Trigger criteria for revert: any of the 7 tools inaccessible from the sheet during a staging walk; focus management breaks (focus doesn't return to trigger on close); accessibility audit failures.

### [ADDED] Staging verification gate

Phase B3 must not merge until:

1. Deployed to staging.
2. A live walk opens the sheet, clicks into each of the 7 tools, and confirms each renders correctly inside the sheet.
3. Sheet closes via overlay click, X button, and Escape key.
4. Sheet opens on mobile (375px) and the close affordance is reachable.
5. PR description includes screenshots of closed/open states.

---

## Phase B4 — Closeout section (conditional)

**Entry trigger:** Phase B3 merged.
**Estimated PRs:** 1.
**Risk:** Low. Conditional render block; data-driven appearance.

### Scope

Build the Closeout section that appears at the bottom of Show Desk **only when at least one class is in a wrap-up-eligible state.**

### Implementation

1. New file: `apps/myk9show/src/features/show-map/ShowDeskCloseoutSection.tsx`.
2. Component reads the tree and renders only if `hasAnyWrapUpEligibleNode(tree)` returns true. Otherwise renders `null`.
3. When rendered, contains:
   - Show Day Reconciliation card (existing component)
   - Incident Closeout Summary card (existing component)
   - Three destination cards: Results Control, Reports, Submit Results
4. Each piece is a render of an existing component already used in the current Wrap-up tab — no functional rewrite.
5. New helper `hasAnyWrapUpEligibleNode(tree: ShowMapTree): boolean` in `showDeskStatus.ts` (added in Phase B0).

### Exit criterion

- Show Desk tab renders the Closeout section at the bottom when applicable.
- Closeout section disappears entirely when no class is in a wrap-up-eligible state.
- Wrap-up tab unchanged (still shows the same content as today).

### Testing

- **Unit:** New `ShowDeskCloseoutSection.test.tsx`:
  - Renders nothing when no class is wrap-up-eligible.
  - Renders all three destination cards when a class is in `CLASS_READY_FOR_WRAP_UP` state.
  - Renders correctly with mixed states (some classes wrap-up-eligible, others not).
- **Unit:** `hasAnyWrapUpEligibleNode` helper coverage in `showDeskStatus.test.ts`.

### [ADDED] Staging verification gate

Phase B4 must not merge until:

1. Deployed to staging.
2. With a seeded show where no class is wrap-up-eligible: Closeout section does NOT render in Show Desk.
3. After marking one class `CLASS_READY_FOR_WRAP_UP`: Closeout section renders with reconciliation, incident closeout, and the three destination cards.
4. Each destination button routes correctly.
5. PR description includes screenshots of both states.

---

## Phase B4.5 — Detail-page audit checkpoint

**Entry trigger:** Phase B4 merged.
**Estimated PRs:** 0–1 (0 if audit comes back clean; 1 if remediation needed).
**Risk:** Low. Pure verification; remediation if any.

### Scope

Confirm the [Surface boundary](#surface-boundary-with-detail-pages) is intact before Phase B5 removes the embedded Show Map mounts. Specifically check that operational actions don't leak from Show Map back into the detail pages or the legacy ShowDashboard.

### Implementation

1. Grep [`apps/myk9show/src/pages/ClassDetailsPage/`](../apps/myk9show/src/pages/ClassDetailsPage/) for any lifecycle/operational actions (start, complete, scratch, move-up, score). PR #293 already removed `Mark In Progress` / `Mark Completed`; verify nothing crept back in.
2. Audit [`apps/myk9show/src/components/shows/ShowDashboard.tsx`](../apps/myk9show/src/components/shows/ShowDashboard.tsx) — is this a legacy page (now redirects), a duplicate home, or still actively used? If duplicate, decide: deprecate, redirect to workbench, or reconcile.
3. Grep `apps/myk9show/src/pages/secretary/ShowManagementPage.tsx` (saw references in the earlier audit) — same question.
4. Document findings as a short PR description or a `docs/b4-5-audit-findings.md` snapshot.
5. If leaks found: file a remediation PR before Phase B5.

### Exit criterion

- Audit findings documented.
- Either: confirmed clean (proceed to B5) OR remediation PR merged.

### Testing

- N/A for the audit itself. Remediation PR (if any) gets its own tests.

---

## Phase B5 — Remove Today and Wrap-up tabs

**Entry trigger:** Phases B2 + B3 + B4 merged. PO has used Show Desk during at least one show cycle (real or seeded) and signed off on parity.
**Estimated PRs:** 1.
**Risk:** High. User-visible removal of two heavily-used tabs. Mitigated by parallel-access window in B2–B4.

### Scope

Delete the Today and Wrap-up tabs. Make Show Desk the sole operational tab alongside Setup.

### Implementation

1. In [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx):
   - Remove `{ id: 'today', ... }` and `{ id: 'wrap-up', ... }` from `PHASE_TABS`.
   - Remove `<PrimaryTabsContent value="today">` block (~lines 405-470) and `<PrimaryTabsContent value="wrap-up">` block (~lines 471-528) entirely.
2. Add URL redirect: any visit to `?phase=today` or `?phase=wrap-up` resolves to `?phase=show-desk`. Pre-launch — no bookmark concern, but the redirect is good hygiene for any in-app links not yet updated.
3. Remove the `actionPhase="today"` and `actionPhase="wrap-up"` props from the deleted mount sites.
4. **Enumerate every checklist item, sidebar link, and dashboard chip** currently pointing at `?phase=today` or `?phase=wrap-up`. Update each to `?phase=show-desk`. Specifically known consumers:
   - [`unifiedSidebarConfig.ts:134-137`](../apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts)
   - [`ShowPhaseCard.tsx:20`](../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/ShowPhaseCard.tsx)
   - [`showMapRoutes.ts:28`](../apps/myk9show/src/features/show-map/showMapRoutes.ts) — `getShowMapTrialScheduleHref` builds `?phase=setup`; unrelated, no change.
   - Phase checklist items (now defunct anyway since checklists are deleted in B5).
5. **Test fixture audit:** `grep -rn "phase=today\|phase=wrap-up" apps/myk9show/src` and update each hit. Expected hits in `ShowWorkbenchPage.test.tsx`, `secretaryShowPhaseRedirects.test.tsx`, `phase2ShowDayRewalk.spec.ts`, and possibly others.
6. Remove the `compact` prop branch from `ShowMapTab` if no consumer still uses the non-compact mode. Verify by grep before removing.
7. Resolve open question 2 from this plan: the Today and Wrap-up phase checklists are **deleted** entirely. Their content is fully absorbed by the adaptive header's pending signals (state-derived) — no separate checklist UI survives. If PO wants to retain any specific checklist items as manual confirmations, surface them as small chips in the adaptive header instead.

### Exit criterion

- Workbench renders 2 tabs: `[Setup, Show Desk]`.
- Visiting `?phase=today` or `?phase=wrap-up` redirects to `?phase=show-desk`.
- No code references `?phase=today` or `?phase=wrap-up` except in the redirect handler itself.
- Today and Wrap-up checklists deleted.

### Testing

- **Unit:** `ShowWorkbenchPage.test.tsx`:
  - Assert PHASE_TABS has exactly 2 entries.
  - Assert visiting `?phase=today` redirects to `?phase=show-desk` and renders Show Desk content.
  - Assert visiting `?phase=wrap-up` redirects similarly.
  - Assert no Today/Wrap-up tab is rendered.
- **Unit:** Update or delete tests for the deleted `<PrimaryTabsContent value="today">` and `<PrimaryTabsContent value="wrap-up">` blocks.
- **Route:** `secretaryShowPhaseRedirects.test.tsx` — only `setup` and `show-desk` remain as primary; legacy phase values redirect.
- **E2E:** Update `phase2ShowDayRewalk.spec.ts` and any other spec that navigated via the deleted tabs.
- **Visual regression:** Compare workbench at 1280px before/after Phase B5; document the per-tab line reduction.
- **Accessibility:** Re-verify tab order (Setup → Show Desk) and `aria-selected` wiring.

### Rollback playbook

If a critical issue surfaces post-merge:

1. `git revert <phase-b5-commit-sha>`; PR title: `Revert: restore Today and Wrap-up tabs`. Vercel auto-redeploys staging.
2. Phases B2–B4 remain live; Show Desk tab continues to function alongside the restored Today and Wrap-up tabs.
3. Users get parallel access again until the issue is fixed.
4. Document the rollback trigger criteria in the Phase B5 PR description: e.g., "Revert if any secretary cannot complete check-in / scratch / move-up / judge-signature / submit-results from the Show Desk tab during a real-show walk."

### Staging verification gate

Phase B5 must not merge until:

1. Deployed to staging.
2. A live walk of every critical secretary flow completes successfully from the Show Desk tab: check-in an entry, scratch an entry, move-up an entry, mark a class started, mark a class complete, collect a judge signature (or simulate), submit final results.
3. The Tools drawer opens and each of the 7 cards is interactable.
4. The Closeout section conditionally renders correctly across show states (mid-day no closeout, end-of-day closeout visible).
5. PR description links to the staging URL and includes screenshots of the walk.

---

## Phase B6 — Cleanup and documentation

**Entry trigger:** Phase B5 merged and observed in production / staging for at least one full show cycle.
**Estimated PRs:** 1 (small).
**Risk:** Low.

### Scope

Final cleanup: deprecate the `phase` parameter on `actionsForNode` if no consumer remains, update docs, retire the legacy phase redirects if any in-app link still points at them.

### Implementation

1. `grep -rn "phase=today\|phase=wrap-up" apps/myk9show/src` should return zero hits beyond the redirect handler. If any remain, fix them.
2. If no consumer passes `phase: 'today' | 'wrap-up'` to `actionsForNode`, drop the parameter entirely. The dedup invariant check from Phase B1 remains as a safety net.
3. Update `ia-review-show-map.md` and `plan-ia-show-map.md` with an addendum describing the workbench collapse.
4. Update [`Show Map Naming Intent`](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_show_map_naming_intent.md) if its phrasing references the deprecated phase tabs.
5. Mark this plan Done.

### Testing

- Regression: full Show Map + ShowWorkbenchPage test suites; E2E `phase2ShowDayRewalk`.
- Confirm `grep -rn "phase=today\|phase=wrap-up"` is clean.

---

## Phase B6.5 — Tools sheet additions (deferred from B3)

**Entry trigger:** Phase B6 merged + observed in production for at least one show cycle.
**Estimated PRs:** 1.
**Risk:** Low. Two new tiles in the existing Tools sheet — purely additive.

### Scope

Add the two tiles that were carved out of B3 to keep the collapse pass clean:

1. **Volunteers** — links to `/secretary/volunteers` (existing route: [`secretaryRoutes.tsx:245`](../apps/myk9show/src/routes/secretaryRoutes.tsx)). The full scheduling UI stays on its own page; the tile is just a Show Desk entry point.
2. **Tasks / Notes** — quick add-note form + recent notes list embedded in the sheet, plus "View all tasks" link to the existing [`SecretaryDashboardPage`](../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/) task UI (`secretary_tasks` table per migration 133). Lets the secretary jot per-show notes without navigating away.

After this phase, the Tools sheet has 9 tiles total. Update the badge count and tests to reflect the new total.

### Why deferred to B6.5 rather than bundled into B3

Adding tiles during a simplification pass dilutes the simplification message. The Phase B3 collapse should ship cleanly — "we took 7 sprawling cards and put them behind a button." That story is compromised if the same PR also adds two new tools to the sheet. After the collapse is stable, the additions read as "we're filling in gaps" instead of "we're adding while simplifying."

### Testing

- Mirror Phase B3's test pattern, with the count updated to 9 and the new tiles verified for click-through (Volunteers route, Tasks form submission).

---

## Phase B7 — Run-order editing in Show Map (post-launch enhancement)

**Entry trigger:** Phases B0–B6 merged and observed in production for at least one show cycle.
**Estimated PRs:** 1–2 (one for auto-sort presets, one for drag-and-drop reorder).
**Risk:** Medium. Touches scoring-adjacent data (run order); requires careful handling of mid-class reorders.
**Scope note:** secretary-only. Ringside reorder (gate steward) lives in myK9Q on a separate track.

### Scope

Move run-order editing from the Class Details page to Show Map as class-row actions. Both the auto-sort presets and the manual drag-and-drop reorder mode.

### Implementation

1. **Class-row "Run order" menu** on every class row in the Show Map tree:
   - **Armband ↑** — sort entries ascending by armband. One-click; toast with undo.
   - **Armband ↓** — descending.
   - **Random** — shuffle. Toast with undo (especially important — can't reproduce a random result).
   - **Reorder manually…** — enters reorder mode for that class.
2. **Reorder mode** for manual drag-and-drop:
   - Class auto-expands.
   - Drag-grip icon appears at the left of each entry row.
   - Small banner: "Reordering Container Novice — drag entries to set order. [Done]"
   - Other tree interactions (right-click menu, navigation) suppressed inside reorder mode.
   - Persist on Done, or auto-persist on each drop with debounce. (Decision: prefer auto-persist for resilience against tab-close mid-edit.)
   - Escape or Done exits the mode.
3. **Library:** `@dnd-kit/core` — modern, accessible, supports keyboard reorder via Alt+↑/↓.
4. **Constraint:** only reorder the not-yet-run portion of the run order. Already-scored entries are pinned in their position (immovable). Currently-scoring entry (if any) is also pinned.
5. **Schema check:** confirm `entries.run_order` column exists and accepts bulk updates. If not, migration first.
6. **Real-time sync via replicated tables:** the secretary's Show Map must reflect run-order changes made elsewhere (e.g., from myK9Q ringside) within seconds. The existing replication layer in `@myk9/replication` should handle this; verify before shipping.
7. **Class Details cleanup:** if Class Details has its own run-order UI today, remove it in the same PR (or a follow-up) to honor the [Surface boundary](#surface-boundary-with-detail-pages) commitment. Don't ship two homes for the same action.

### Exit criterion

- Run-order menu visible on every class row in Show Map.
- Auto-sort presets fire mutations with toast + undo.
- Manual reorder mode works on desktop (drag-and-drop) and via keyboard (Alt+↑/↓ on focused row).
- Already-scored entries are visually pinned and not draggable.
- Class Details no longer has duplicate run-order editing.
- Real-time sync verified: edit run order from a second browser tab, original tab reflects within 3s.

### Testing

- **Unit:** New tests for the auto-sort actions in `apps/myk9show/src/features/show-map/__tests__/`:
  - Armband ↑ produces correctly ordered run_order values.
  - Random shuffle produces a permutation (not a deterministic sort).
  - Undo restores the prior order.
- **Unit:** Reorder mode state machine tests — enter, drag, persist, exit.
- **Integration:** Drag-and-drop simulation using `@dnd-kit/core`'s testing utilities.
- **Accessibility:** Keyboard reorder via Alt+↑/↓ on focused row produces the same result as drag-and-drop.
- **E2E:** Add a scenario in `phase2ShowDayRewalk.spec.ts` or a new spec that exercises the full flow — open Show Map → click class run-order menu → Armband ↑ → verify order persists after page reload.
- **Manual:** Verify mid-class behavior — start scoring, then reorder the queue ahead of the current dog. Already-scored entries should not move.

### Why post-launch, not bundled into B1–B6

Phase B7 is a real feature with library additions, drag-and-drop UI, and run-order data semantics. Bundling into the core IA collapse would balloon the scope and the risk profile. Ship the IA collapse first; add run-order on a stable foundation.

### Out of scope for Phase B7

- Ringside run-order editing on phones/tablets. That's a myK9Q feature for the gate steward, on a separate track.
- Live broadcast of run-order changes to exhibitors. Could be a future enhancement using existing broadcast infrastructure.

### [ADDED] Authorization scope

Run-order edits in Show Map are gated to the same roles that own the rest of Show Map's operational actions: `UserRole.SECRETARY` and `UserRole.SITE_ADMIN`. This inherits from `ProtectedRoute` on the workbench route; no additional check needed at the action level.

**Cross-app note:** gate stewards reordering from myK9Q go through that app's auth model — out of scope here, but the shared `entries` table must enforce row-level security that both apps can satisfy. Confirm RLS policy on `entries` before shipping B7.

### [ADDED] Schema migration

Phase B7 must verify `entries.run_order` exists with appropriate constraints before any UI work begins. Steps:

1. Run `supabase migration list` to confirm current state.
2. Query `\d entries` (or equivalent) on the linked Supabase project to confirm the column exists, type (probably `integer`), and any unique/check constraints.
3. If column exists and is suitable: no migration; proceed to UI work.
4. If column missing or unsuitable: write a numbered migration in `supabase/migrations/` per project convention (`NNN_add_entries_run_order.sql`). Coordinate with PO before pushing — per CLAUDE.md, `supabase db push` is a shared-system mutation requiring confirmation in Auto Mode.
5. Document the verified schema state in the Phase B7 PR description.

### [ADDED] Conflict resolution policy

When both a secretary (myK9Show) and a gate steward (myK9Q) write to the same class's run order concurrently:

- **Default policy:** last-write-wins. The replicated-tables layer in `@myk9/replication` already does this for other status fields.
- **Mitigation 1:** the secretary's Show Map shows a small "Updated by another user" indicator when an external change is detected on a class currently displayed.
- **Mitigation 2:** in manual reorder mode, the class is marked "being edited by you" locally; if a remote update arrives while in reorder mode, surface a non-blocking toast: *"Run order changed elsewhere. Your changes will overwrite when you click Done."* User decides.
- **Out of scope:** operational transform / CRDT-style merging. Overkill for run-order semantics; last-write-wins matches the existing replication model.

### [ADDED] Rollback playbook

If a critical issue surfaces post-merge:

1. `git revert <phase-b7-commit-sha>`. Vercel auto-redeploys staging.
2. Class Details' run-order UI (if still present) becomes the sole reorder path again.
3. If Phase B7 included removing run-order UI from Class Details, revert that commit too — the order of these commits matters; document in the PR description.
4. Trigger criteria: any data corruption observed (run_order values not persisting, duplicates, gaps); auto-sort produces wrong order; drag-and-drop crashes on a real-show-size class.

### [ADDED] Performance check for large classes

Before merging Phase B7, verify drag-and-drop performance on a class with 50+ entries:

1. Seed a test show with one class containing 50 entries.
2. Open the reorder mode; measure time to enter reorder mode (target: <300ms).
3. Drag an entry from position 50 to position 1; measure persistence time (target: <500ms).
4. Verify the tree doesn't stutter during the drag animation.
5. If any check fails, virtualize the entry list (probably already needed for very large classes) before shipping.

---

## Plan summary

| Phase | Scope | Entry trigger | Exit criterion | Risk |
|---|---|---|---|---|
| B0 | Build `ShowDeskAdaptiveHeader` + derivation helpers in isolation (`computeShowDeskStatus` takes show + trials + tree + injectable `now`) | PO sign-off on plan | Component + helpers unit-tested, not yet mounted | Low |
| B1 | Action-system unification + conflict-removal cleanup across `showMapActions.ts`, `attention.ts`, and `showMapStatus.ts` | B0 merged | `getRankedActions` returns merged actions when no phase; conflict no longer classified as attention anywhere in secretary surfaces | Med |
| B2a | Introduce Show Desk tab; wire header + compact mode on `ShowMapTab` + default-routing flip | B0 + B1 merged | New tab renders correctly, old tabs preserved | Med |
| B2b | Row-action enhancements: entry-menu additions + class-row primary action lifecycle (with mutation-action wiring) | B2a merged | Three new entry actions render; class primary button surfaces for all three lifecycle states | Med |
| B3 | Tools slide-out sheet (right-anchored, shadcn Sheet) — 7 cards | B2a merged (B2b and B3 can ship in either order) | 7 desk-tool cards behind a slide-out trigger | Low |
| B4 | Conditional Closeout section | B3 merged | Closeout section renders only when wrap-up-eligible | Low |
| B4.5 | Audit Class Details + ShowDashboard for operational-action leaks (per [Surface boundary](#surface-boundary-with-detail-pages)) | B4 merged | Audit findings doc; small remediation PR if leaks found | Low |
| B5 | Remove Today + Wrap-up tabs | B2+B3+B4+B4.5 merged + PO sign-off | Workbench has 2 tabs; legacy phase URLs redirect | High |
| B6 | Cleanup + documentation | One show cycle after B5 | No dead code; docs updated | Low |
| B6.5 | Tools sheet additions (Volunteers + Tasks/Notes; deferred from B3) | One show cycle after B6 | 7 → 9 tiles; existing features get Show Desk entry points | Low |
| B7 | Run-order editing in Show Map (auto-sort presets + drag-and-drop reorder mode) | B6.5 merged + observed in production | Class-row Run Order menu; Class Details cleanup | Med |

**Total estimated PRs:** 10–11 (B0, B1, B2a, B2b, B3, B4, B4.5, B5, B6, B6.5, B7 with B7's potential split).
**Critical path:** B0 → B1 → B2a → (B2b, B3, B4 parallel) → B4.5 → B5 → B6 → B6.5. B7 is post-launch.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adaptive header design under-delivers — secretary loses signal they relied on in the Phase checklists | B0 ships the header in isolation so it can be reviewed and iterated before mounting. PO walks it against seeded data before B2 starts. |
| Secretaries used to phase tabs feel disoriented | Phases B2–B4 ship in parallel-access mode (old + new tabs both present). PO uses Show Desk for a window before B5 removes the old tabs. |
| Tools drawer is too out-of-the-way; secretary doesn't discover incident log when it's needed | Drawer button shows a count badge when any tool has active state (e.g., open incidents). Reconsider in B5 review. |
| Closeout section's "wrap-up-eligible" detection is wrong (too eager or too late) | B0 and B4 both unit-test `hasAnyWrapUpEligibleNode` against many tree states. PO reviews edge cases (e.g., a class with no entries should not count). |
| Up Next in the adaptive header becomes noisy on large shows | Cap to top 3 (vs 4 in the current nested Up Next). Already-queued [Disambiguate Up Next labels](../OPEN-TODOS.md) chip improves readability. |
| Phase B5 reveals a critical workflow only the deleted tabs supported | Rollback playbook documented. Staging gate verifies every critical flow before merge. |
| File-size budget exceeded as adaptive header grows | B0's exit criterion enforces file under 300 lines. If derivation logic grows, extract more helpers. |
| Removing the Phase checklist removes a chunk of "secretary education" content | The "What do I do if…" content moves to a `?` popover in the header. Educational copy that's read once goes into an onboarding pass, not always-visible UI. |
| Pre-existing tests assert on Today/Wrap-up tab structure | Phase B5 fixture audit + grep enforcement catches these. |

## [ADDED] Deferred polish items

These were identified during verify-plan but are intentionally deferred — handle in implementation review rather than pre-committing to specifics:

- **Dialog audit (Pattern 4):** during Phase B2 implementation, sanity-check that the existing `ShowMapMoveUpDialog`, `ShowMapScratchNoShowDialog`, and `ShowMapMessageHandlerDialog` still render correctly when the unified Show Map (no `actionPhase`) is the trigger. No code change expected; verification only.
- **"Open Class" destination semantics (Pattern 3):** when class status is `complete`, the "Open Class" button routes to the Class Details page (read-only summary plus the optional configuration affordances). Confirm route during Phase B2 implementation; no separate decision needed.
- **0/1-entry edge cases (Phase B7):** Run Order menu should disable auto-sort presets when class has fewer than 2 entries (sorting a 1-entry list is meaningless). Handle in B7 implementation; no separate spec needed.
- **Up Next empty state:** when Up Next has no items and pending signals are also empty, the adaptive header's "No pending signals" copy carries the message. No separate empty state for Up Next.
- **Telemetry / observability:** cross-cutting concern (logging key Show Map events). Out of scope for this plan; track separately if needed.
- **Memory file updates (Phase B6):** specifically update [`Show Map Naming Intent`](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_show_map_naming_intent.md) if its phrasing references the deprecated phase tabs. Other memory files unlikely to need changes.

## Open questions for PO

1. **Show status auto-detection logic (Phase B0):** ~~when is a show "in setup" vs "in progress" vs "in wrap-up"?~~ **RESOLVED 2026-05-22.** Date-aware rule adopted:

   | Status | Rule |
   |---|---|
   | `setup` | Show start date in the **future** AND no scoring activity yet |
   | `show-in-progress` | Today is **between** start and end date, OR ≥1 class has scoring activity |
   | `wrap-up` | Today is **past** start date AND ≥1 class needs sign/review/submit AND no class is `active` |
   | `closed` | All classes complete AND all submitted |

   The date check handles boundary cases like show-desk morning before any class starts, or day-2 of a multi-day show with day-1 already submitted.

2. **Pending-signals taxonomy (Phase B0):** ~~which derived signals appear in the adaptive header?~~ **RESOLVED 2026-05-22.** Final taxonomy:

   | Signal | Priority | Notes |
   |---|---|---|
   | Entries waiting for review | Highest | `submitted` state — secretary's primary attention driver |
   | Entries waiting for check-in | High | Operational signal: potential no-shows in run order |
   | Classes needing judge signature | High (wrap-up) | Closeout step |
   | Results pending closeout | Medium (wrap-up) | Combines "not reviewed" + "not submitted" |

   **Dropped:** "Check-in conflicts" — confirmed in this session as a gate-steward signal (set by exhibitors in myK9Q to notify the gate they may be late from another ring), not a secretary attention reason. See the [Cross-app action ownership](#cross-app-action-ownership) note in Phase B1.

   **Dropped:** "Classes not started count" — already visible in the tree; redundant signal.

3. **Setup tab scope:** ~~Out of scope for this plan but worth flagging.~~ **RESOLVED 2026-05-22.** 30-minute live audit before Phase B5 ships. Walk the current Setup tab; if it has the same About-banner/checklist/tool-sprawl problems as Today did, add a Phase B8 to apply the same simplification template. If already lean, leave alone with confidence. Captured as part of Phase B4.5 audit checkpoint.

4. **Closeout section's three destination cards (Phase B4):** ~~are Results Control, Reports, and Submit Results still the right three quick-link destinations?~~ **RESOLVED 2026-05-22.** Keep the current three; revisit during Phase B4 staging walk if a missing destination becomes obvious in real usage.

## Comparing Option A and Option B

| Dimension | Option A (Unified Show Map tab) | Option B (Collapse to Setup + Show Desk) |
|---|---|---|
| **Tabs after migration** | 4 | 2 |
| **Net surface area** | +1 tab | −2 tabs, −2 checklists, −2 about banners, −2 help cards, 6/7 desk cards collapsed |
| **Conceptual change** | Incremental | Architectural |
| **Risk** | Lower | Higher (more user-visible removal) |
| **Effort** | 5 PRs | 7 PRs |
| **Addresses "too many features and choices" concern** | Partially (consolidates Show Map only) | Directly (deletes scaffolding, collapses tools) |
| **Preserves architectural commitments** | Yes | Yes |
| **Reversibility** | High (5 small PRs, each revertible) | Medium (B5 is the load-bearing rip; B0-B4 are fully reversible) |
| **Design risk concentration** | Spread across phases | Concentrated in the adaptive header (B0) |

If the PO's strongest priority is **fewer features and choices**, Option B is the better fit. If the strongest priority is **lowest risk to existing user flow patterns**, Option A wins.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Plan drafted as fresh-eyes alternative to Option A, in response to PO's "too many features and choices" concern. | This session |
| 2026-05-22 | Interactive prototype built at [`docs/option-b-prototype.html`](option-b-prototype.html) to validate the IA and adaptive header design before code kickoff. | This session |
| 2026-05-22 | PO reaction to prototype: "comes across more automated and smart" — design intent of state-derived signals confirmed. | This session |
| 2026-05-22 | **Counts-are-filter-shortcuts** pattern adopted across pending-signal chips, Need Attention tile, and row attention badges. Other summary tiles (Trials/Classes/Entries) stay informational pending evidence. | This session |
| 2026-05-22 | **Tools changed from inline drawer to right-anchored slide-out sheet** (Phase B3). Avoids layout shift; lets secretary keep tools open while browsing the tree. | This session |
| 2026-05-22 | **Class primary action lifecycle** — Mark Started → Score Class · N% → Open Class — added as Pattern 3. Score Class gets the accent treatment when class is active. | This session |
| 2026-05-22 | **Entry-row menu additions** — Open entry details, Edit score, View handler's other entries — added to Phase B2 scope. | This session |
| 2026-05-22 | **Surface boundary with detail pages** documented. Operational actions → Show Map; configuration/edit/bulk → detail pages. Phase B4.5 added as audit checkpoint. | This session |
| 2026-05-22 | **Run-order editing** scoped to secretary-only (myK9Show); ringside reorder is myK9Q territory. Captured as Phase B7 post-launch enhancement. | This session |
| 2026-05-22 | **Scoring & data flow** section added — clarifies myK9Q ringside vs myK9Show paper scoring split. Score Class (class-row) and Edit score (entry-row deep-link) both route to `/scoring/classes/:id/entries?mode=split`. | This session |
| 2026-05-22 | **Verify-plan pass** on the patched plan. Coverage went 72→92 after auto-patches. Patched: Pattern 1 `title`→Tooltip; Edit-score safety; Phase B3 rollback+staging; Phase B7 authorization, schema migration, conflict policy, rollback, perf check; Phase B4 staging. Deferred-polish list documents intentionally-deferred items. | This session |
| 2026-05-22 | **Domain correction:** `check_in_status = 'conflict'` is set by exhibitors in myK9Q to notify the gate steward of competing-ring obligations. It is NOT a secretary attention reason. Action: remove `resolve-check-in-conflict` from `showMapActions.ts` and `check_in_conflict` from `attention.ts`. Task added to Phase B1. | PO clarification |
| 2026-05-22 | **Pending-signals taxonomy resolved (Q2)** — 4 signals: entries waiting for review (highest), entries waiting for check-in, classes needing judge signature, results pending closeout. Dropped check-in conflicts (not secretary's signal) and classes-not-started (redundant with tree). | This session |
| 2026-05-22 | **Cross-app action ownership audit added to Phase B1.** Confirmed all 5 remaining entry-row actions (Review, Mark checked in, Move up, Scratch, Message handler) are correctly secretary-scoped or have a legitimate secretary-backup use case. | This session |
| 2026-05-22 | **Open questions Q1, Q3, Q4 resolved.** Q1: adopt date-aware show-status auto-detection. Q3: 30-min Setup audit before Phase B5 (folded into Phase B4.5 scope). Q4: keep current 3 Closeout destinations; revisit during B4 staging walk. | This session |
| 2026-05-22 | **Tools list grew 7 → 9.** Added Volunteers (existing route `/secretary/volunteers` lacked Show Desk entry point) and Tasks/Notes (existing `secretary_tasks` table from migration 133, lets the secretary jot per-show notes). Renamed Judge hospitality → Hospitality. | This session |
| 2026-05-22 | **Secretary Dashboard relationship documented.** Dashboard stays — it owns cross-show concerns (multi-show overview, cross-show attention, personal tasks, messages). Workbench owns per-show operations. Phase B1's `attention.ts` change carries an audit dependency for the dashboard's attention render. Full dashboard refocus is a candidate follow-up plan, not in scope here. | This session |
| 2026-05-22 | **Renamed secretary tab "Show Day" → "Show Desk"** to disambiguate from the existing exhibitor `/exhibitor/show-day` page. Chosen for: physical-reality match (the secretary's literal desk at the venue), codebase resonance (existing `TodayDeskToolsSection` already speaks "desk"), no collisions, secretary identity-coded. Role-surface map section added documenting all three role-surfaces (secretary Show Desk, exhibitor Show Day, gate steward myK9Q). All plan + prototype references updated. | This session |
| 2026-05-22 | **PO review pass — six concrete patches applied.** (1) Conflict-removal extended to `showMapStatus.ts` lines 116 & 162 (was incomplete — would still visually render attention). (2) `computeShowDeskStatus` signature widened to take show + trials + tree + injectable `now` (was tree-only; date-aware rule needs show dates). (3) Phase B2 split into B2a (tab/header/compact/routing) and B2b (row-action enhancements) — original was too loaded. (4) Class primary action wiring gap documented — current `ShowMapStructureTable.tsx:416` only renders when `primaryAction.href` exists; mutation actions (`mark-class-started`, `mark-class-complete`) need additional wiring. (5) Tools sheet reverted from 9 → 7 tiles for the B3 collapse pass; Volunteers + Tasks tile additions moved to deferred Phase B6.5 to keep simplification message clean. (6) Pattern 2 terminology aligned with production: `navigate / mutation / dialog / disabled` (was `navigate / execute / print / disabled` — wrong). | Code-grounded PO review |
| 2026-05-22 | **Class status auto-derivation flagged as candidate follow-up plan.** PO observed that first-score → `active` and last-expected-score → `complete` is derivable from scoring events. Captured as stub at [`plan-class-status-auto-derivation.md`](plan-class-status-auto-derivation.md); requires PO interview on six edge-case rules before full plan can be drafted. Phase B2b now carries a future-proofing note: don't over-invest in always-visible Mark Started / Mark Complete buttons since they may become rare under auto-derivation. | This session |
| 2026-05-22 | **Dashboard refocus stub created** at [`plan-dashboard-refocus.md`](plan-dashboard-refocus.md). Captures the candidate follow-up to narrow the Secretary Dashboard to cross-show concerns once Option B's workbench takes over per-show work. Deferred until post-Option-B observation period yields data on which dashboard surfaces remain useful. | This session |
