## ADDED Requirements

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
The system SHALL show a `toast.error` for each bulk status-change or
bulk-delete `.mutate()` call that fails, rather than silently clearing the
selection as if all calls succeeded.

#### Scenario: A bulk status update fails
- **WHEN** a secretary runs a bulk status change and one of the underlying
  mutations rejects
- **THEN** a `toast.error` is shown for that failure

#### Scenario: A bulk delete fails
- **WHEN** a secretary runs a bulk delete and one of the underlying mutations
  rejects
- **THEN** a `toast.error` is shown for that failure

### Requirement: Bulk class operations cannot be double-fired
The system SHALL ignore a bulk status-change or bulk-delete invocation while a
previous batch from the same handler is still in flight, and SHALL disable the
corresponding bulk action buttons while busy.

#### Scenario: Bulk handler invoked while a prior batch is pending
- **WHEN** a secretary triggers a bulk action while a previous bulk mutation
  from the same handler is still pending
- **THEN** the second invocation is a no-op and no additional mutations fire

#### Scenario: Bulk action buttons are disabled while busy
- **WHEN** a bulk mutation is in flight
- **THEN** the bulk action buttons are disabled until it resolves
