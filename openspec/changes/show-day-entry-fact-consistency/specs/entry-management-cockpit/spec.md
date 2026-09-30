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

#### Scenario: Zero rows without authorization proof

- **WHEN** a scoped sync records zero rows but an independent manager-authorized count is unavailable or disagrees
- **THEN** Entry Management does not claim the show has no entries

#### Scenario: Queued create without a cached row

- **WHEN** a day-of entry create is queued but the cold replica has no cached row
- **THEN** Entry Management does not claim the show has no entries, even if the server count is still zero

#### Scenario: Empty replica offline

- **WHEN** a previously verified empty replica is read without connectivity
- **THEN** Entry Management presents an unavailable state instead of claiming the show remains empty

#### Scenario: Server restores a removed entry

- **WHEN** the server later restores an entry that was soft-deleted here
- **THEN** a subsequent sync makes it visible without requiring a page reload
