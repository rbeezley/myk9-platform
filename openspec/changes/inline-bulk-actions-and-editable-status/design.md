## Context

The requested interaction exists in pieces today, but each surface owns its own variation:

- `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx` already has local checkbox selection, “Select All Visible,” bulk status changes, and bulk delete.
- `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx` delegates entry changes to `useEntryManagementActions`, which already exposes bulk status, bulk check-in, and inline check-in handlers. `BulkCheckInDialog` still adds a routine confirmation step.
- `EntryRowActionMenu` already provides grouped three-dot actions for one entry through the shared `RowActionMenu`; `ClassRowActionsMenu` provides the same intended pattern for classes, while some class surfaces still have local `MoreVertical` dropdowns that should be consolidated.
- `apps/myk9show/src/components/common/CheckInStatusBadge.tsx` already supports an interactive badge, while `CheckInStatusDialog` handles more involved status changes that may require notes or role-specific choices.
- `ShowDeskPeopleRoster` has a show-day “Check in all eligible” action and per-row check-in buttons.
- Existing mutation boundaries include `updateReplicatedCheckInStatus`, `useUpdateClassMutation`/`useClassStoreCompat`, `useTrialStore`, `useDogStoreCompat`, and the replicated show-desk people path. These must remain the owners of persistence and authorization.

The design therefore consolidates interaction mechanics, not domain behavior. Entry Management, Show Desk, Class Management, trial management, dog management, and people management remain the canonical owners of their work. The shared layer supplies selection state, action presentation, inline state menus, and bulk-result feedback.

The primary stakeholders are trial secretaries and gate stewards. The secretary intent is “That was easy”; the steward intent is “I’ve got this under control.” The pattern must be calm, touch-friendly, keyboard-accessible, plain-language, and usable when connectivity is poor. It must not add visible chrome to users who are not selecting or editing anything.

## Goals / Non-Goals

**Goals:**

- Establish one typed selection/action contract that can be adopted by existing management lists without creating a new page.
- Make the existing three-dot row menu the canonical single-object action surface, with shared action definitions that can project into either one-row or bulk context.
- Make routine state changes one interaction away from the row: select a state badge, choose a permitted value, and return to the list with visible feedback.
- Make bulk changes one interaction away after selection: select visible rows, open a contextual Actions menu, choose an action, and see exactly what succeeded or failed.
- Keep selection scoped to the currently rendered entity list and filtered view so a bulk action never silently includes records outside the user’s visible work set.
- Preserve role-specific permissions and existing domain transition rules.
- Preserve offline-first show-day behavior for entries, classes, and check-in through established replication-backed writers.
- Provide a phased adoption path: Entries and Classes first; Trials, Dogs, and People use the same contract after their canonical state fields and mutation owners are confirmed.

**Non-Goals:**

- No mixed selection across entity types.
- No replacement of canonical pages, no universal command center, and no second copy of entry, class, trial, dog, or people management.
- No generic inline form builder or arbitrary field editing.
- No new status values, state-transition rules, audit-history system, or persistence API in this change.
- No forced offline support for an entity whose existing persistence path is online-only; the adapter must declare that limitation honestly.

## Decisions

### 1. Use a shared selection controller and entity-owned action registries

Create a small TypeScript selection controller with the following semantics:

- selection is keyed by stable entity IDs;
- “Select all visible” selects only the current loaded/filtered rows;
- the header checkbox exposes checked, unchecked, and indeterminate states;
- changing search, filters, tabs, or the entity scope clears selection with no mutation;
- removed/unloaded rows are pruned from selection;
- selection is cleared after a successful bulk action, while failed IDs remain available for retry when practical.

Each page supplies an entity adapter rather than a global list of actions. The adapter defines the row identity, label, permissions, action availability, eligible target set, mutation function, and result wording. The shared action bar only renders actions returned by the adapter.

The same action definitions have two render contexts:

- **Single object:** render through the existing three-dot `RowActionMenu` pattern, such as `EntryRowActionMenu` and `ClassRowActionsMenu`. The menu remains visible and touch-accessible, but it contains only actions relevant to that one object.
- **Bulk:** render through the selection action bar and Actions menu, exposing only actions whose declared scope is safe for the current selection.

