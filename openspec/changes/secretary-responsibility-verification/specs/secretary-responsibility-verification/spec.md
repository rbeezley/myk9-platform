## ADDED Requirements

### Requirement: Secretary responsibility rows are verifiable

The project SHALL maintain a saved verification plan that maps every fall-scope secretary responsibility row to evidence, status, remediation, priority, and testing expectations.

#### Scenario: Responsibility row is audited

- **WHEN** a secretary responsibility row is reviewed
- **THEN** the verification plan records the row ID, current coverage source, evidence required, current verification state, remediation decision, priority, and test or rehearsal gate.

#### Scenario: Route evidence is insufficient alone

- **WHEN** a row has an identified route or component but lacks workflow proof
- **THEN** the row remains partial or unverified until code, test, walkthrough, print, offline, or user evidence proves the responsibility works.

### Requirement: Remediation avoids duplicate surfaces

The project SHALL require every secretary remediation slice to identify the canonical existing surface before proposing new UI.

#### Scenario: Existing surface covers the concern

- **WHEN** a remediation slice finds the same secretary job already belongs to an existing page or workflow
- **THEN** the slice uses the existing surface, link, deep link, or consolidation path unless a documented launch-risk reason justifies duplication.

### Requirement: Verification includes launch gates

The project SHALL treat fall 2026 launch verification as a separate gate from implementation completion.

#### Scenario: Implementation exists but launch evidence is missing

- **WHEN** code exists for a responsibility but required launch evidence is missing
- **THEN** the plan records the row as implementation-complete or partial with remaining verification gates instead of marking it fully Covered.
