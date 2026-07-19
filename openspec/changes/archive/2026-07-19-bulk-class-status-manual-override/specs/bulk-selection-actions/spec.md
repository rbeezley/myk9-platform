# bulk-selection-actions — delta for bulk-class-status-manual-override

## ADDED Requirements

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
