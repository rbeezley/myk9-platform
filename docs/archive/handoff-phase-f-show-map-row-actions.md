# Handoff — Phase F Show Map Row Action Hardening

**Date:** 2026-05-21
**Workspace:** `/Users/richardbeezley/AI Projects/myk9-platform`
**Primary plan:** [`docs/plan-phase-f-show-map-row-actions.md`](plan-phase-f-show-map-row-actions.md)

## Fresh Conversation Starter

Use this prompt in a new conversation:

> We are in `/Users/richardbeezley/AI Projects/myk9-platform`. Please continue Phase F from `docs/plan-phase-f-show-map-row-actions.md`. First read `AGENTS.md`, `docs/INTENT.md`, `OPEN-TODOS.md`, and the Phase F plan. Phase E is complete. The goal is to harden and close the remaining Show Map inline row-actions work. Start with PR 1: Keyboard Trigger + Focus Contract. Follow repo rules: TypeScript only, use `apply_patch`, update plan/tracker docs after each slice, and run focused Show Map tests plus myK9Show typecheck before PR.

## Current State

- Phase E official PDF work is complete for the current AKC Scent Work / UKC Nosework scope.
- PR #276 merged the Phase E closeout docs.
- The next product-value item is the remaining Show Map inline row-actions umbrella item in `OPEN-TODOS.md`.
- A new Phase F plan has been drafted in `docs/plan-phase-f-show-map-row-actions.md`.
- At handoff time, the Phase F plan and this handoff doc may still be uncommitted local docs unless already pushed in a later PR.

## Why Phase F Exists

The row-actions system is mostly built, but the original tracker item is broader than the shipped pieces. The remaining work is hardening and closeout, not rebuilding the action system.

Already shipped:

- `ShowMapRowActionsMenu` exists.
- Visible three-dot triggers exist on entry, class, and trial rows.
- Right-click on row whitespace opens the same menu through `openSignal`.
- Recommended section exists and uses `getRecommendedActions(node, { tree, phase })`.
- Entry actions are executable:
  - mark checked-in
  - scratch / no-show
  - move-up + undo
  - message handler
- Class/trial actions exist as navigation actions when destinations are available.

Remaining risk:

- Keyboard opening via `Enter` / `Space` is not yet proven by implementation/tests.
- Class/trial print and schedule destinations need route verification.
- Recommended-section behavior should be hardened and tested against the original spec.
- The `OPEN-TODOS.md` row-action umbrella item should only be checked off after trigger, destination, recommendation, and regression-walk requirements are covered.

## Phase F PR Breakdown

### PR 1 — Keyboard Trigger + Focus Contract

Goal: make row action surfaces keyboard-accessible without changing shipped action workflows.

Key files likely involved:

- `apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx`
- `apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx`
- `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.test.tsx`

Implementation notes:

- Add focusability to row action surfaces where appropriate.
- Open the same `ShowMapRowActionsMenu` on `Enter` / `Space`.
- Do not hijack events from nested buttons, links, inputs, textareas, selects, role buttons, or menu items.
- Preserve existing tree semantics and attributes:
  - `role="treeitem"`
  - `aria-level`
  - `aria-expanded`
  - `data-node-id`
  - `data-node-type`
  - day/completion data attributes
- Keyboard opening must not call `onAction` or `onNavigate` by itself.

Validation:

- Focused `ShowMapStructureTable` tests.
- `pnpm --filter @myk9/show typecheck`.
- `git diff --check`.

### PR 2 — Class + Trial Destination Audit

Goal: verify every class/trial row action points to the right route or is disabled with a clear reason.

Actions to verify:

- Class:
  - Open Class
  - Score Class
  - Print Check-In Sheet
- Trial:
  - Open Schedule
  - Print Trial Reports

Likely files:

- `apps/myk9show/src/features/show-map/showMapActions.ts`
- `apps/myk9show/src/features/show-map/showMapActionExecution.ts`
- related tests in `apps/myk9show/src/features/show-map/__tests__/`

Important constraint:

- Verify actual router paths before changing hrefs. Do not infer route names from action labels.

### PR 3 — Recommended Section Hardening

Goal: make Recommended row actions match the original spec and stay tied to the shared ranked-action contract.

Requirements:

- Max two recommended actions.
- Deterministic within a render.
- Why-lines come from shared action metadata.
- Full action list stays below separator.
- Phase-aware behavior flows through `actionPhase`.
- Do not create menu-local recommendation logic. If membership is wrong, fix `getRecommendedActions` or action metadata.

Likely files:

- `apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx`
- `apps/myk9show/src/features/show-map/showMapActions.ts`
- `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.test.tsx`
- `apps/myk9show/src/features/show-map/__tests__/showMapActions.test.ts`

### PR 4 — Tracker Closeout + Regression Walk

Goal: prove all three triggers and representative execution kinds work, then close the umbrella tracker item.

Required coverage:

- Triggers:
  - three-dot button
  - right-click row whitespace
  - keyboard open
- Execution kinds:
  - navigate
  - mutation
  - dialog
  - disabled navigation when no destination exists

Docs to update:

- `OPEN-TODOS.md`
- `docs/plan-phase-f-show-map-row-actions.md`

## Key Constraints From Repo Instructions

- Read `docs/INTENT.md` before UX-facing changes.
- Keep Trial Secretary feeling: "I can handle this" / "That was easy."
- No destructive default action execution.
- No hover-only actions.
- Use TypeScript only.
- Use `apply_patch` for edits.
- Do not revert unrelated changes.
- Update plan/tracker docs after each task or sprint item.
- Tests must compile cleanly.
- If test runners hang for more than 60 seconds, stop and report rather than looping.

## Known Useful Commands

```bash
cd /Users/richardbeezley/AI\ Projects/myk9-platform

# Focused tests likely needed for PR 1
cd apps/myk9show
npx vitest run src/features/show-map/__tests__/ShowMapStructureTable.test.tsx

# Typecheck
cd /Users/richardbeezley/AI\ Projects/myk9-platform
pnpm --filter @myk9/show typecheck

# Whitespace
git diff --check
```

## Current Open Decisions

- Whether to PR the Phase F plan doc first, or include it with PR 1.
- Whether PR 4 uses browser automation or remains a focused React Testing Library regression walk plus manual note.
- Exact class/trial destination routes must be verified from the current router before PR 2 changes hrefs.