Editable status/check-in badges remain the direct path for frequent state changes. The plan does not add another per-row button labelled “Actions,” a second overflow menu, or a detail dialog solely to host actions.

This replaces the local selection implementation in Class Management and the separate selection/dialog paths in Entry Management incrementally. It does not move class or entry business rules into the shared component.

Alternative considered: build one generic “bulk manager” with hard-coded actions for every entity. Rejected because it would mix unrelated permissions and state semantics, make the menu grow without context, and create the command-center surface the product is explicitly avoiding.

Alternative considered: add a new visible Actions button beside every row. Rejected because the app already has a three-dot row-menu convention, and adding a second single-object affordance would make the interaction vocabulary less consistent rather than simpler.

### 2. Scope actions explicitly as all-selected or eligible-subset

An action declares whether it applies to:

- `all-selected`: every selected row must support the action; otherwise the action is disabled with a plain-language reason; or
- `eligible-subset`: the action may operate on the eligible selected rows, and the menu label/result states the exact eligible count.

The default is `all-selected` for destructive or lifecycle-changing actions. `eligible-subset` is allowed for operations such as “Check in eligible” where the existing Show Desk behavior already defines eligibility. The UI never silently presents a partial operation as if every selected row changed.

Alternative considered: silently skip incompatible rows for every action. Rejected because a secretary could believe a class or entry changed when it did not.

### 3. Use a compact popover/menu for routine badge edits

An editable state badge renders as a real button with an accessible name, visible focus, a minimum 44px target, and a small affordance that distinguishes it from a read-only badge. Activating it opens a `Popover` or `DropdownMenu` anchored to the badge. The menu lists only role- and transition-permitted values, marks the current value, and applies a routine choice immediately.

The menu does not use a full dialog for a simple state choice. Existing dialogs remain valid when the transition needs additional information, such as a withdrawal reason, notes, conflict resolution, or a complex class setting. In that case the badge action opens the existing owner dialog rather than creating a new one.

The existing `CheckInStatusBadge` is the starting primitive. Its optional click behavior should become semantically complete rather than being duplicated in each row. The current `CheckInStatusDialog` remains the fallback for note-bearing or role-specific check-in changes.

Alternative considered: make the badge itself cycle through statuses on each click. Rejected because it hides the available choices, is difficult to undo with a keyboard, and can cause accidental state changes on a show-day tablet.

### 4. Keep mutation and optimistic behavior at existing domain boundaries

The shared UI calls an adapter action; it does not write to Supabase or mutate replicated tables directly.

- Entry and check-in adapters delegate to `useEntryManagementActions`, `changeSecretaryEntryStatus`, `executeBulkStatusChange`, and `updateReplicatedCheckInStatus` as appropriate.
- Class adapters delegate to the existing class mutation hook/store path and retain server-authoritative lifecycle derivation.
- Trial, dog, and people adapters must be added only after inventory confirms their canonical management surface and mutation owner. They must use the existing `useTrialStore`, `useDogStoreCompat`, or replicated people path rather than introducing a new direct write.

For offline-capable show-day actions, the adapter performs the existing optimistic/local update and queues the established replication mutation. For online-only actions, the adapter exposes a pending state and a clear retry/error state; it must not pretend the action is durable offline.

Alternative considered: create a new bulk RPC to reduce client calls. Rejected for the initial interaction work because it would expand database/RLS surface area before the UI contract is proven. A bulk backend operation can be a separate performance change if measured show-size data demonstrates the need.

### 5. Aggregate outcomes without hiding partial failures

Bulk execution uses bounded concurrency appropriate to the existing mutation path and collects per-ID outcomes. The action bar remains pending while work is active and prevents duplicate dispatches. Completion feedback states the result in plain language, for example:

- “Checked in 8 entries.”
- “Updated 6 of 8 classes. 2 could not be updated. Retry failed.”

Failed rows retain selection when possible; successful rows are removed from the pending selection. The adapter may provide an inverse operation for a safe Undo action, but Undo is not promised for irreversible or domain-dependent actions. No routine confirmation dialog is added solely because the operation is bulk.

### 6. Preserve intent and accessibility in the visual treatment

