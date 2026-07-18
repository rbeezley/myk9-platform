# Inline Bulk Actions and Editable Status

> Linear: MYK9-47 — Implement Linear-style bulk actions and inline state editing

## Why

Routine operational state changes — entry status, check-in, class status — are handled inconsistently across surfaces: Entry Management already has shared scoped selection and eligibility-narrowed bulk actions, while Class Management still runs hand-rolled `useState<string[]>` selection with per-item mutation loops and `window.confirm`; admin Users ships bulk role/status actions that are `setTimeout` stubs; dogs and people tables have no selection at all despite the shared `DataTable` supporting it natively. Action definitions are re-derived per call site, so single-row menus and bulk menus cannot share eligibility or permission behavior, and there is no undo, so every routine change either interrupts with a confirm dialog or fails silently in bulk. Standardizing these existing patterns makes secretaries and stewards faster and safer for fall 2026 launch readiness, and unblocks `entry-peek-pane` (MYK9-51), which consumes the shared action contract this change produces.

## What Changes

- Introduce a shared typed entity-action layer — `EntityAction<T>` definitions (id, label, icon, variant, `applicableWhen(item)`, `unavailableReason`, handler binding) with a resolver that projects the same definition into (a) `RowAction[]` for the existing `RowActionMenu` and (b) bulk menu items with eligible-of-selected counts ("Accept 4 of 6 selected"). Entry Management's `EntryRowActionMenu`, `EntryBulkActionMenu`, and `bulkActionEligibility.ts` are refit onto it with no behavior change.
- Migrate Class Management's local selection to the shared `useBulkSelection` pattern: header checkbox with indeterminate state, select-all-visible, filter-scoped pruning, and a contextual bulk Actions menu — replacing the "Select all filtered" button and per-item loops.
- Make bulk dispatch honest everywhere it exists: `Promise.allSettled` with per-item outcomes, explicit all-selected vs eligible-subset counts, an in-flight latch preventing duplicate dispatch, and a partial-failure toast with a retry-failed affordance.
- Replace admin Users' stubbed bulk role/status actions with real mutations on this contract (or remove them if no real mutation exists).
- Extend scoped selection and bulk actions to dogs (status change, soft-delete) and people (delete, with per-item `MK001` owns-live-dogs failures reported honestly) via `DataTable`'s native selection.
- Add inline entry-status editing on Entry Management: the status badge (rendered by `status-icon-grammar`'s `StatusIcon`) becomes the direct edit affordance for frequent transitions, wrapped in an edit popover.
- Add a reusable time-boxed undo affordance for simple single and bulk state changes: undo dispatches the inverse transition through the same replicated mutation path, with a supersession check ("changed by someone else") and explicit offline-queued messaging when undo cannot be honored. Routine confirmation dialogs are removed only for transitions this undo covers.
- Trials are excluded from bulk selection: trial status is derived from class progress and trial delete is a hard cascade, so bulk state-change is meaningless and bulk delete is dangerous.

## Capabilities

### New Capabilities

- `bulk-selection-actions`: Scoped multi-selection (select-all-visible, indeterminate header state, filter pruning) and contextual bulk actions with typed shared action definitions, eligibility narrowing with exact counts, duplicate-dispatch prevention, and honest per-item success/partial-failure/retry feedback across Entry Management, Class Management, admin Users, dogs, and people.
- `inline-state-editing`: Direct inline editing of frequent status/check-in state from the badge itself, plus a time-boxed undo that reverts through the same replicated mutation path, with supersession and offline-queued honesty; confirmation dialogs are removed only where undo exists.

### Modified Capabilities

- `class-mgmt-mutation-error-feedback`: Bulk class operation failure feedback upgrades from "a `toast.error` per failed `.mutate()` call" to structured per-item outcome reporting on `Promise.allSettled` with an explicit partial-failure summary and retry-failed affordance.

## Impact

- **Affected code**: `components/ui/RowActionMenu` consumers (`EntryRowActionMenu`, `EntryBulkActionMenu`, `ClassRowActionsMenu`, admin `UserTable/RowActions`), `components/entries/management/*` (bulk bar, eligibility), `pages/secretary/ClassManagementPage.tsx` (selection rewrite), `components/admin/users/BulkActionsBar*` + `useBulkActions.ts` (de-stub), `pages/BrowseDogsPage` / `DogsTableView`, `pages/BrowsePeoplePage` / `PeopleTableView`, `components/ui/data-table` (opt-in selection), `hooks/useBulkSelection.ts`, `hooks/useEntryManagementActions.ts`, show-map undo helpers (extracted to a shared utility).
- **Dependencies**: consumes `StatusIcon` from `status-icon-grammar` (MYK9-52, merging ahead of this change) for the inline badge visual; produces the shared action contract consumed by `entry-peek-pane` (MYK9-51); reads entry status history via the existing `useEntryStatusHistory` owned by `class-entry-operational-visibility` (MYK9-20) — history is the reference for undo, never the mechanism.
- **Offline/replication**: all core entry/class/check-in mutations stay on `replicatedEntriesTable` / replication-backed paths; undo must not use `restore_entry_status` (direct Supabase update that would break offline-first).
- **No database migration. No new API. No new route or page.**

### Duplication check

This change adds no new surface: every bulk/inline affordance lands on the entity's existing canonical management page, reusing `RowActionMenu`, `useBulkSelection`, and `DataTable` selection that already exist. It consolidates (deletes Class Management's hand-rolled selection, admin Users' stubs, and inlined show-map undo copies) rather than duplicating. A link is not an alternative here because the gap is interaction consistency on the surfaces themselves, not discoverability.

### Non-goals

- No mixed-entity selection.
- No new status taxonomy, history system, or bulk backend API.
- No full inline editing of arbitrary fields — status/check-in state only.
- No command center, dashboard, or new management page.
- No bulk actions for trials.
- No per-action RBAC fields: permission gating stays at the existing route + `canManageShow` grain.
- Confirmation dialogs that collect a reason, note, or complex input are retained.
