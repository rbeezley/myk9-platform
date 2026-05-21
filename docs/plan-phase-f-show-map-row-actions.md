# Plan — Phase F Show Map Row Action Hardening

**Date:** 2026-05-21
**Status:** In progress — PR 1 keyboard/focus slice implemented locally and validated.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This phase changes a user-facing show-day command surface in myK9Show, but it does not add database migrations, auth/RLS, payment, or cross-app behavior.

## Goal

Finish and close the remaining Show Map inline row-actions work so the show tree is a reliable command surface for secretaries during setup, show-day, and wrap-up.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): show-day changes should feel like calm, one-tap operations, not like hunting through screens during pressure.

## Current Inventory

Already shipped:

- `ShowMapRowActionsMenu` exists and renders actions from the shared ranked-action contract.
- Visible three-dot triggers are present on entry, class, and trial rows.
- Right-click on row whitespace opens the same menu instance through `openSignal`.
- The Recommended section exists and consumes `getRecommendedActions(node, { tree, phase })`.
- Entry actions for mark checked-in, scratch / no-show, move-up + undo, and message handler are executable through the shared action execution contract.
- Class and trial menu actions exist as navigation actions where destinations are available.

Remaining risk:

- Keyboard opening (`Enter` / `Space` on a focused row) is implemented in PR #278, but the tree still needs a dedicated roving-tabindex / arrow-key navigation pass before the accessibility contract is considered fully closed.
- The OPEN-TODOS row-action item is still open because the original spec included three triggers, full action inventory, and Recommended-section hardening as one umbrella item.
- Class/trial print and schedule destinations should be verified against real routes before the tracker is closed.

## Constraints

- One menu component: all triggers must open `ShowMapRowActionsMenu`.
- One priority source: Recommended row actions, Next Best Action, priority queue, and attention filtering continue to derive from `getRankedActions` / `getRecommendedActions`.
- No default destructive execution: opening a menu must never immediately execute Scratch, Move Up, or any other mutation/dialog action.
- Preserve existing dialogs and action executors. This phase should harden the surface, not rebuild shipped action workflows.
- Offline-critical mutations must keep using the existing replication / mutation pattern for their area.
- [ADDED] Accessibility remains part of the contract: row focus targets must have a visible focus ring, keyboard-opened menus must be screen-reader discoverable, and no action can be hover-only.
- [ADDED] Failure modes should stay calm: missing destinations render disabled menu items with plain-English reasons, and dialog/mutation failures keep using existing executor error handling rather than adding ad hoc toasts.
- [ADDED] Rollback is straightforward: each PR should be independently revertible without breaking already-shipped row actions because it either adds a trigger, corrects destinations, hardens recommendation rendering, or updates trackers.

## PR 1 — Keyboard Trigger + Focus Contract

Status: Complete locally on 2026-05-21. Keyboard row opening now uses the existing
`ShowMapRowActionsMenu` open signal from focused treeitems, preserves nested-control
key handling, and has focused regression coverage. PR #278 keeps per-row tab stops
for the narrow row-actions trigger; roving tabindex and arrow-key movement remain a
tracked follow-up before final Phase F accessibility closeout.

Deliverables:

- Make entry, class, and trial row action surfaces keyboard focusable where appropriate.
- Open the same `ShowMapRowActionsMenu` when `Enter` or `Space` is pressed on focused row whitespace.
- Do not hijack keyboard events from nested buttons, links, inputs, or menu items.
- Keep visible three-dot and right-click behavior unchanged.
- Add a short intent comment if the row focus behavior looks unusual in code.
- [ADDED] Preserve tree semantics: row focus changes must not remove existing `role="treeitem"`, `aria-level`, `aria-expanded`, `data-node-id`, or day/completion data attributes used by tests and running-now focus.
- [ADDED] Treat repeated keydown events as idempotent menu-open requests so holding Space does not queue multiple action executions.

Tests:

