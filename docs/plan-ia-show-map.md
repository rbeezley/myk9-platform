# Plan — Show Map IA Remediation

**Date:** 2026-05-21
**Status:** Active. IA-1 Option A approved and implemented; remaining IA follow-ups are tracked below.
**Source audit:** [`docs/ia-review-show-map.md`](ia-review-show-map.md)
**Scope:** Address the 3 remaining High-priority findings from the show-map IA audit. Finding #2 ("Show Map" name) was withdrawn after PO confirmed sitemap-style naming was intentional.

## How to use this doc

- Phases are sized to one PR each (or one PR + a follow-up).
- Each phase has an **entry trigger** (what gates start) and an **exit criterion** (what marks done).
- Phases respect dependencies: IA-1 first because it touches an architectural commitment and may delete/redirect a route that IA-2 and IA-3 affordances would otherwise be added to.
- Every phase has a **Testing** section. Per [`CLAUDE.md`](../CLAUDE.md): no phase is complete until its tests are written and passing.

## Architectural commitments these phases must respect

Carried forward from [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md):

1. **Single shared priority function** — `getRankedActions(scope, state)` in [showMapActions.ts](../apps/myk9show/src/features/show-map/showMapActions.ts) remains the only source of action ranking. No phase introduces a parallel ranker.
2. **Single shared attention function** — [attention.ts](../apps/myk9show/src/features/show-map/attention.ts) remains the only source of "needs attention" classification.
3. **Show-centric mental model** — All single-show management UI lives under `/secretary/shows/:showId`. Phase IA-1 closes the Show Map row-action hole in this commitment.

---

## Phase IA-1 — Resolve public-vs-secretary action duplication

**Status:** Implemented via Option A.
**Entry trigger:** PO sign-off on Option A (2026-05-22).
**Estimated PRs:** 1 (plus a small follow-up for redirect telemetry if Option B is chosen).

### Problem recap

`ShowMapTab` is rendered with `canManageShow={canManageShow}` in **both**:

- Public: [ShowDetailsPage.tsx](../apps/myk9show/src/pages/ShowDetailsPage.tsx), behind the tab `'map'` gated by `canShowMap = features.showMap && canManageShow`.
- Secretary: [ShowWorkbenchPage.tsx](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx), in the Today and Wrap-up workbench phases.

A manage-capable user can scratch / move-up / message-handler from either route, contradicting the show-centric IA commitment.

### Option A — View-only public map (recommended default)

The public route keeps the "Show Map" tab visible to manage-capable staff as a preview but **renders the tree without manage actions**. Manage users can still browse the structure from the public route; to take action, they go to `/secretary/shows/:showId`.

**Implementation:**

1. In [`ShowDetailsPage.tsx`](../apps/myk9show/src/pages/ShowDetailsPage.tsx), pass `canManageShow={false}` to the public `ShowMapTab` mount regardless of the user's actual permission.
2. Keep the `canShowMap` gate manage-scoped for now so exhibitors keep the current public details experience.
3. Inside `ShowMapTab`, make `canManageShow={false}` hide row-action menus, priority-queue execution affordances, dialogs, and setup actions while preserving the structural tree.
4. Add a "Manage in Workbench" link on public show details for users who _do_ have manage rights — preserves discoverability of the canonical home.
5. Add a "Preview public page" link on the workbench so staff can intentionally inspect the exhibitor-facing route.

**Precedent:** This mirrors the existing manage-vs-view pattern in the same file — `EntriesTab` vs `MyEntriesTab`.

**Trade-offs:**

- ✅ Public users gain a structural view of any show (potentially valuable for exhibitors browsing competitor shows).
- ✅ Architectural commitment respected — management happens only in `/secretary/shows/:showId`.
- ⚠️ Manage users may briefly try to take action on the public route and be confused when they can't. Mitigated by the "Manage in Workbench" link.

### Option B — Remove map tab from public route for manage users

The public route still shows a "Show Map" tab for _non-manage_ users (view-only). For manage-capable users, the tab is hidden, OR clicking it redirects to `/secretary/shows/:showId?phase=today`.

**Implementation:**

1. Keep `canShowMap` gated on `features.showMap`, drop the `canManageShow` requirement.
2. Pass `canManageShow={false}` to the public mount always (same as Option A).
3. When `canManageShow` _is_ true and the user lands on `/shows/:id?tab=map`, render a redirect component pointing at `/secretary/shows/:showId?phase=today`.

**Trade-offs:**

- ✅ Strongest enforcement of the commitment.
- ⚠️ Surprising for a secretary who explicitly clicked "Show Map" on the public page and gets redirected.
- ⚠️ More moving parts (a redirect component) than Option A.

### Recommended: Option A

Option A is closer in spirit to the existing manage-vs-view patterns in the codebase, doesn't redirect users mid-click, and lets manage users use the public map for read-only browsing if that's what they want.

### Exit criterion

