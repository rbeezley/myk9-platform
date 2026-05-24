# Plan — Unify Show Map into a Top-Level Workbench Tab

**Date:** 2026-05-22
**Status:** Superseded by [`plan-show-map-workbench-collapse.md`](plan-show-map-workbench-collapse.md) — shipped 2026-05-24 as PRs #305–#317.
**Related prior plans:**

- [`plan-ia-show-map.md`](plan-ia-show-map.md) — IA-1 through IA-4, all completed. Established the public-vs-secretary read/write split, the wrap-up framing subtitle, the row-action discoverability popover, and the Class Details duplication fix. **This plan builds on, and does not contradict, that work.**
- [`ia-review-show-map.md`](ia-review-show-map.md) — original IA audit.
- [`plan-show-day-sequencing.md`](plan-show-day-sequencing.md) — defines the architectural commitments this plan must respect.

## Background

Today the Show Map is embedded as a section inside **two** Secretary Workbench phase tabs:

- **Today** (`?phase=today`) — mounted with `initialDayScope="today"`, no `actionPhase` → live-ops action set.
- **Wrap-up** (`?phase=wrap-up`) — mounted with `initialDayScope="all"`, `initialCompletionScope="completed"`, `actionPhase="wrap-up"` → closeout-only action set.

The two mounts share the same component but the `actionPhase` prop **completely replaces** the action set inside [`showMapActions.ts:213-217`](../apps/myk9show/src/features/show-map/showMapActions.ts):

```ts
function actionsForNode(node, tree, phase) {
  if (phase === 'wrap-up') {
    return wrapUpActionsForNode(node);   // ← disjoint from today actions
  }
  // ...live ops actions
}
```

So a class that needs a judge signature is invisible on the Today tab even though the node objectively needs that action. The secretary has to switch tabs to act on it.

This plan unifies Show Map into a single top-level workbench tab that exposes **all node-applicable actions regardless of phase**, with the Today/Wrap-up phase tabs retained only for their genuinely phase-specific scaffolding (checklists, supporting desk-tools cards).

## Goals

1. **One operational hub.** Secretary opens the workbench, clicks "Show Map," and lands on the tree — one click from any phase tab.
2. **State-driven actions, not user-mode-driven.** Wrap-up actions surface on nodes that need them; live-ops actions surface on nodes that need them; both appear in the same tree when both apply across the show.
3. **Preserve phase tab value.** Setup, Today, and Wrap-up retain their distinct checklists, About-this-phase banners, and supporting cards. Only the embedded Show Map mount is removed.
4. **No regressions** to existing IA-1 through IA-4 commitments (public Show Map remains read-only; row-action discoverability popover stays; wrap-up framing subtitle is re-homed appropriately).

## Non-goals

- Renaming "Show Map" — confirmed intentional in sitemap sense (per the [`Show Map Naming Intent`](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_show_map_naming_intent.md) memory and IA-2 decision log).
- URL-state sync / deep-linking inside the tree — still deferred until user demand surfaces (IA-4 decision).
- Touching the public `/shows/:id?tab=map` route — IA-1's view-only treatment stands.
- Reworking the action priority numbers — same `getRankedActions()` contract, additive action set.

## Architectural commitments this plan must respect

Carried forward from [`plan-show-day-sequencing.md`](plan-show-day-sequencing.md) and [`plan-ia-show-map.md`](plan-ia-show-map.md):

1. **Single shared priority function** — `getRankedActions(scope, state)` remains the only ranker. This plan *strengthens* the commitment by removing the phase-fork inside `actionsForNode`.
2. **Single shared attention function** — `attention.ts` remains the only source of "needs attention." `getAttentionNodeIds` already accepts an optional `phase`; the plan removes the need for callers to pass it.
3. **Show-centric mental model** — all single-show management lives under `/secretary/shows/:showId`. This plan adds a new tab *within* that route; no new top-level routes.
4. **View-only public map** — `ShowDetailsPage` continues to pass `canManageShow={false}`. Unchanged.

## [ADDED] Implementation conventions

Every phase's PR must satisfy these baseline conventions. Implementing agents should treat these as preconditions, not suggestions.

