# Plan — Phase C Tree Extensions + Guided UX

**Date:** 2026-05-17
**Status:** Ready for implementation.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)
**Dependency:** Phase B workbench IA shipped in [PR #223](https://github.com/rbeezley/myk9-platform/pull/223).

## Goal

Make the new `/secretary/shows/:showId` workbench answer the secretary's show-day question: **what needs me now?**

Phase C should preserve the Trial Secretary intent from `docs/INTENT.md`: "That was easy." The workbench should feel like a calm assistant that points to the next useful action without trapping the secretary in a wizard.

## Scope Guard

In scope:

- Extend `ShowMapTab` inside the Today phase with time scoping, a Completed view, and a Running Now strip.
- Promote the existing Next Best Action / Priority Queue concepts into first-class workbench guidance.
- Add phase checklists for Setup, Today, and Wrap-up.
- Add dismissible "About this page" guidance and secretary-specific "What do I do if..." entry points into the existing AskQ help panel.
- Extend wrap-up classification so the tree can surface report/signature/submission attention.

Out of scope:

- New operational workflows from Phase D, such as late entries, refunds automation, incident logging, hospitality, or schedule-slip broadcast.
- AKC/UKC fillable PDF form output from Phase E, except wiring its eventual submission state into wrap-up taxonomy.
- Replacing the shared ranked-action contract. New recommendations must consume `getRankedActions(scope, state)`.

## Architectural Commitments

1. **One priority source.** Next Best Action, Priority Queue, Recommended row actions, and Attention filtering continue to derive from `getRankedActions(scope, state)` / attention helpers in `features/show-map`.
2. **One time-scope contract.** Today/Tomorrow/All and Active/Completed filtering live in a shared show-map helper, not scattered through toolbar and tree rendering.
3. **Guidance is advisory.** Checklists, about strips, and AskQ help entry points never block the secretary from doing the work out of order.
4. **Workbench first.** New guided surfaces are authored for `/secretary/shows/:showId` phases, not for legacy dashboard/day-of pages.

## Parallel Tracks

These can run in parallel after PR 1 defines the shared time-scope shape:

- **Tree track:** time scope, Completed view, Running Now strip.
- **Guidance track:** Next Best Action workbench placement, phase checklists, contextual strips.
- **Help track:** "What do I do if..." content/search entry points that reuse `AskQPanel`.
- **Wrap-up track:** report/signature/submission taxonomy and attention actions.

Avoid parallel edits to `ShowMapTab.tsx` by extracting helpers/components first, then assigning later PRs to disjoint files.

## PR Slices

### PR 1 — Time scope foundation + Completed view

**Status:** Shipped 2026-05-17 in [PR #225](https://github.com/rbeezley/myk9-platform/pull/225).

Files likely touched:

- `apps/myk9show/src/features/show-map/showMapTimeScope.ts`
- `apps/myk9show/src/features/show-map/showMapTypes.ts`
- `apps/myk9show/src/features/show-map/ShowMapToolbar.tsx`
- `apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx`
- `apps/myk9show/src/features/show-map/ShowMapTab.tsx`

Deliverables:

- Add typed scope state for `dayScope: today | tomorrow | all` and `completionScope: active | completed`.
- Default Today phase to `today + active`.
- Dim non-today trials in All scope rather than hiding them.
- Move completed classes/entries into a Completed view that remains reachable.
- Keep Attention and In-progress filters compatible with the new scope.

Tests:

- Pure helper tests for date classification, including trial timezone.
- Tree/table tests proving non-today rows dim in All scope.
- `ShowMapTab` test proving Today defaults to active Today rows and Completed rows are reachable.

### PR 2 — Running Now pinned strip

**Status:** Shipped 2026-05-17 in [PR #225](https://github.com/rbeezley/myk9-platform/pull/225).

Files likely touched:

- `apps/myk9show/src/features/show-map/showMapRunningNow.ts`
- `apps/myk9show/src/features/show-map/ShowMapRunningNowStrip.tsx`
- `apps/myk9show/src/features/show-map/ShowMapTab.tsx`

Deliverables:

- Compact pinned strip above the tree.
- One card per active ring/class with class name, judge, progress, and ETA placeholder only when derivable.
- Click scrolls/focuses the matching class row.

Tests:

- Pure selector tests for active class detection and sorting.
- Component test for rendering and click-to-focus callback.

### PR 3 — Workbench-grade Next Best Action

**Status:** Shipped 2026-05-17 in [PR #225](https://github.com/rbeezley/myk9-platform/pull/225).

Files likely touched:

- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- `apps/myk9show/src/features/show-map/ShowMapTab.tsx`
- `apps/myk9show/src/features/show-map/ShowMapGuidanceCard.tsx`

Deliverables:

- Promote the Next Best Action card from a tree-local strip to a first-class Today phase element.
- Keep it sourced from `getRecommendedActions('root', { tree })`.
- Add local dismiss behavior that reveals the next-highest ranked action without mutating the underlying queue.

Tests:

- Selector/behavior test for dismissed action rotation.
- Workbench test proving Today shows the guidance card above the map.

### PR 4 — Phase checklists

**Status:** Implemented in the Phase C checklist branch; pending PR.

Files likely touched:

- `apps/myk9show/src/features/show-workbench/phaseChecklistDefinitions.ts`
- `apps/myk9show/src/features/show-workbench/PhaseChecklist.tsx`
- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`

Deliverables:

- Setup, Today, and Wrap-up checklist definitions with auto-complete predicates where data is already available.
- Manual checked/skipped state stored locally at first; no DB persistence until real-user validation proves it is needed.
- Progress is visible at a glance and never blocks tab switching.

Tests:

- Definition tests for auto-complete predicates.
- Component test for manual check/skip behavior.
- Workbench tests proving each phase renders the right checklist.

### PR 5 — Contextual about strips

Files likely touched:

- `apps/myk9show/src/features/show-workbench/AboutThisPhase.tsx`
- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`

Deliverables:

- One-line, dismissible guidance for Setup, Today, and Wrap-up.
- Copy stays plain-English and show-secretary specific.
- Dismiss state is local and scoped by phase.

Tests:

- Component test for dismiss behavior.
- Workbench test for phase-specific copy.

### PR 6 — "What do I do if..." AskQ entry points

Files likely touched:

- `apps/myk9show/src/components/askq/askq-config.ts`
- `apps/myk9show/src/components/askq/AskQPanel.tsx`
- `apps/myk9show/src/components/askq/AskQExampleQueries.tsx`
- `apps/myk9show/src/store/useAskQPanelStore.ts`
- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`

Deliverables:

- Reuse the existing `AskQPanel` slide-over instead of creating a second help panel.
- Add secretary show-day example prompts / quick actions for common questions: scratch/no-show, move-up, handler message, late entry, ring running behind, results submission.
- Open AskQ from the workbench with a prefilled prompt or selected example when the secretary clicks "What do I do if...".
- Preserve AskQ's existing rules, show-data, app-help categories and `showId` context inference.

Tests:

- AskQ config/example tests for secretary show-day prompts.
- AskQ panel/store tests for opening with a suggested prompt if a store extension is needed.
- Workbench smoke test for opening AskQ from the "What do I do if..." entry point.

### PR 7 — Wrap-up status taxonomy

Files likely touched:

- `apps/myk9show/src/features/show-map/showMapStatus.ts`
- `apps/myk9show/src/features/show-map/showMapActions.ts`
- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`

Deliverables:

- Class/trial statuses for signed-by-judge and submitted-to-AKC when existing data supports it.
- Attention actions for unsigned/unsubmitted completed classes.
- Wrap-up phase surfaces those statuses without affecting Today active-work defaults.

Tests:

- Status classification tests.
- Ranked-action tests for wrap-up attention actions.
- Workbench Wrap-up test proving report/submission links remain available.

## Testing Phase

Do not consider Phase C complete until these pass:

- Focused unit tests for each new helper, selector, and component.
- Focused `ShowMapTab` tests for time scope, Completed view, Running Now, and guidance rendering.
- Workbench tests for each phase checklist and help panel entry point.
- `pnpm --dir apps/myk9show exec vitest run` on touched test files for each PR.
- `pnpm --filter @myk9/show typecheck` for each production TypeScript PR.
- `pnpm --filter @myk9/show lint` when production TypeScript changes.
- One manual or automated workbench walk against a real show fixture after PR 7.

## Completion Criteria

Phase C is done when:

- A secretary opening Today can see what is running now, what needs attention, and what completed work is still reachable.
- Setup, Today, and Wrap-up each provide a concise checklist and contextual guidance.
- AskQ answers common "what do I do if..." questions without leaving the workbench.
- Wrap-up rows identify report/signature/submission gaps.
- `OPEN-TODOS.md` and this plan are updated with shipped PR numbers.