- The chosen option is implemented end-to-end.
- A unit test asserts that `ShowMapTab` rendered with `canManageShow={false}` exposes no executable row actions, no priority-queue Open buttons, and no dialog triggers. (Assertion-first per CLAUDE.md.)
- A component test covers a manage-capable user on `/shows/:id?tab=map` confirming the public mount passes `canManageShow={false}`.
- The audit doc [`ia-review-show-map.md`](ia-review-show-map.md) is updated: Finding #1 moves to "Resolved in IA-1."

### Testing

- **Unit:** New test in `apps/myk9show/src/features/show-map/__tests__/ShowMapTab.viewOnly.test.tsx` — render with `canManageShow={false}` and assert absence of row-action menu, dialog triggers, priority-queue execute buttons, and undo banner.
- **Integration:** Extend the existing `ShowWorkbenchPage.test.tsx` (in `apps/myk9show/src/test/pages/secretary/`) to confirm secretary route still renders actions (regression guard).
- **E2E (optional, but recommended):** New spec in `apps/myk9show/src/test/e2e/show-map-view-only.spec.ts` — log in as a manage-capable user, visit `/shows/:id?tab=map`, assert the row menu is absent; visit `/secretary/shows/:id?phase=today`, assert the menu is present.

### Why this phase first

This is the only phase that touches an explicit architectural commitment (the show-centric mental model in [`plan-show-day-sequencing.md`](plan-show-day-sequencing.md)). If we add discoverability affordances (IA-2) and wrap-up framing (IA-3) to the public mount first, we'd then have to remove them when IA-1 lands. Order is load-bearing.

---

## Phase IA-2 — Surface row-action access affordances

**Status:** Completed in PR #289.
**Entry trigger:** IA-1 no longer blocks this; the popover shipped as part of the P1-P3 IA polish slice.
**Estimated PRs:** 1.

### Problem recap

Three access paths to row actions exist:

