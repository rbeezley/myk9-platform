## ADDED Requirements

### Requirement: Operator inbox represents ticket-query availability honestly

The operator Support Inbox SHALL render loading, query-error, successful-empty, and successful-data states mutually exclusively. While the ticket query is unavailable, the inbox SHALL present ticket counts as unavailable rather than zero, SHALL provide meaningful operator-facing error copy even when the underlying error message is blank, and SHALL provide a keyboard-accessible Retry action that requests the tickets again. A successful retry SHALL replace the error state with current ticket data or a genuine empty state.

#### Scenario: Ticket query fails with a populated message
- **WHEN** the ticket query fails with a non-blank error message
- **THEN** the inbox shows that message and Retry while showing unavailable counts
- **AND** it does not show ticket rows, a success-empty claim, or a no-selection claim

#### Scenario: Ticket query fails without meaningful message text
- **WHEN** the ticket query fails with a blank or whitespace-only error message, or with a non-Error value
- **THEN** the inbox shows meaningful fallback copy and a keyboard-accessible Retry action
- **AND** it does not present zero counts as observed queue totals

#### Scenario: Retry recovers with current tickets
- **WHEN** an operator activates Retry and the repeated ticket query succeeds with ticket data
- **THEN** the error state is removed and the current ticket list and detail state are shown

#### Scenario: Retry recovers with a genuine empty result
- **WHEN** an operator activates Retry and the repeated ticket query succeeds with no tickets
- **THEN** the error state is removed and the matching successful-empty state is shown

#### Scenario: Initial ticket query is loading
- **WHEN** the ticket query has not yet returned data or an error
- **THEN** the inbox shows its loading state without also showing an error, empty, or ticket-data state
- **AND** ticket counts remain unavailable until a successful result exists
