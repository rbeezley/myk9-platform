# Design — Inline Bulk Actions and Editable Status

## Context

The interaction primitives this change standardizes already exist in fragments:

- `components/ui/RowActionMenu` is the canonical data-driven three-dot menu (`RowAction`: id/label/icon/onSelect/variant/disabled/hidden) with five consumers; two legacy `ThreeDotMenu` wrappers linger.
- Entry Management is the reference bulk implementation: `useBulkSelection` (indeterminate, `pruneToItems` filter pruning), `EntriesTableView` select column, `EntryBulkActionsBar`/`EntryBulkActionMenu`, `bulkActionEligibility.ts` (eligible-subset narrowing), bulk mutations riding `replicatedEntriesTable`.
- Class Management lags: hand-rolled `useState<string[]>`, a "Select all filtered" button with no header/indeterminate checkbox, no pruning, per-item `.mutate()` loops, `window.confirm` bulk delete.
- Show-map has the richest action model — `ShowMapAction` plus `resolveShowMapActionExecution` (a discriminated union with `disabledReason`) — the in-repo prior art for a declarative action layer. Its sonner undo toasts are inlined per mutation.
- Admin Users has a bulk bar whose bulk role/status actions are `setTimeout` stubs (`useBulkActions.ts:54-103`).
- Dogs and people tables render on the shared `DataTable`, which natively supports row selection (`selectable`, `rowSelection`) — they simply never opted in.
- `entry_status_history` is captured by a DB trigger on every write path; `useEntryStatusHistory` provides staff-gated reads. `restore_entry_status` exists but performs a direct Supabase update, bypassing replication.

Constraints: offline-first for core show-day mutations (entries, check-in, classes) via `@myk9/replication`; RBAC gating is deliberately coarse (route guard + `canManageShow` prop); `docs/INTENT.md` requires the secretary experience to feel fast, honest, and recoverable — no silent failures, no fake success.

Dependencies: `status-icon-grammar` (MYK9-52) supplies the `StatusIcon` visual and merges ahead of this change; `entry-peek-pane` (MYK9-51) consumes the action contract produced here; entry status history reads are owned by `class-entry-operational-visibility` (MYK9-20).

## Goals / Non-Goals

**Goals:**

- One typed action definition shared by single-row and bulk contexts per entity domain.
- Uniform scoped selection semantics (select-all-visible, indeterminate, filter pruning) on Entry, Class, admin Users, dogs, and people surfaces.
- Honest bulk dispatch: per-item outcomes, explicit eligible-of-selected counts, duplicate-dispatch latch, partial-failure reporting with retry-failed.
- Inline entry-status editing from the badge, and a reusable time-boxed undo that removes routine confirm dialogs only where it applies.

**Non-Goals:**

- Mixed-entity selection; bulk backend API; new status taxonomy or history system; trials bulk; per-action RBAC fields; inline editing of arbitrary fields; any new page/route/command center.

## Decisions

### D1. Action layer: promote a middle ground between `RowAction` and `ShowMapAction`

Introduce `EntityAction<T>`: `{ id, label, icon, variant, applicableWhen(item): boolean, unavailableReason?, run(items: T[]) }` plus a resolver with two projections:

- `toRowActions(item, handlers)` → `RowAction[]` for the existing `RowActionMenu` (unchanged component).
- `toBulkActions(selectedItems, handlers)` → bulk menu items carrying `{ eligible, selected }` counts ("Accept 4 of 6 selected"), disabled with `unavailableReason` when `eligible === 0`.

_Why not reuse `ShowMapAction` directly?_ It is node/attention-coupled (nodeId, priority bands, `createsAttention`) — domain baggage the generic layer must not carry. _Why not extend `RowAction`?_ `RowAction` is a presentational contract consumed by the menu; eligibility and dispatch belong a layer above, exactly as show-map separates `ShowMapAction` from its execution resolver. `bulkActionEligibility.ts` predicates become the entry domain's `applicableWhen` set, preserving behavior.

RBAC stays out of the action shape: gating remains route + `canManageShow`, matching the existing grain (alternative — a `permission` field per action — rejected as re-architecting RBAC inside a UI refactor).

### D2. Selection: `useBulkSelection` everywhere, `DataTable` native selection for opt-ins

Class Management drops its local `useState<string[]>` for `useBulkSelection` with `pruneToItems: true` (gaining header checkbox, indeterminate, filter pruning). Dogs and people surfaces opt into `DataTable`'s built-in `selectable`/`rowSelection`, bridged to `useBulkSelection` so the bulk bar contract is identical on every surface. No new table infrastructure.

### D3. Dispatch: `Promise.allSettled` + in-flight latch + structured outcome