- Three-dot menu button (discoverable)
- Right-click context menu (shipped PR #284, undiscovered)
- Keyboard shortcuts + roving tree focus (shipped PRs #278, #283, undiscovered)

Only the three-dot menu has a visible affordance. The other two are valuable for accessibility and speed but are effectively dead capabilities without surfacing.

### Implementation

1. Add a compact help/legend element to [`ShowMapToolbar.tsx`](../apps/myk9show/src/features/show-map/ShowMapToolbar.tsx). Two reasonable forms:
   - A `?` icon button that opens a popover listing the keyboard shortcuts and the right-click affordance.
   - An inline `kbd`-styled tip line shown the first time the user lands on Show Map, dismissible and persisted in localStorage.
2. Recommended: the `?` popover. Less crowded for repeat users; new users discover it by hovering the icon.
3. The popover content lists, at minimum:
   - `→` to expand a node
   - `←` to collapse a node
   - `Enter` / `Space` to open the row action menu
   - `Right-click` as an alternative to the three-dot button
4. Add a "Keyboard shortcuts" entry to the existing ShowMap `Guidance Card` if one doesn't already mention them.

### Exit criterion

- The legend / popover ships and is reachable from the toolbar.
- A user new to the surface can discover keyboard nav and right-click without reading code.
- A unit test asserts the popover renders all four shortcut entries.

### Testing

- **Unit:** New test in `apps/myk9show/src/features/show-map/__tests__/ShowMapToolbar.help.test.tsx` — render toolbar, click the `?` icon, assert popover renders with arrow keys, Enter/Space, and right-click entries.
- **Accessibility:** Confirm the popover is keyboard-reachable and has appropriate `aria-label` / `aria-describedby` wiring (the existing shadcn `Popover` primitive should handle this; verify in the test).

### Why this phase second

Discoverability is the cheapest payback in the trio. It also doesn't change behavior or routes — purely additive. Once IA-1 has consolidated the manage surface, IA-2 makes that consolidated surface power-user-friendly.

---

## Phase IA-3 — Add Wrap-up tab framing

**Status:** Implemented.
**Entry trigger:** IA-1 merged.
**Estimated PRs:** 1.

### Problem recap

The Wrap-up tab renders `ShowMapTab` with `initialDayScope="all"`, `initialCompletionScope="completed"`, and `actionPhase="wrap-up"`. No header copy explains _why_ this view defaults to completed-only. A user can toggle the toolbar's completion scope back to active and lose the wrap-up framing entirely.

### Implementation

1. In [`ShowWorkbenchPage.tsx`](../apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx), wrap the Wrap-up `ShowMapTab` mount in a `PhaseShell` with a kicker:
   > **Show structure — completed entries.** This view defaults to entries marked complete from the entire show. Widen the scope from the toolbar to see active or upcoming entries.
2. Alternatively, push the kicker _inside_ `ShowMapTab` by gating on `actionPhase === "wrap-up"` — render a one-line subtitle above the toolbar. This keeps the framing co-located with the data scope, so toggling the toolbar still leaves the wrap-up subtitle visible.
3. Recommended: the in-component subtitle (option 2). Pairs the framing with the data, not the route.

### Exit criterion

- A user landing on `/secretary/shows/:showId?phase=wrap-up` sees a one-line explanation of the default scope before they see the tree.
- A unit test asserts that `ShowMapTab` rendered with `actionPhase="wrap-up"` shows the wrap-up subtitle, and rendered without it does not.

### Testing

- **Unit:** Extend `apps/myk9show/src/features/show-map/__tests__/ShowMapTab.test.tsx` (or add `ShowMapTab.wrapUp.test.tsx`) — render with `actionPhase="wrap-up"`, assert subtitle text appears; render without, assert it does not.
- **Visual / integration:** Confirm in `ShowWorkbenchPage.test.tsx` that the Wrap-up tab's rendered output includes the subtitle string.

### Why this phase third

Cheapest fix in the trio (one or two files touched) but lowest leverage — it improves the experience for the small fraction of users who land on Wrap-up cold without context. Worth doing, but neither blocks nor is blocked by IA-2, so it can ship in parallel.

---

## Phase IA-4 (deferred) — URL-state sync and duplication verification

**Status:** Documented only. Not scheduled.
**Entry trigger:** IA-1 through IA-3 merged AND evidence that deep-linking is requested by users (currently no signal).

**Scope (if revisited):**

- URL-reflect ShowMap internal state (expanded nodes, focused row, filter, day/completion scope) so users can deep-link to a specific class node.
- Verify whether the new class-completion action (PR #287) is duplicated on a class-detail route. If yes, consolidate. If no, close this item.

**Why deferred:** URL-state sync is a non-trivial implementation, low-frequency value, and not on the show-day critical path. Class-completion verification is a 30-minute task that should be done opportunistically — not worth its own PR.

---

## Plan summary

| Phase | Scope                                                        | Entry trigger           | Exit criterion                                                              | Estimated PRs |
| ----- | ------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------- | ------------- |
| IA-1  | Public ShowMap becomes view-only (recommended Option A)      | PO sign-off on Option A | View-only behavior shipped; manage-route still has full actions; tests pass | Done          |
| IA-2  | Add `?` popover advertising right-click + keyboard shortcuts | Shipped in P1-P3 polish | Popover ships; new users discover power features                            | Done          |
| IA-3  | Wrap-up framing subtitle                                     | IA-1 merged             | Wrap-up tab renders explanatory subtitle                                    | Done          |
| IA-4  | URL-state sync + class-completion duplication check          | Deferred                | (not scheduled)                                                             | 0–1           |

**Remaining estimated effort:** Deferred IA-4 only if users ask for deep links or class-completion duplication is confirmed.

---

## Decision log

| Date       | Decision                                                                                                                | Source                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 2026-05-21 | Audit produced. Finding #2 ("Show Map" naming) withdrawn — sitemap sense was intentional per PO.                        | [`ia-review-show-map.md`](ia-review-show-map.md), this session |
| 2026-05-21 | Plan drafted with 3 phases. IA-1 awaiting PO option choice.                                                             | This doc                                                       |
| 2026-05-22 | IA-1 Option A approved: public Show Map remains a staff preview but is read-only; workbench is the operational home.    | This session                                                   |
| 2026-05-22 | IA-3 wrap-up framing implemented inside `ShowMapTab`, keeping the completed-scope explanation with the toolbar filters. | This session                                                   |

---

## 2026-05-22 Impeccable P1-P3 polish addendum

**Status:** Ready for implementation as a separate polish PR.
**Source:** `$impeccable critique` over the Phase A-F Show Map capabilities.
**Relationship to IA-1:** This addendum addressed the Today workbench and Show Map interaction clarity. IA-1 was later resolved separately with a read-only public Show Map.

### P1 — Distill the Today tab around the Show Map spine

**Problem:** The Today tab renders many peer-level operational cards before the Show Map, so the primary show-day command surface can feel buried.

**Implementation:**

1. Move the Today `ShowMapTab` immediately after the phase context / AskQ help.
2. Group secondary table tools (late entry, hospitality, broadcasts, incidents, delay script, MyK9Q access) under one compact `Desk tools` collapsible section.
3. Keep all existing tools available; this is IA weighting, not feature removal.

**Testing:** Update `ShowWorkbenchPage.test.tsx` to assert that the Show Map renders before `Desk tools`, and that desk tools remain reachable after expanding the section.

### P2 — Clarify "Next" versus the queue

**Problem:** `Next Best Action` and `Priority Queue` are both recommendation surfaces and can repeat the same top action.

**Implementation:**

1. Keep `ShowMapGuidanceCard` as the single "next action" surface.
2. Rename the queue to `Up next`.
3. Exclude the current guidance action from the queue so the first row below it does not duplicate the same command.

**Testing:** Extend `ShowMapTab.test.tsx` to assert the top guidance action is not repeated in `Up next`.

### P3 — Surface row-action affordances

**Problem:** Three-dot, right-click, and keyboard row actions work, but right-click and keyboard access are not visible to new users.

**Implementation:**

1. Add a toolbar help popover with the row-action and tree-navigation shortcuts.
2. Include at least arrow navigation, `Enter` / `Space`, and right-click.

**Testing:** Add/extend toolbar coverage to open the popover and assert the shortcut entries render.
