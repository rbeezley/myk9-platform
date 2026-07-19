# bulk-selection-actions Specification

## Purpose

Defines scoped multi-selection and contextual bulk actions across the secretary/admin management surfaces (Entry Management, Class Management, admin Users, dogs). Selection is uniform (select-all-visible, indeterminate header, filter pruning) and never spans entity types. Actions are shared typed definitions resolved into both the per-row `RowActionMenu` and the bulk menu, so single-object and bulk contexts cannot diverge in eligibility or dispatch. Bulk scope is explicit (all-selected vs eligible-subset with exact counts), dispatch is duplicate-safe and reports honest per-item success/partial-failure/retry outcomes, and core mutations stay on established replication-backed paths. Introduced by `inline-bulk-actions-and-editable-status` (MYK9-47).
## Requirements
### Requirement: Shared typed action definitions drive single-row and bulk menus

The system SHALL define entity actions once as typed definitions (id, label, icon, variant, eligibility predicate, unavailable reason, handler binding) and SHALL resolve the same definition into both the per-row `RowActionMenu` actions and the bulk Actions menu items, so single-object and bulk contexts cannot diverge in eligibility or dispatch behavior.

#### Scenario: Row menu and bulk menu resolve from one definition

- **WHEN** an entity action (e.g. "Accept") is defined for entries
- **THEN** the Entry Management row menu and the bulk Actions menu both present it by resolving that single definition, with identical eligibility logic and the same underlying mutation handler

#### Scenario: Entry Management refit preserves behavior

- **WHEN** `EntryRowActionMenu` and `EntryBulkActionMenu` are refit onto the shared definitions
- **THEN** the visible menu items, their eligibility narrowing, and the mutations dispatched are identical to the pre-refit behavior

#### Scenario: Ineligible action explains itself

- **WHEN** an action's eligibility predicate rejects the current item or every selected item
- **THEN** the action is hidden or disabled with its unavailable reason rather than failing on dispatch

### Requirement: Scoped multi-selection is uniform across management surfaces

The system SHALL provide multi-selection on Entry Management, Class Management, admin Users, dogs, and people management surfaces with: a header checkbox supporting select-all-visible and indeterminate state, per-row checkboxes, and automatic pruning of selections that leave the current filtered scope. Selection SHALL NOT span entity types.

#### Scenario: Select all visible

- **WHEN** the user activates the header checkbox with no rows selected
- **THEN** all rows in the current filtered result set become selected

#### Scenario: Indeterminate header state

- **WHEN** some but not all visible rows are selected
- **THEN** the header checkbox renders the indeterminate state, and activating it selects the remaining visible rows or clears per the shared `useBulkSelection` contract

#### Scenario: Filter change prunes stale selections

- **WHEN** the user changes filters or search such that selected rows are no longer in the visible result set
- **THEN** those rows are removed from the selection and cannot be affected by a subsequent bulk action

#### Scenario: Class Management sheds its local selection

- **WHEN** Class Management renders after migration
- **THEN** selection behaves per this requirement (header checkbox, indeterminate, pruning) and the previous "Select all filtered" button and hand-rolled selection state are removed

### Requirement: Bulk action scope is explicit with exact counts

The system SHALL distinguish all-selected from the eligible subset for every bulk action, presenting exact counts (e.g. "Accept 4 of 6 selected") before dispatch, and SHALL apply the action only to eligible items.

#### Scenario: Partial eligibility is disclosed before dispatch

- **WHEN** 6 entries are selected and 4 are eligible for "Accept"
- **THEN** the bulk menu presents the action as applying to 4 of 6, and dispatch mutates only those 4

#### Scenario: No eligible items

- **WHEN** none of the selected items are eligible for a bulk action
- **THEN** the action is disabled with its unavailable reason and cannot dispatch

### Requirement: Bulk dispatch is duplicate-safe and reports per-item outcomes

The system SHALL prevent duplicate dispatch of a bulk action while a prior batch from the same surface is in flight, SHALL execute batches with per-item settlement rather than fail-fast, and SHALL report an honest summary: full success, or a partial-failure summary with per-item failure reasons and a retry affordance scoped to the failed items. Retry SHALL re-evaluate eligibility at dispatch time and report newly ineligible items as skipped.

#### Scenario: Double-invocation is a no-op

- **WHEN** a bulk action is triggered while a previous batch from that surface is still pending
- **THEN** the second invocation does nothing and bulk controls remain disabled until the batch settles

#### Scenario: Partial failure is reported honestly