- **Package manager:** `pnpm` only. Never `npm`. Tests run via `pnpm test` (from app dir) and `pnpm typecheck` / `pnpm lint` from monorepo root.
- **React render helper:** all tests in `apps/myk9show` use the custom `render` from [`src/test/utils/testUtils.tsx`](../apps/myk9show/src/test/utils/testUtils.tsx) — wraps QueryClient, Auth, Router. Never use bare `@testing-library/react` render.
- **File-size budget per CLAUDE.md:** keep new and modified files under 500 lines. `ShowMapTab.tsx` is currently ~434 lines; Phases 2 and 3 must extract helpers/subcomponents (e.g., a `ShowMapPhaseToggle.tsx`, a `ShowMapEntryPointBanner.tsx`) rather than push it past the limit.
- **No comments unless WHY is non-obvious.** No multi-line comment blocks. Existing `// INTENT:` comments must be preserved.
- **No emojis** in code or UI (per project memory).
- **Pre-launch:** no real users — skip backwards-compat shims, redirect bridges, deprecation banners. Per the [Pre-launch — no real users yet](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_prelaunch_no_users.md) memory.
- **Cross-app scope:** this plan touches `apps/myk9show` only. `apps/myk9q` has no Show Map equivalent; do not modify it.

## [ADDED] URL param naming decision

The plan reuses the existing `?phase=` query parameter rather than introducing a new `?tab=` or `?view=` param. Rationale:

- Existing infrastructure (`SecretaryShowPhaseRedirect`, `unifiedSidebarConfig`, `ShowPhaseCard`) already speaks `?phase=`.
- Introducing a second param would require dual-state reconciliation when both are present.
- The semantic stretch ("Show Map is not a phase") is tolerable because the workbench treats all four entries as peer "tabs" regardless of whether their domain meaning is temporal (Setup/Today/Wrap-up) or structural (Show Map).
- If a future redesign promotes Show Map out of the workbench entirely (e.g., to a peer route), the param will be retired anyway.

**Decision:** keep `?phase=`. Add `'show-map'` as a fourth accepted value. Document the semantic stretch in `secretaryRoutes.tsx` comments.

## [ADDED] Default tab behavior

When a secretary lands on `/secretary/shows/:showId` without a `?phase=` query parameter, the existing `SecretaryIndexRedirect` ([secretaryRoutes.tsx:122](../apps/myk9show/src/routes/secretaryRoutes.tsx)) currently routes to the bare URL (no redirect), meaning `activePhase` resolves from internal state.

**Decision for this plan:** Phase 2 ships with the existing default unchanged (Today phase remains the landing tab). After Phase 3 removes the embedded Show Map from Today, evaluate whether to flip the default to `show-map` in Phase 5. This is deliberately *not* changed in Phase 2 to avoid coupling two user-visible changes in one PR.

## [ADDED] Tab order and mobile layout

**Tab order:** the new "Show Map" tab is appended as the 4th tab: `[Setup | Today | Wrap-up | Show Map]`. Rationale: preserves the temporal Setup→Today→Wrap-up reading order; the structural Show Map tab is appended as a peer rather than inserted in the middle.

**Alternative considered:** placing Show Map between Setup and Today (signaling "operational hub") was rejected because it breaks the secretary's existing left-to-right scan of phase progression.

**Mobile layout:** at sub-768px widths the `PrimaryTabs` component (verify exact behavior in [`@/components/ui/tabs`](../apps/myk9show/src/components/ui/tabs.tsx) or wherever `PrimaryTabs` lives) may overflow with 4 tabs. Phase 2 must:

1. Snapshot the workbench tab strip at mobile (375px), tablet (768px), and desktop (1280px) before merging.
2. If overflow occurs at mobile, add horizontal scroll on the tab row or shorten the "Show Map" label to "Map" on narrow viewports.
3. Verify tab labels are not truncated by ellipsis without overflow indication.

## How to use this doc

- Phases are sized to one PR each.
- Each phase has an **entry trigger** and **exit criterion**.
- Phases are sequenced by load-bearing dependency: Phase 1 must land before Phase 2 because Phase 2 relies on the unified action behavior; Phase 3 must land before Phase 4 because removing the embedded mounts changes what cross-links need to point at.
- Every phase has a **Testing** section. Per [`CLAUDE.md`](../CLAUDE.md): no phase is complete until its tests are written and passing.

