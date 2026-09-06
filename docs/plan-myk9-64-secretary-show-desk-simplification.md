# MYK9-64 — Secretary Show Desk Simplification

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


> **Status:** Implementation complete; PR and review pending

Linear: [MYK9-64](https://linear.app/myk9-platform/issue/MYK9-64/the-secretarys-show-details-page-looks-too-complicated) · Related: [MYK9-65](https://linear.app/myk9-platform/issue/MYK9-65) (count trust break), [MYK9-66](https://linear.app/myk9-platform/issue/MYK9-66) (inline status badge)

The Codex UX audit embedded in MYK9-64 (2026-07-19) identified the core problem: **presentation, not capability** — too many useful things visible at once with similar visual weight, plus duplicate routes to the same work. This plan verifies each finding against the actual code and sequences the remediation. Direction: **triage first, details on demand; subtract duplication; progressively disclose power controls.** No new surfaces.

## Implementation closeout — 2026-07-20

The approved Class Operations Cockpit supersedes the narrower phased layout below while preserving its consolidation rules. Show Desk now uses one Trial-grouped daily schedule, a compact Needs Attention strip, and one focused-Class work panel. Ordinary work remains reachable through canonical deep links; the cockpit does not duplicate Entry Management, Class Management, Reports, Results Control, Submit Results, or paper scoring.

The implementation also adds offline-safe manual Class lifecycle and Revised Expected Start controls, staff-recorded Actual Start/Actual Finish, context-scoped reports, and append-only Paperwork Print coordination. Shared-staging rehearsal passed with two secretary contexts plus `/at-show`: online changes appeared without reload, an offline expected-start change converged after reconnect, staff saw actual timing, and exhibitor-only tests confirmed actual timing remains private. Detailed scope and evidence live in [`openspec/changes/secretary-class-operations-cockpit/`](../openspec/changes/secretary-class-operations-cockpit/).

Intentional non-goals remain: no stage board, no inferred Ring from Judge, no duplicated owner workflows, no automatic claim that browser Print completed, and no gating Class work on paperwork state. Venue-printer hardware testing and full ringside end-to-end rehearsal remain separate launch-readiness gates.

## Code-verified findings

Each audit finding, confirmed against the worktree at `94b9eda9c`:

| #   | Finding (audit)                                                                                      | Code reality                                                                                                                                                                                                                                                              | Verdict                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F1  | Duplicate pending-entry routes: chip + `Manage entries (N)` button                                   | `ShowDeskAdaptiveHeader.tsx:91-102` renders the button; `ShowDeskPanel.tsx:267-269` routes the `entries-waiting-review` chip to the **identical** `getEntryManagementHref({attention:'pending', mode:'review'})` destination. Two controls, one destination, same screen. | Confirmed — delete button, keep chip                                        |
| F2  | `Related: Entry Management` duplicates primary nav                                                   | `ShowDeskPanel.tsx:223-241` always adds Entry Management to related links; Entry Management is also a peer section in the always-visible nav (`ShowManagementShell.tsx:285-306`) AND the chip destination (F1). Third route to the same page.                             | Confirmed — remove; keep Class Management link                              |
| F3  | Chips look identical but behave differently (navigate vs local filter vs static)                     | `handlePendingSignal` (`ShowDeskPanel.tsx:265-283`): review/payment/closeout **navigate**; check-in/signature set a **local tree filter**. `PendingSignalsRow` renders all of them identically. Labels are noun-first (`14 pending entries`).                             | Confirmed — verb-first labels + navigate/filter indicators                  |
| F4  | Running Now cards expand the tree instead of opening the class                                       | `selectRunningNowClass` (`useShowMapWorkbenchState.ts:180-198`) expands + scrolls; class nodes already carry the Class Details href (`showMapTree.ts:297`).                                                                                                               | Confirmed — primary click navigates, `Locate in Show Map` becomes secondary |
| F5  | Entry Management power controls (preset/density/saved views) sit at the same level as the work queue | `RegistrationViewControls.tsx:90-104` renders `EntryManagementViewControls` as a full toolbar row between quick views and search.                                                                                                                                         | Confirmed — collapse under one `View options` popover                       |
| F6  | Persistent hero + publish cards dominate every section                                               | `ShowManagementShell.tsx:154-252` renders hero, quick facts, and publish row above the `<Outlet/>` on all six sections. **Protected**: `// INTENT:` at `ShowManagementShell.tsx:242` says the publish row is deliberately show-level, on every tab.                       | Confirmed but **gated** — needs explicit product approval (Phase 3)         |
| F7  | Show Desk / Class Details / Class Management disagree on entry counts                                | Tracked separately as MYK9-65 (Critical). Not re-scoped here.                                                                                                                                                                                                             | Out of scope — MYK9-65                                                      |
| F8  | Status badge not inline-editable                                                                     | Tracked separately as MYK9-66.                                                                                                                                                                                                                                            | Out of scope — MYK9-66                                                      |

INTENT constraints honored: the "one elevated zone" card (`ShowDeskAdaptiveHeader.tsx:76`), chip 44px touch targets (`:377`), chips-lead-to-canonical-owner (`ShowDeskPanel.tsx:254`), closeout-only-when-eligible (`ShowDeskCloseoutSection.tsx:10`), and the always-visible publish row (F6 gate).

## Phases

### Phase 1 — Subtract duplication, honest affordances (this PR)

1. **F1**: Delete `Manage entries (N)` from `ShowDeskAdaptiveHeader` (props `onOpenEntryManagement`/`reviewQueueCount` go away; `ShowDeskPanel` drops `pendingReviewCount`). The verb-first chip is the single route.
2. **F2**: Remove Entry Management from Show Desk related links; keep Class Management.
3. **F3**: Verb-first signal labels in `showDeskPendingSignals.ts` — `Review N entries`, `Check in N entries`, `Resolve N payments`, `Close out N results` (signature label unchanged; it is count-informational). Export a `SHOW_DESK_SIGNAL_INTERACTION` map (`navigate` | `filter`) matching `handlePendingSignal`, and render an arrow icon on navigating chips / filter icon on filter chips.
4. **F4**: `ShowMapRunningNowItem` gains `href` (from the class node). Card primary click navigates to Class Details; a secondary `Locate in Show Map` control keeps the expand-and-scroll behavior. Applied to both mounts (Show Desk compact header and legacy non-compact `ShowMapTab`).
5. **F5**: Wrap display preset + density + saved views in a `View options` popover in `RegistrationViewControls`; quick views, search, filters, and view-mode toggle stay primary. Controls stay keyboard/touch accessible inside the popover.

**Tests (phase gate):** update `showDeskPendingSignals.test.ts`, `ShowDeskAdaptiveHeader.test.tsx` (drop Manage-entries tests; add interaction-indicator + running-now navigate/locate tests), `ShowDeskPanel.test.tsx` (single pending route, related links), `showMapRunningNow.test.ts` (href), `RegistrationView.test.tsx` (controls reachable via View options). Full `pnpm vitest run` for touched suites + `pnpm typecheck`.

### Phase 2 — Triage-first layout (follow-up PR)

- Collapse the Show Map tree on Show Desk to a summary line (`2 trials · 5 classes · 7 need attention`) with `View all classes` expand; the adaptive header (Next / Up next / Running now / signals) already leads the page, so this completes the audit's target hierarchy.
- Mirror the `View options` consolidation in Class Management (`ClassManagementViewControls.tsx` mirrors the entry one).
- Make the Financial Report reachable from Show Desk closeout / Reports context.

### Phase 3 — Compact chrome outside Setup (needs approval)

Replace hero + quick facts + publish cards with a compact context bar on non-Setup sections, keeping a one-line exception alert for unpublished/stale states. **Blocked on explicit approval** because it changes the protected always-visible publish row (`ShowManagementShell.tsx:242` INTENT). Prototype first, decide with screenshots.

### Dependencies / sequence with related issues

- **MYK9-65 (Critical)** should land before or alongside Phase 2 — Running Now direct navigation (Phase 1.4) makes the Class Details count mismatch _more_ visible, which is intentional pressure but means MYK9-65 is now the top-priority bug.
- **MYK9-66** delivers the inline status badge editor; independent of this plan's phases.