The action bar appears only when there is a selection and is anchored consistently within the current list, with a responsive layout for tablet width. It uses the existing shadcn/ui primitives and semantic tokens. It must not rely on hover, tiny icon-only controls, raw palette colors, or a hidden keyboard shortcut.

Inline state changes use the existing state-color transition convention where already established, but the state label remains readable and is not conveyed by color alone. Pending state is shown on the initiating badge/action; background replication remains quiet. Destructive or high-impact actions retain their existing explicit styling and domain safeguards.

### 7. Roll out by owner surface, not by entity count

The first implementation slice is:

1. shared selection/action contracts and outcome handling;
2. Class Management, migrating its existing local selection/bulk status behavior;
3. Entry Management, replacing routine bulk check-in confirmation and exposing existing status/check-in actions through the action bar and badge menu;
4. focused secretary/steward browser verification.

Trials, Dogs, and People are follow-on adapter slices, each requiring a short surface/mutation inventory before code. If a surface lacks a safe canonical state action, it receives the shared selection pattern only when a useful, non-destructive action is defined; the design does not force parity for parity’s sake.

## Risks / Trade-offs

- **[Risk] Selection state diverges from filtered data.** → Clear selection on filter, tab, search, or scope changes; test the transition and prune missing IDs.
- **[Risk] Partial operations create false confidence.** → Require an explicit action scope, show eligible counts before execution, and aggregate successful/failed counts after execution.
- **[Risk] Double taps dispatch duplicate mutations.** → Latch the action while pending, disable the initiating control, and test repeated activation.
- **[Risk] Existing domain transitions reject a seemingly valid menu choice.** → Derive available values from the existing transition/permission layer; adapters must not duplicate raw enum assumptions.
- **[Risk] Offline state appears saved when it is not durable.** → Reuse replication-backed writers for core show-day data and distinguish queued local success from online-only pending/error states.
- **[Risk] Shared UI becomes too abstract or large.** → Keep the shared layer limited to selection, action presentation, inline menu state, and outcome aggregation; keep entity rules in adapters. Keep modules under the repository’s 500-line guideline.
- **[Risk] Inline menus are hard to discover or operate outdoors.** → Use readable labels, 44px targets, focus states, and a subtle edit affordance; verify at tablet viewport sizes without hover.
- **[Trade-off] No single bulk API means multiple client mutations.** → Prefer correctness and existing offline semantics first; measure and optimize separately if real show datasets require it.

## Migration Plan

No database migration is expected. The work is a UI/state consolidation over existing mutation contracts.

1. Inventory the current row shapes, permissions, existing three-dot menu renderers, and mutation owners for Entries, Classes, Trials, Dogs, and People. Record any surface that should remain dialog-driven because it needs extra information.
2. Add and test the shared selection controller, action registry types with single/bulk projections, action bar, inline state menu, and bulk outcome aggregator.
3. Migrate Class Management’s existing selection and bulk status controls first, preserving its existing actions and lifecycle semantics.
4. Migrate Entry Management’s existing bulk and inline check-in/status actions, removing only redundant routine confirmation steps and preserving the existing complex dialogs.
5. Run focused tests, typecheck/lint, and a browser walk for secretary and steward roles in connected and offline/queued states.
6. Add later entity adapters only after their owner surfaces and writes pass the same inventory and permission review.

Rollback is to remove the shared action-bar/badge-menu adoption from a surface and restore that surface’s existing controls. Because no schema or status taxonomy changes are introduced, rollback does not rewrite user data. Any adapter-specific mutation behavior must remain behind the existing domain writer so it can be reverted independently.

## Open Questions

- Which exact canonical management surface should own the first Trial, Dog, and People adapters, and which state fields are safe to expose there?
- Which existing local three-dot menus should be migrated first to the shared `RowActionMenu` wrapper, beyond Entry Management and Class Management?
- Should the first Entry Management bulk action operate on enrollment groups or individual class-entry rows? The adapter must match the current handler semantics and show the count in the same unit the user selected.
- Which class status transitions are permitted during each show lifecycle stage, and should the inline menu use the same availability as the existing class status dialog?
- For online-only Dogs/People/Trials mutations, should the UI label the action “Save”/“Update” and show pending, or should those surfaces remain out of the first rollout until replication support is available?
