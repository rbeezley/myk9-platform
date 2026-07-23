## ADDED Requirements

### Requirement: Decision actions are visible in the primary-work panel

The focused registration's primary-work panel SHALL render explicit Accept and Reject actions whenever the registration's recommended action is a review decision, acting on the same affected entry set and handlers as the existing overflow-menu verbs.

#### Scenario: Needs-review registration shows Accept and Reject

- **WHEN** a secretary focuses a registration whose entries need review
- **THEN** the primary-work panel shows an Accept button and a Reject button
- **AND** activating Accept applies the same status change as the overflow menu's accept action for the same entry ids

#### Scenario: Panel and overflow menu share one implementation

- **WHEN** either the panel Accept or the menu accept is activated for the same registration
- **THEN** both invoke the same underlying handler
- **AND** the resulting entry statuses are identical

#### Scenario: Two-tap ceiling

- **WHEN** a secretary opens a needs-review registration from the queue
- **THEN** accepting the registration requires at most two activations (open, Accept)

### Requirement: Panel states the truth when no action is needed

The primary-work panel SHALL NOT claim entries need an action when none do.

#### Scenario: Fully processed registration

- **WHEN** a secretary focuses a registration whose entries are all processed (e.g., completed and paid)
- **THEN** the panel states no action is needed
- **AND** no Accept or Reject button renders

#### Scenario: Singular grammar

- **WHEN** exactly one entry needs the recommended action
- **THEN** the panel copy reads "1 of N Entry … needs this action" with subject–verb agreement