---

## Phase 1 — Action-system unification (non-breaking foundation)

**Entry trigger:** PO sign-off on this plan.
**Estimated PRs:** 1.
**Risk:** Medium. Changes the contract of `actionsForNode` but in an additive way; existing callers still get the same surfaces by passing `phase='wrap-up'` or undefined.

### Scope

Refactor [`showMapActions.ts`](../apps/myk9show/src/features/show-map/showMapActions.ts) so wrap-up actions surface based on node state (`wrapUpStatus`) rather than the `phase` prop.

### Implementation

1. In `actionsForNode(node, tree, phase)`:
   - **Remove** the early-return `if (phase === 'wrap-up') return wrapUpActionsForNode(node);` branch.
   - Compute the live-ops actions as today.
   - Also compute `wrapUpActionsForNode(node)` unconditionally.
   - Merge: return live-ops actions ∪ wrap-up actions. The existing `compareShowMapActions` sort handles ranking — wrap-up priorities (95, 60, 50) already interleave correctly with live-ops priorities (100, 85, 70, 62, 58, 35, 32, 30, 25, 20, 15, 10).
2. **Add a feature flag / phase parameter behavior** that preserves backwards-compat for the embedded mounts during Phase 1 only:
   - Keep the `phase` parameter on the function signature.
   - When `phase === 'wrap-up'`, return ONLY wrap-up actions (current behavior — preserves Wrap-up tab UX).
   - When `phase === 'today'` (new explicit value), return ONLY live-ops actions (preserves Today tab UX).
   - When `phase === undefined`, return the merged set (new unified behavior — used by the Phase 2 tab).
3. Update the `ShowMapActionState['phase']` type to include `'today'` as a third value: `'today' | 'wrap-up' | undefined`.
4. Update both existing mount sites in [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx):
   - Today mount: pass `actionPhase="today"` (new) — preserves existing UX.
   - Wrap-up mount: keep `actionPhase="wrap-up"` — unchanged.
5. Confirm `getAttentionNodeIds(tree, phase)` follows the same three-way fork so attention badges stay consistent with the visible action set.

#### [ADDED] Dedup policy for the merged action set

The current `actionsForNode` produces zero overlap between live-ops and wrap-up branches (no action ID appears in both). After merging, the invariant must be preserved. Phase 1 must:

1. Add an assertion-style invariant check in `actionsForNode`: if a merged result contains two actions with the same `id` and same `nodeId`, throw in dev (`if (process.env.NODE_ENV !== 'production')`) and last-write-wins in prod.
2. Add a unit test that constructs a tree where a class node is *both* live-ops-active (e.g., `status.kind === 'active'`) AND wrap-up-needs-signature. Assert the merged action set contains both actions (different IDs, no collision).
3. If a future action ID is added to *both* branches, this test fails fast and forces a deliberate decision (rename or pick one).
4. Stable sort within equal priority: `compareShowMapActions` already breaks ties on label, then nodeId, then id — confirm this still produces deterministic ordering when wrap-up and live-ops actions interleave at the same priority.

### Exit criterion

- `actionsForNode(node, tree, undefined)` returns a merged action set that includes both live-ops and wrap-up actions when applicable.
- `actionsForNode(node, tree, 'today')` returns only live-ops actions (Today tab behavior preserved).
- `actionsForNode(node, tree, 'wrap-up')` returns only wrap-up actions (Wrap-up tab behavior preserved).
- All existing tests pass without modification beyond the new `'today'` explicit value where the existing tests relied on the implicit "no phase = live-ops" behavior.

### Testing

- **Unit:** Extend [`showMapActions.test.ts`](../apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts):
  - Construct a tree where one class has `wrapUpStatus = NEEDS_JUDGE_SIGNATURE` and one entry has `status = 'submitted'`.
  - Assert `getRankedActions('root', {tree})` (no phase) returns BOTH "Collect judge signature" AND "Review entry."
  - Assert `getRankedActions('root', {tree, phase: 'today'})` returns "Review entry" but NOT "Collect judge signature."
  - Assert `getRankedActions('root', {tree, phase: 'wrap-up'})` returns "Collect judge signature" but NOT "Review entry."