All bulk handlers run eligible items through `Promise.allSettled` over the _existing single-item mutation_ for that domain (entries/check-in stay on `replicatedEntriesTable` paths; class updates via `useUpdateClassMutation`'s seam — verified replication-backed before bulk-driving it). Result folds into `{ succeeded: T[], failed: { item, error }[] }` powering one summary toast: full success, or partial failure listing counts with a "Retry failed" action that re-dispatches only the failed subset. A `useRef` in-flight latch (repo-established pattern) makes double-invocation a no-op and disables bulk controls while busy.

_Why per-item mutations rather than a batch API?_ Non-goal per the issue; per-item keeps offline queueing and conflict resolution on proven replication paths, and per-item outcomes are exactly what honest partial-failure reporting needs. The people `MK001` owns-live-dogs trigger guarantees routine partial failures, so this contract is a correctness requirement, not polish.

### D4. Admin Users stubs: make honest or delete

Bulk delete already uses real mutations and stays. Bulk role assignment wires to the real role mutation used by single-user Manage Roles; bulk status wires to the real activate/deactivate mutation. Any action with no real mutation behind it is removed rather than left simulated — a stub that fakes success violates the honesty contract this change exists to establish.

### D5. Inline status editing: edit affordance wraps `StatusIcon`

The Entry Management status badge becomes a click-to-edit popover listing the frequent transitions (resolved from the same `EntityAction` definitions, so eligibility and dispatch are identical to menu/bulk paths). Rendering is `status-icon-grammar`'s `StatusIcon`; this change owns only the edit behavior. `CheckInStatusBadge`'s existing `onClick` pattern is the precedent. Keyboard: badge is a real button, popover items focusable, 44px touch targets per `RowActionMenu`'s standard.

### D6. Undo: inverse transition through the same replicated mutation; history is reference, not mechanism

One shared helper (extracted from the inlined show-map sonner pattern): `showUndoToast({ label, undo, duration })`. Undo for a status change dispatches the _inverse transition_ through the same replicated mutation (`updateSecretaryLifecycleStatus` seam), so the DB trigger records the revert as a new history row. Guards:

- **Supersession**: before reverting, read current status; if it no longer equals the status our action produced, another actor intervened → toast "Changed by someone else — not undone" instead of reverting.
- **Offline**: if the original action is still queued locally, the toast says "Queued — will sync" and undo simply enqueues the inverse (both resolve in order), or is withheld where ordering cannot be guaranteed.

`restore_entry_status` is explicitly NOT used — it performs a direct Supabase update that bypasses replication and would break offline-first. Bulk undo reverts the succeeded subset only, item-by-item with the same supersession check.

Confirmation dialogs are removed only for transitions covered by this undo; dialogs collecting a reason/note/complex input (reject-with-reason, withdraw/refund) are retained.

### D7. Trials excluded from bulk

Trial status is derived from class progress (nothing to bulk-set) and trial delete hard-cascades classes and entries (bulk would multiply an irreversible operation). Trials keep their existing single-object dialogs.

## Risks / Trade-offs

- [Refit regressions in Entry Management, the reference implementation] → refit `EntryRowActionMenu`/`EntryBulkActionMenu` onto `EntityAction` with characterization tests asserting identical menu items, eligibility narrowing, and dispatched mutations before/after.
- [Class status write seam not replication-backed] → VERIFIED (task 2.1): `services/database/classes/reads.ts` `updateClass` is a direct Supabase write. Decision: class bulk status/delete route through `services/replication/ReplicatedClassesTable` (`updateClass` at :516, `deleteClass` at :599), not the direct seam.
- [Undo races another actor's change] → supersession check compares current status to the status this action produced; mismatch aborts with honest messaging. Last-writer-wins beyond that is accepted (consistent with existing replication conflict policy).
- [Offline undo ordering] → inverse-through-same-queue keeps ordering within the local queue; where the layer cannot guarantee it, undo is withheld with explicit messaging rather than offered dishonestly.
- [`StatusIcon` (MYK9-52) slips] → hard dependency, sequenced to merge first; inline editing tasks block on it while selection/dispatch slices proceed independently.
- [People bulk delete half-fails by design (`MK001`)] → treated as the canonical partial-failure test case; failed items list the human-readable reason ("owns registered dogs").
- [Retry-failed re-fires against changed state] → retry re-runs `applicableWhen` narrowing at dispatch time; newly ineligible items report as skipped, not errored.

## Migration Plan

Four independently mergeable slices: (1) action layer + Entry refit (no behavior change), (2) Class Management selection migration, (3) honest dispatch + admin Users de-stub + dogs/people opt-in, (4) inline editing + undo + confirm-dialog removal. No database migration; no rollback beyond normal PR revert.

## Open Questions

- Whether people-directory (`BrowsePeoplePage`) gets selection in this change or only admin Users — default: admin Users only, directory follows if a concrete secretary workflow needs it.
- Exact frequent-transition set exposed in the inline status popover (proposal: the same set `bulkActionEligibility` already narrows: accept, reject, check-in variants).
