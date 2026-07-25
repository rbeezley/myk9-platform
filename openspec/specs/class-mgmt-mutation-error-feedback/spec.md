# class-mgmt-mutation-error-feedback

## Purpose

Defines visible failure feedback and double-fire protection for secretary Class
Management judge assignment and bulk class operations. Introduced by
`class-mgmt-mutation-error-surfacing` to prevent a secretary from believing a
judge assignment, bulk status change, or bulk delete succeeded when the
underlying mutation failed.
## Requirements
### Requirement: Judge-assign failure shows a visible error toast

The system SHALL show a `toast.error` when `assignJudgeMutation` fails, and
SHALL NOT leave the secretary believing the assignment succeeded.

#### Scenario: Judge assignment fails

- **WHEN** a secretary selects a judge for a class and the assignment mutation
  rejects
- **THEN** a `toast.error` is shown

#### Scenario: Judge assignment succeeds

- **WHEN** a secretary selects a judge for a class and the assignment mutation
  succeeds
- **THEN** no error toast is shown and the assignment reflects in the UI

### Requirement: Bulk class operations show visible error feedback

The system SHALL execute bulk status-change and bulk-delete operations with per-item settlement (`Promise.allSettled` semantics) and SHALL report a structured outcome summary: full success, or a partial-failure summary showing succeeded and failed counts with per-item failure reasons and a retry affordance scoped to the failed items. The system SHALL NOT silently clear the selection as if all calls succeeded, and SHALL NOT reduce failure feedback to disconnected per-mutation error toasts.

#### Scenario: A bulk status update partially fails

- **WHEN** a secretary runs a bulk status change and some of the underlying
  mutations reject
- **THEN** a summary reports succeeded and failed counts with per-item failure
  reasons, and a retry affordance re-dispatches only the failed items

#### Scenario: A bulk delete partially fails

- **WHEN** a secretary runs a bulk delete and some of the underlying mutations
  reject
- **THEN** a summary reports succeeded and failed counts with per-item failure
  reasons, and the failed items remain selected for retry

#### Scenario: All items succeed

- **WHEN** a secretary runs a bulk operation and every mutation succeeds
- **THEN** a single success summary is shown and the selection clears

### Requirement: Bulk class operations cannot be double-fired

The system SHALL ignore a bulk status-change or bulk-delete invocation while a
previous batch from the same handler is still in flight, using an in-flight
latch that is independent of mutation `isPending` timing, and SHALL disable the
corresponding bulk action controls while busy.

#### Scenario: Bulk handler invoked while a prior batch is pending

- **WHEN** a secretary triggers a bulk action while a previous bulk mutation
  from the same handler is still pending
- **THEN** the second invocation is a no-op and no additional mutations fire

#### Scenario: Bulk action controls are disabled while busy

- **WHEN** a bulk batch is in flight
- **THEN** the bulk action controls are disabled until the batch settles