- Assert `Enter` opens the row menu for an entry row.
- Assert `Space` opens the row menu for a class row.
- Assert keyboard focus can reach a trial row and `Enter` opens its row menu.
- Assert pressing keys on nested row buttons does not open the row menu.
- [ADDED] Assert keyboard opening does not call `onAction` or `onNavigate` by itself.
- Re-run focused `ShowMapStructureTable` tests and myK9Show typecheck.

## PR 2 — Class + Trial Destination Audit

Deliverables:

- Verify each class/trial row action goes to the intended destination:
  - Class: Open Class, Score Class, Print Check-In Sheet.
  - Trial: Open Schedule, Print Trial Reports.
- Replace placeholder `node.href` reuse only where it points to the wrong place.
- Keep unavailable destinations disabled with plain-English reasons rather than linking to the wrong page.
- Do not add new routes unless an existing route cannot satisfy the action.
- [ADDED] Verify route construction against actual router paths before changing hrefs; do not infer route names from labels.
- [ADDED] Keep destination fixes limited to action href generation and execution metadata unless a route truly does not exist.

Tests:

- Unit-test class action hrefs for open / score / print actions.
- Unit-test trial action hrefs for schedule / report actions.
- Assert disabled navigation actions show the registry disabled reason when no destination exists.
- [ADDED] Assert `resolveShowMapActionExecution` never returns a navigate execution for an action without a usable href.

## PR 3 — Recommended Section Hardening

Deliverables:

- Confirm Recommended row actions are capped at two items and deterministic within a render.
- Ensure Recommended items show a concise why-line and the full action list remains below the separator.
- Ensure the first keyboard target is safe: opening the menu should focus the menu surface or first item without executing anything.
- Confirm phase-aware recommendations continue to pass `actionPhase` through to the shared ranked-action contract.
- [ADDED] Do not create a second recommendation filter in the menu. If ordering or membership is wrong, fix `getRecommendedActions` / action metadata so every consumer benefits.
- [ADDED] Keep disabled actions out of the Recommended section unless the shared recommendation contract deliberately returns them with a why-line and disabled reason.

Tests:

- Assert a row with more than two recommended candidates renders at most two in the Recommended section.
- Assert Recommended why-lines come from the shared action metadata.
- Assert Today vs Wrap-up phase changes recommendation membership only through `getRecommendedActions`.
- [ADDED] Assert disabled recommended actions, if present, cannot execute and expose their disabled reason.

## PR 4 — Tracker Closeout + Regression Walk

Deliverables:

- Add or extend a small show-map regression walk that covers all three menu triggers: three-dot, right-click, keyboard.
- Confirm the final keyboard contract either implements ARIA-style roving tabindex / arrow-key movement for the tree or carries an explicit follow-up before closing the accessibility portion of the umbrella item.
- Verify one representative action per execution kind:
  - `navigate`
  - `mutation`
  - `dialog`
  - disabled navigation when no destination exists
- Update `OPEN-TODOS.md` to mark the inline row-actions umbrella item complete only after the trigger, action inventory, and Recommended-section requirements are covered.
- Update this plan with shipped PR numbers.
- [ADDED] Include the remaining known manual check in the closeout note if browser automation cannot cover it reliably, rather than silently claiming full live-walk coverage.

Tests:

- Run focused Show Map unit/integration tests.
- Run myK9Show typecheck.
- If the regression walk uses browser tooling, capture a short note about viewport and route tested.
- [ADDED] Run `git diff --check` before every PR; run myK9Show lint only if touched files are expected to be lint-clean under current repo debt.

## Out Of Scope

- Rebuilding move-up, scratch/no-show, message handler, or mark checked-in workflows.
- Adding new destructive actions without a dialog/sheet confirmation path.
- Replacing the show-map tree with a different command center.
- Designing a detail pane. The earlier plan explicitly deferred detail-pane reconsideration until after a real show-day walk-through.
