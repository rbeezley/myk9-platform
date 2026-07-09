# secretary-close-out-show Specification

## Purpose
Define the secretary-facing Show Desk closeout behavior for marking a show complete after results, reports, incidents, and reconciliation concerns have been reviewed. This spec preserves Show Desk as the canonical closeout surface and requires offline-first replicated mutations for the final show, trial, and class status cascade.

## Requirements
### Requirement: Secretary can close out a show from Show Desk

The system SHALL provide a secretary-facing **Close Out Show** action in the existing Show Desk closeout section when the closeout section is available.

#### Scenario: Closeout action appears in existing closeout section

- **WHEN** a show has at least one wrap-up-eligible class and the Show Desk closeout section renders
- **THEN** the section includes a **Close Out Show** action without adding a separate closeout route or page

#### Scenario: Closed show communicates completion

- **WHEN** the current show is already marked `completed`
- **THEN** the closeout action area communicates that the show is closed and does not offer another closeout mutation

### Requirement: Closeout readiness is explicit before final action

The system SHALL summarize unresolved closeout concerns before the secretary confirms closing the show.

#### Scenario: Unresolved concerns are visible

- **WHEN** result, report/submission, incident, or reconciliation concerns are present
- **THEN** the closeout action area lists those concerns in plain secretary-facing language before confirmation

#### Scenario: Secretary can still close after review

- **WHEN** unresolved concerns are present and the secretary chooses to close out the show anyway
- **THEN** the system asks for confirmation instead of silently blocking the closeout

### Requirement: Closeout cascades through show hierarchy

The system SHALL mark the show `completed` and mark non-cancelled open trials and classes under that show `completed` using replicated mutation paths.

#### Scenario: Closeout succeeds

- **WHEN** the secretary confirms **Close Out Show**
- **THEN** the system updates the show status to `completed`
- **AND** updates non-cancelled, non-completed trials and classes to `completed`
- **AND** shows a success message that the closeout was recorded and will sync through the existing offline queue

#### Scenario: Closeout update fails

- **WHEN** any show, trial, or class update fails during closeout
- **THEN** the system reports the failure in plain language and does not present the show as successfully closed
