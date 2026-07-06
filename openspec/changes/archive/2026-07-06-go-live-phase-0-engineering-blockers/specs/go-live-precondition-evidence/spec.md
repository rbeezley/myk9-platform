## ADDED Requirements

### Requirement: Phase 0 runbook completion is evidence-gated

The system SHALL keep Go Live Runbook Phase 0 item status aligned with verifiable evidence rather
than local intent or unmerged work.

#### Scenario: Agent-owned code work is prepared but not merged

- **WHEN** an agent-owned Phase 0 fix has local commits or an open PR but is not merged
- **THEN** the runbook item remains unchecked and references the open PR or pending evidence

#### Scenario: Shared-system mutation is not approved

- **WHEN** a Phase 0 item requires `supabase db push`, an edge-function deploy, a secret change, or
  another shared-system write that has not been explicitly approved and executed
- **THEN** the runbook item remains unchecked and lists the exact blocked approval gate

#### Scenario: Completion evidence exists

- **WHEN** code is merged, required shared-system mutations are approved and executed, and the
  runbook's verification command or staging/runtime evidence passes
- **THEN** the corresponding runbook item may be marked complete with evidence links or commands

### Requirement: Edge-function drift deploy prep prevents clobbering deployed-ahead code

The system SHALL refresh edge-function drift evidence before recommending repo-ahead deploys.

#### Scenario: Function exists only in deployed inventory

- **WHEN** drift audit finds a deployed function with no matching repo source
- **THEN** the batch records the function as deployed-only and does not issue a deploy command that
  would clobber it

#### Scenario: Function source is repo-ahead

- **WHEN** drift audit finds repo source that is not deployed and has no deployed-ahead conflict
- **THEN** the batch may prepare a confirmation-gated deploy command and smoke-check plan

#### Scenario: Function is deployed-ahead

- **WHEN** byte-level diff shows deployed code that matches no repo commit or local source
- **THEN** the deploy path stops until the deployed artifact is recovered into source or explicitly
  accepted by the operator

### Requirement: Yellow scorecard rows stay open until named evidence exists

The system SHALL keep Phase 0.7 and Phase 4 scorecard close-out items open until their named
evidence gates have been met or explicitly accepted.

#### Scenario: Motion code is complete but evidence gates remain

- **WHEN** motion-consistency code is complete but show-day, offline, print, real-user, or other
  scorecard evidence gates remain Yellow
- **THEN** the runbook records the completed code evidence but keeps the broader item open

#### Scenario: Operator evidence is unavailable

- **WHEN** venue hardware, real-user testing, dashboard, or live-money evidence has not been gathered
- **THEN** the batch records the missing operator evidence instead of marking the scorecard row Green
