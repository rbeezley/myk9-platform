## ADDED Requirements

### Requirement: Assigned scoresheet hydration is bounded and recoverable

An assigned judge’s direct scoresheet route SHALL resolve from the existing show-scoped replication path to a complete scoresheet or a recoverable terminal state. It MUST NOT display an unbounded loading skeleton after its explicit scoped load attempt completes.

#### Scenario: Assigned entry is available online

- **WHEN** an assigned judge opens a direct scoresheet route with a cold local replica while online
- **THEN** the required trial, class, entry, and dog rows hydrate and the score form renders

#### Scenario: Required row cannot be loaded

- **WHEN** the explicit scoped load completes without the class or entry
- **THEN** the page shows a plain-language recoverable error with Retry and Back actions instead of continuing the loading skeleton

#### Scenario: Offline row already exists locally

- **WHEN** the judge opens the score route offline after the required rows were previously replicated
- **THEN** the local rows render the score form without waiting for a network result

### Requirement: Full judge scoring journey is replayable without shared writes

The project SHALL provide an intercepted or disposable browser journey covering score creation, validation, correction, absence/scratch handling, advancement, completion, offline queueing, restart, reconnect, and duplicate-action protection without mutating shared staging.

#### Scenario: Offline score survives restart and reconnect

- **WHEN** the safe browser journey saves a score offline, restarts the page, and reconnects
- **THEN** the score remains in the durable queue, flushes exactly once through the guarded RPC, and the class state reconciles

#### Scenario: Shared target guard is absent

- **WHEN** the journey cannot prove its write interception or disposable target identity
- **THEN** it fails before opening or submitting the scoresheet
