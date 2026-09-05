## Purpose

Keep unattended secretary journey audits repeatable by resolving one canonical configured fixture while protecting credentials and reporting setup gaps precisely.

## ADDED Requirements

### Requirement: Secretary audits use canonical fixture configuration

The scheduled secretary audit instructions and reusable audit skill SHALL resolve the current secretary identity from the repository fixture helper and private environment rather than naming a legacy account or banning the canonical fixture domain.

#### Scenario: Configured fixture signs in

- **WHEN** an unattended audit starts with a valid canonical secretary fixture and private credential configuration
- **THEN** it completes the real two-step sign-in flow and records the roles actually exposed by the application
- **AND** no password, token, or other secret appears in logs or evidence

#### Scenario: Fixture configuration is missing or invalid

- **WHEN** the configured identity or credential cannot complete sign-in
- **THEN** the audit records a precise environment coverage gap without changing accounts, passwords, roles, or hosted data