- **Unit:** Extend `attention.test.ts` (if it exists; otherwise add) with parallel coverage for `getAttentionNodeIds`.
- **Regression:** Run the full existing `apps/myk9show/src/features/show-map/__tests__/` suite — all should pass.

### Why this phase first

This refactor is the load-bearing piece. Without it, the new unified tab in Phase 2 would either need to call `actionsForNode` twice (once per phase) and merge in the consumer, or duplicate the merge logic at the call site. Centralizing in `showMapActions.ts` keeps the "single shared priority function" commitment intact.

---

## Phase 2 — Add unified Show Map tab to workbench

**Entry trigger:** Phase 1 merged.
**Estimated PRs:** 1.
**Risk:** Low. Pure additive change — Today/Wrap-up still embed Show Map, so users have parallel access during the migration.

### Scope

Add a 4th tab to the workbench: `[Setup | Today | Wrap-up | Show Map]`. Mount one `ShowMapTab` instance with no `actionPhase` fork.

### [EXPANDED] Implementation

**Auth gate confirmation:** the new tab inherits its auth gate from the route. `ShowWorkbenchPage` is mounted under [`secretaryRoutes.tsx:133`](../apps/myk9show/src/routes/secretaryRoutes.tsx) inside `<ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>`. Adding a new tab does not require a separate auth check — but Phase 2 must verify with a test that a non-secretary user hitting `/secretary/shows/:id?phase=show-map` is bounced by `ProtectedRoute` exactly as today's Today/Wrap-up tabs are.

**Phase value validation:** the existing phase-parsing logic must accept `'show-map'` as a valid value AND fall back gracefully on unknown values. Phase 2 must:

1. Update wherever `activePhase` is parsed (likely a `parsePhase()` helper or inline switch in `ShowWorkbenchPage.tsx`). Add `'show-map'` to the allowed values.
2. For unknown values (e.g., a typo'd `?phase=showmap`), fall back to the default tab rather than crashing. Add a test asserting `?phase=garbage` does not crash and falls back to the default.
3. Update `SecretaryShowPhaseRedirect`'s `phase: 'setup' | 'today' | 'wrap-up'` parameter type to include `'show-map'`.

### Implementation

1. In [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx), extend `PHASE_TABS` (currently 3 entries at lines 70-74):
   ```tsx
   const PHASE_TABS: PrimaryTabDef[] = [
     { id: 'setup', label: 'Setup', icon: ListChecks },
     { id: 'today', label: 'Today', icon: ClipboardCheck },
     { id: 'wrap-up', label: 'Wrap-up', icon: Medal },
     { id: 'show-map', label: 'Show Map', icon: ListTree },  // new
   ];
   ```
2. Update the `activePhase` URL handling to accept `'show-map'` as a valid phase value. The phase param drives `PrimaryTabs value={activePhase}` at line 374.
3. Add a new `<PrimaryTabsContent value="show-map">` block. Mount `ShowMapTab` with:
   - `canManageShow`
   - `initialDayScope="all"` (no implicit Today filter — let the secretary scope it themselves)
   - `initialCompletionScope="active"` (default; covers the common operational case)
   - **No** `actionPhase` prop — Phase 1 made this the "unified actions" mode.
4. Add a lightweight in-component lens toggle inside `ShowMapTab` (or keep the toolbar's existing day/completion scope controls as the lens). Decision deferred to implementation review — preserve the existing toolbar controls; only add the toggle if user testing shows the default presets confuse the secretary.
5. Update [`SecretaryShowPhaseRedirect`](../apps/myk9show/src/routes/secretaryRoutes.tsx) (line 106) to accept `'show-map'` as a fourth phase value.
6. Update the wrap-up subtitle behavior (IA-3 framing) — currently triggered by `actionPhase === 'wrap-up'`. In the unified tab, the subtitle should *not* render. Verify the existing conditional at [`ShowMapTab.tsx:330-336`](../apps/myk9show/src/features/show-map/ShowMapTab.tsx:330) still fires only when `actionPhase === 'wrap-up'` (it does — no change needed).

### Exit criterion

- Workbench renders 4 tabs in order: Setup, Today, Wrap-up, Show Map.
- The Show Map tab shows the unified Show Map (all actions surfaced based on node state).
- Today and Wrap-up tabs still render their embedded Show Maps unchanged (parallel access during migration).
- Direct navigation to `/secretary/shows/:id?phase=show-map` lands on the new tab.

### Testing

- **Unit:** Extend [`ShowWorkbenchPage.test.tsx`](../apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx):
  - Render workbench with `?phase=show-map`; assert the Show Map tab is active and the unified Show Map renders.
  - Assert the Today and Wrap-up tabs still render their embedded versions (regression guard during Phase 2).
  - **[ADDED]** Assert `?phase=garbage` does not crash and falls back to the default tab.
  - **[ADDED]** Assert an exhibitor / public user hitting `?phase=show-map` is bounced by `ProtectedRoute` (mirror existing Today/Wrap-up coverage).
- **Unit:** New test in `apps/myk9show/src/features/show-map/__tests__/ShowMapTab.unified.test.tsx`:
  - Render `ShowMapTab` with no `actionPhase`.
  - Seed a tree where one node needs a wrap-up action and another needs a live-ops action.
  - Assert both actions appear in Up Next.
  - Assert the row menu for each node shows the actions that apply to it.
  - **[ADDED]** Seed a node that satisfies BOTH a live-ops and a wrap-up action; assert both appear and no dedup-collision warning fires.
- **Route:** Extend [`secretaryShowPhaseRedirects.test.tsx`](../apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx) — confirm `?phase=show-map` resolves correctly and doesn't redirect away.
- **[ADDED] Accessibility:** Render the workbench with 4 tabs. Confirm:
  - Tab navigation order (Tab key) traverses Setup → Today → Wrap-up → Show Map left to right.
  - `aria-selected` and `aria-controls` wiring on the new tab is correct (rely on the existing `PrimaryTabs` primitive; verify the regression).
  - The IA-2 row-action keyboard shortcuts (Up/Down/Left/Right/Enter/Space) still work inside the unified Show Map tab.
- **[ADDED] Mobile layout:** Use `preview_resize` (or equivalent) to capture the tab strip at 375px, 768px, 1280px. Confirm no truncation or unindicated overflow. If overflow, the implementation must add horizontal scroll or a shortened label.
- **[ADDED] Visual regression seed:** Capture a screenshot of the new tab's empty (no-trials) state, the populated state, and the state with both wrap-up and live-ops actions visible. Attach to the PR description for review reference.

---

## Phase 3 — Remove embedded Show Map from Today and Wrap-up tabs

**Entry trigger:** Phase 2 merged; PO has had a working session with both surfaces parallel and signed off on removing the embedded copies.
**Estimated PRs:** 1.
**Risk:** Medium. User-visible removal of UI in the most-used tabs. Mitigated by Phase 2 having shipped the replacement.

### Scope

Strip the `<ShowMapTab>` block from Today (lines 418-427) and Wrap-up (lines 515-526) of [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx). Replace each with a small "Open Show Map" link/button that navigates to `?phase=show-map`.

### Implementation

1. Remove the `<Suspense>` + `<ShowMapTab>` block from both phase tabs.
2. In the place where Show Map used to sit, add a small banner / card:
   > **Operational tree** — Show Map is now its own tab. → [Open Show Map](/secretary/shows/:id?phase=show-map)
   This preserves discoverability during the transition. Can be removed in a later cleanup pass.
3. Re-evaluate the Wrap-up phase tab's "About Wrap-up" copy if it referenced the embedded Show Map. Update to point at the new tab.
4. The Phase checklist item "Show Map is built" (Today) should now link to `?phase=show-map` rather than scroll-anchoring inside the Today tab.
5. Remove the `actionPhase="today"` / `actionPhase="wrap-up"` props from the two former mount sites (they're being deleted).
6. Once Phase 3 is verified, the `phase` parameter on `actionsForNode` can be deprecated — but defer that cleanup to Phase 5; keeping the parameter alive simplifies test rollback if anything regresses.

#### [ADDED] Enumerate every checklist item affected

Before opening the Phase 3 PR, audit the Today and Wrap-up phase checklists by grepping for each `PhaseChecklist` item's `onClick` / `href` / scroll-anchor target. Document the full list in the PR description. Known candidates from the live screenshot:

- "Show Map is built" (Today checklist) — currently scroll-anchors to the embedded Show Map.
- "Entries are loaded" (Today checklist) — verify destination.
- "Run order has class times" (Today checklist) — verify destination.
- "Classes are complete" (Wrap-up checklist) — verify destination.
- "Scores are accounted for" (Wrap-up checklist) — verify destination.
- "Results are reviewed" (Wrap-up checklist) — currently links to Results Control.

Each item that points at the embedded Show Map must be updated to point at `?phase=show-map`. Each item that points elsewhere is unchanged but explicitly confirmed in the PR.

#### [ADDED] Test fixture audit beyond E2E

`grep -rn "phase=today\|phase=wrap-up" apps/myk9show/src` finds unit-test fixtures that hardcode these URLs expecting Show Map to be present. Phase 3 must:

1. Run the grep before any edits.
2. Update every test fixture that asserts on embedded Show Map presence to instead navigate to `?phase=show-map`.
3. The expected hits include — but are not limited to — `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`, `apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx`, and `apps/myk9show/src/test/e2e/entities/phase2ShowDayRewalk.spec.ts`.

#### [ADDED] Rollback playbook

If a critical issue surfaces after Phase 3 merges to `main`:

1. **Immediate revert path:** `git revert <phase-3-commit-sha>` on `main`; PR with title `Revert: remove embedded Show Map from Today/Wrap-up`. Vercel auto-redeploys staging from `main` (per CLAUDE.md).
2. The new `?phase=show-map` tab from Phase 2 remains live (it ships in a separate PR and isn't reverted).
3. Users get parallel access again (the desired "rollback profile") until the issue is fixed.
4. The `actionPhase="today" | "wrap-up"` props re-appear at the original mount sites; Phase 1's three-way phase fork in `actionsForNode` is the reason the revert is safe.
5. Document the rollback trigger criteria in the Phase 3 PR description: e.g., "Revert if any secretary cannot complete a check-in / scratch / move-up flow from the new tab during a staging walk."

#### [ADDED] Staging verification gate

Phase 3 must not merge until:

1. The PR is deployed to staging (Vercel auto-deploys feature branches per CLAUDE.md).
2. A live walk of `/secretary/shows/:test-show-id?phase=show-map` confirms: tree renders, expand/collapse works, row actions open, at least one mutation (scratch or move-up) succeeds end-to-end.
3. Today and Wrap-up tabs render the new entry-point banner correctly.
4. The PR description includes a link to the staging URL and screenshots of the walk.

### Exit criterion

- Today and Wrap-up tabs no longer embed Show Map.
- Both tabs render a discoverable link/banner pointing at `?phase=show-map`.
- Phase checklist items previously scroll-anchoring to embedded Show Map now route to the new tab.
- All E2E specs (including [`phase2ShowDayRewalk.spec.ts`](../apps/myk9show/src/test/e2e/entities/phase2ShowDayRewalk.spec.ts)) updated to navigate via the new tab and pass.

### Testing

- **Unit:** Update [`ShowWorkbenchPage.test.tsx`](../apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx):
  - Today tab: assert the embedded Show Map is *no longer present*.
  - Wrap-up tab: assert the embedded Show Map is *no longer present*.
  - Both tabs: assert the "Open Show Map" link is visible and points at `?phase=show-map`.
- **E2E:** Update `apps/myk9show/src/test/e2e/entities/phase2ShowDayRewalk.spec.ts` and any other E2E spec that drives Show Map from inside Today/Wrap-up. Replace those paths with navigation to `?phase=show-map`.
- **Visual regression:** Capture a fresh screenshot of Today and Wrap-up post-removal to confirm the cards/checklists collapse cleanly into the now-shorter scroll height.

---

## Phase 4 — Audit and update cross-links

**Entry trigger:** Phase 3 merged.
**Estimated PRs:** 1.
**Risk:** Low. Pure consistency pass — every place that links to `?phase=today` or `?phase=wrap-up` because it wanted to get the user to a Show Map should now link to `?phase=show-map`.

### Scope

Audit every `?phase=` URL construction in the codebase and decide, per link, whether it should point at Today, Wrap-up, Setup, or the new Show Map tab.

### Implementation

1. Audit these known consumers (from `grep -rn "phase=" apps/myk9show/src --include='*.ts' --include='*.tsx'`):
   - [`unifiedSidebarConfig.ts:134-137`](../apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts) — sidebar links to `?phase=setup` and `?phase=today`. If the sidebar's "Today" entry is meant to surface the operational tree, add a "Show Map" sidebar entry alongside it.
   - [`ShowPhaseCard.tsx:20`](../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/ShowPhaseCard.tsx) — dashboard cards link to `?phase=${phase}`. Decide whether the dashboard should also surface a direct "Show Map" link.
   - [`showMapRoutes.ts:28`](../apps/myk9show/src/features/show-map/showMapRoutes.ts) — `getShowMapTrialScheduleHref` builds `?phase=setup` for the trial schedule action. Unrelated to the new tab; no change.
2. Update [`config/surface.ts`](../apps/myk9show/src/config/surface.ts) if it enumerates valid phase values (the `?phase=` query param is documented anywhere).
3. Add a sidebar entry for "Show Map" if and only if the team agrees it deserves promotion. If not, defer — the workbench tab is sufficient.
4. Confirm `OPEN-TODOS.md` and any sprint docs are updated to reflect the new IA.

### Exit criterion

- No remaining `?phase=today` or `?phase=wrap-up` link in the codebase exists *for the purpose of reaching Show Map*. Each remaining link is intentional (phase-checklist navigation, phase-specific desk tools).
- Sidebar discoverability decision documented (added or deferred).
- Documentation updates: `plan-ia-show-map.md` gets a footnote referencing this plan; `ia-review-show-map.md` gets an addendum.

### Testing

- **Static:** Run `grep -rn "phase=today\|phase=wrap-up\|phase=show-map\|phase=setup" apps/myk9show/src` and validate each remaining hit against the audit decisions.
- **Route:** Extend `secretaryShowPhaseRedirects.test.tsx` to confirm all four phase values resolve correctly.
- **Manual smoke:** Click every sidebar/dashboard/cross-link that targets the workbench; confirm the destination is correct.

---

## Phase 5 — Cleanup and documentation

**Entry trigger:** Phase 4 merged and observed in production / staging for at least one full show cycle.
**Estimated PRs:** 1 (small).
**Risk:** Low.

### Scope

Remove the parallel-access "Open Show Map" links from Today/Wrap-up (added in Phase 3 as a transition aid), deprecate or remove the `phase` parameter from `actionsForNode`, and update documentation.

### Implementation

1. Decide whether to keep the "Open Show Map" link in Today/Wrap-up permanently (as a contextual shortcut) or remove (cleaner). Recommendation: remove from Wrap-up (the wrap-up scaffolding cards already point to Results Control / Reports / Submit Results), keep a small one in Today (operational secretaries may appreciate the shortcut during steady-state work).
2. If no consumer passes a non-undefined `phase` to `actionsForNode` after Phase 3+4, deprecate the parameter. If the parameter still has consumers (e.g., the public Show Map for some reason), leave it.
3. Update the [`Show Map Naming Intent`](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_show_map_naming_intent.md) memory if its phrasing is now stale.
4. Add a "2026-MM-DD Show Map unified tab" addendum to [`ia-review-show-map.md`](ia-review-show-map.md) describing the new IA.
5. Update this plan's status to "Done."

### Exit criterion

- Plan marked Done.
- Documentation reflects the new IA.
- No dead code from the phase parameter or the embedded mount remnants.

### Testing

- Regression: full Show Map test suite passes; full ShowWorkbenchPage test suite passes; E2E `phase2ShowDayRewalk` passes.

---

## Plan summary

| Phase | Scope | Entry trigger | Exit criterion | Risk |
|---|---|---|---|---|
| 1 | Unified action set in `actionsForNode`; phase parameter takes 3 explicit values | PO sign-off on plan | `getRankedActions(scope, {tree})` returns merged actions | Med |
| 2 | Add 4th workbench tab "Show Map"; mount unified `ShowMapTab` | Phase 1 merged | New tab renders unified Show Map; old embedded mounts still present | Low |
| 3 | Remove embedded Show Map from Today and Wrap-up | Phase 2 merged + PO sign-off after parallel use | Embedded mounts gone; cross-links updated | Med |
| 4 | Audit `?phase=` links across the codebase; sidebar decision | Phase 3 merged | All phase URLs intentional; sidebar updated or deferred | Low |
| 5 | Cleanup and documentation | One show cycle after Phase 4 | Plan marked Done; no dead code | Low |

**Total estimated PRs:** 5.
**Critical path:** Phase 1 → Phase 2 → Phase 3 are sequential. Phase 4 can start once Phase 3 is merged. Phase 5 follows real-world observation.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unified action set produces noisy Up Next on a real show (a 100-entry show might have 30 simultaneous candidate actions) | Up Next already caps to top 4. Worth seeding a large test show during Phase 2 to validate visually. Consider the [Disambiguate repeated Up Next labels](../OPEN-TODOS.md) chip as a hard dependency. |
| Secretaries used to "Today / Wrap-up = different mental modes" experience disorientation | Phase 2 ships in parallel-access mode. PO uses both for a window before Phase 3 removes the old mounts. |
| `actionPhase='wrap-up'` consumers exist outside the two known mount sites | Phase 1 audit: `grep -rn "actionPhase\|phase:.*'wrap-up'" apps/myk9show/src` to find all callers before refactoring. Currently 0 callers outside `ShowMapTab.tsx` and its tests. |
| Wrap-up subtitle (IA-3) becomes orphaned | Phase 2 confirms the subtitle's conditional gating still fires only on `actionPhase === 'wrap-up'`. After Phase 3, no consumer passes that prop and the subtitle naturally goes away. Verify this is the desired outcome with PO — the wrap-up framing may need to move into a new home (e.g., a contextual hint inside the Show Map tab when the completion-scope filter is set to "Completed"). |
| Existing E2E spec `phase2ShowDayRewalk.spec.ts` navigates via embedded Show Map | Phase 3 explicitly updates the E2E; do not merge Phase 3 with broken E2E. |
| Pre-launch project memory notes both apps are pre-launch — bookmark URLs can break | No mitigation needed; per the [Pre-launch — no real users yet](../.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/project_prelaunch_no_users.md) memory, no live users to bookmark URLs. |

## Open questions for PO

1. **Sidebar promotion (Phase 4):** Should "Show Map" get its own top-level sidebar entry (alongside the existing show-specific phase links), or stay reachable only via the workbench tab?
2. **Wrap-up subtitle re-home (Phase 2/3):** When the wrap-up tab no longer embeds Show Map, where does the wrap-up framing message live? Options: (a) keep it on the Wrap-up phase tab itself as a contextual banner; (b) move it into the Show Map tab as a conditional hint when the filters match "completed across all days"; (c) drop it entirely. Default suggestion: (a) — keep the framing in the Wrap-up tab where it's contextually relevant.
3. **Transition-period "Open Show Map" link (Phase 3):** Keep permanently as a Today-tab shortcut, or remove in Phase 5? Default suggestion: keep a small one in Today, remove from Wrap-up.

## [ADDED] Defaults if PO defers decision

If the PO has not committed to the open questions before Phase 2 kickoff, the implementing agent should adopt these defaults rather than block:

1. **Sidebar:** do NOT add a sidebar entry in Phase 4. Defer until PO requests. (Reversal cost is low: one entry add.)
2. **Wrap-up subtitle:** adopt option (a) — move the framing copy to the Wrap-up phase tab itself as a contextual banner that explains *why* the Wrap-up tab links to Show Map for the closeout work.
3. **Transition link:** adopt the recommended split — keep in Today, remove from Wrap-up.

These defaults are explicitly reversible in Phase 5 without breaking external contracts.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Plan drafted in response to PO concern about Show Map being buried below scaffolding in Today/Wrap-up tabs. | This session |