- **WHEN** a bulk operation settles with some items failed
- **THEN** the user sees succeeded and failed counts with per-item failure reasons, and the selection is not silently cleared as if everything succeeded

#### Scenario: Retry failed subset

- **WHEN** the user activates the retry affordance after a partial failure
- **THEN** only the previously failed items are re-dispatched, and any item no longer eligible is reported as skipped rather than errored

#### Scenario: Bulk people delete blocked by ownership guard

- **WHEN** a bulk people delete includes a person who is primary owner of a live dog (database `MK001` guard)
- **THEN** that item fails with a human-readable reason (owns registered dogs) while other items proceed, and the summary reflects the split

### Requirement: Core bulk mutations remain on established offline-capable paths

Bulk operations for entries, check-in, and classes SHALL execute as per-item mutations through the existing replication-backed write paths, and SHALL NOT introduce direct-database bulk writes or a new bulk backend API.

#### Scenario: Bulk entry status change offline

- **WHEN** a secretary runs a bulk entry status change while offline
- **THEN** each item's mutation enqueues through the replicated entries path and syncs when connectivity returns, identical to the equivalent single-item changes

### Requirement: Admin Users bulk actions are real or absent

The system SHALL NOT present bulk actions that simulate success. Admin Users bulk role and bulk status actions SHALL be wired to the same real mutations used by the corresponding single-user actions, or removed.

#### Scenario: No simulated bulk action remains

- **WHEN** any bulk action on the admin Users surface completes
- **THEN** the reported outcome reflects real mutation results, and no timer-simulated ("stub") action path exists in the codebase

### Requirement: Trials are excluded from bulk selection

The system SHALL NOT offer multi-selection or bulk actions on trials, whose status is derived from class progress and whose deletion is an irreversible cascade.

#### Scenario: Trials surface has no bulk affordance

- **WHEN** a user views the trials list within a show
- **THEN** no selection checkboxes or bulk action controls are present

### Requirement: Class status changes use one canonical manual-override mutation

All user-initiated class status changes SHALL flow through a single replication-backed
mutation — from the Class Management row, Class Management bulk, and Show Map quick-action
surfaces alike — that sets the
target status together with `status_source: 'manual'` and the status-appropriate timing
fields, so the server's class-status derivation never silently overwrites a staff decision
and the write queues offline.

#### Scenario: Manual completion carries override and timing fields

- **WHEN** a secretary sets a class to Completed from any surface
- **THEN** the queued write includes the Completed status, `status_source: 'manual'`, an
  `actual_end_time` timestamp, and clears `reopened_after_closeout_at`
- **AND** a subsequent server derivation pass does not revert the status

#### Scenario: Manual start carries override and timing fields

- **WHEN** a secretary sets a class to In Progress from any surface
- **THEN** the queued write includes the In Progress status, `status_source: 'manual'`, and
  an `actual_start_time` timestamp
- **AND** `reopened_after_closeout_at` is not cleared by a start

#### Scenario: Resetting to a not-started status clears timing

- **WHEN** a secretary sets a class back to Scheduled or Upcoming
- **THEN** the queued write includes `status_source: 'manual'` and nulls both
  `actual_start_time` and `actual_end_time`

#### Scenario: Row status change works offline

- **WHEN** a secretary changes one class's status while the device is offline
- **THEN** the change is applied locally and queued for sync rather than failing on a
  network request

### Requirement: Class Management offers bulk status change with superseded-row protection

The Class Management bulk actions bar SHALL offer the class status transitions to the
eligible subset of the selection (classes not already in the target status) using the
shared action catalog and bulk dispatch, including per-run retry eligibility: a retry SHALL
skip any class whose current status no longer matches its status when the batch was first
dispatched, reporting it as no longer eligible instead of overwriting a concurrent change.

#### Scenario: Bulk status change applies to the eligible subset

- **WHEN** a secretary selects classes with mixed statuses and runs a bulk status change
- **THEN** the action label states how many of the selected classes are eligible
- **AND** only classes not already in the target status are written
- **AND** the existing bulk summary feedback reports succeeded and failed counts

#### Scenario: Retry skips superseded classes

- **WHEN** some classes fail in a bulk status batch and another user changes one failed
  class's status before the secretary retries
- **THEN** the retry re-runs only the failed classes whose current status still matches
  their status at first dispatch
- **AND** the superseded class is reported as no longer eligible and left unchanged

#### Scenario: Duplicate dispatch is prevented

- **WHEN** a bulk status batch is in flight and the secretary activates the action again
- **THEN** no second batch starts and the selection is not cleared by the ignored attempt
