## ADDED Requirements

### Requirement: Premium publishing completes or provides actionable recovery

The canonical publish flow SHALL publish one immutable versioned premium artifact and matching show experience state for a valid show, SHALL be safe to retry after partial progress, and SHALL distinguish known correctable requirements from unknown failures without exposing technical payloads.

#### Scenario: Valid show publishes successfully

- **WHEN** an authorized organizer publishes a valid premium
- **THEN** the premium artifact and experience state are published and the user sees a clear success state

#### Scenario: Required data or configuration is missing

- **WHEN** a known required field or configuration prevents publishing
- **THEN** the UI identifies the specific correction and does not claim success

#### Scenario: Retry follows partial progress

- **WHEN** an earlier attempt uploaded the stable PDF but a later metadata step failed
- **THEN** retry converges on one artifact and complete show state without duplicate published data

#### Scenario: Unknown failure

- **WHEN** publishing fails for an unclassified reason
- **THEN** the UI offers a safe retry and logs technical evidence without exposing it to the organizer
