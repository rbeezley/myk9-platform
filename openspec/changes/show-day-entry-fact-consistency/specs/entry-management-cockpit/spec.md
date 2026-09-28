# Spec Delta

## ADDED Requirements

### Requirement: Removed entries do not remain live registration work

The secretary's live registration queue and whole-show search SHALL exclude soft-deleted entry rows. A registration with no live entries SHALL not show entry counts, review state, payment due, or payment actions as live work. The historical database record SHALL remain intact. An offline loaded dataset SHALL continue to support search without an online lookup.

#### Scenario: Last entry removed

- **WHEN** the secretary removes the only entry in an unpaid registration and reloads Entry Management
- **THEN** that registration is absent from live search and payment-due work

#### Scenario: One of several entries removed

- **WHEN** one child entry in a multi-entry registration is removed
- **THEN** live counts and payment-due work use only the surviving entries

#### Scenario: Offline read after local removal

- **WHEN** removal succeeds and the secretary loses connectivity before the next download
- **THEN** the local queue does not resurrect the removed entry
