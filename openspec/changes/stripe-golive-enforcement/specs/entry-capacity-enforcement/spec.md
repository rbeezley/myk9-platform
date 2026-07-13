## ADDED Requirements

### Requirement: All online entry write boundaries share judge-day capacity enforcement

The system SHALL make `create_online_paid_entry` and `submit_show_entries` use the same
class and judge-day advisory-lock identities and authoritative post-lock capacity calculations
before creating an entry that consumes capacity.

#### Scenario: Concurrent submissions compete for the last spot

- **WHEN** a paid-cart entry and a non-card entry concurrently target one remaining judge-day spot
- **THEN** exactly one submission SHALL create the capacity-consuming entry
- **AND** the other submission SHALL return `waitlisted` or `denied` according to class settings

#### Scenario: Class has no confirmed judge assignment

- **WHEN** an entry targets a class without a confirmed judge assignment
- **THEN** the system SHALL preserve the existing class-level entry behavior
- **AND** it SHALL NOT manufacture a judge-day capacity denial from missing assignment data

#### Scenario: Class maximum is reached before judge-day maximum

- **WHEN** `classes.max_entries` is reached even though the assigned judge-day still has capacity
- **THEN** the system SHALL return `waitlisted` when the class allows a waitlist or `denied` otherwise

#### Scenario: Concurrent waitlist insertion targets the same dog and class

- **WHEN** concurrent capacity decisions attempt to waitlist the same dog for the same class
- **THEN** the system SHALL return one active waitlist row as the idempotent outcome
- **AND** it SHALL NOT fail the complete submission with a uniqueness error

### Requirement: Capacity decisions are source-aware and authorization-bound

The system SHALL distinguish self-service, organizer, and show-desk submission sources without
inferring provenance from payment method, and it SHALL reject privileged source claims from
non-official callers.

#### Scenario: Self-service preserves mail-in reserve

- **WHEN** a self-service submission reaches the online capacity minus the configured mail-in reserve
- **THEN** the system SHALL stop creating entries from the self-service allocation
- **AND** it SHALL return `waitlisted` when the class allows a waitlist or `denied` otherwise

#### Scenario: Organizer submission consumes reserved physical capacity

- **WHEN** an authorized organizer submits a mail-in or on-behalf entry while reserved physical
  capacity remains
- **THEN** the system SHALL allow the entry to consume that physical capacity

#### Scenario: Unauthorized caller claims organizer source

- **WHEN** a caller without show-official authorization submits an entry marked `organizer` or
  `show_desk`
- **THEN** the system MUST reject the submission with an authorization error

#### Scenario: Secretary records an explicit show-desk override

- **WHEN** an authorized secretary records a show-desk entry after configured capacity is full
- **THEN** the system SHALL create the entry through the existing show-desk flow
- **AND** it SHALL return or record that a capacity override occurred

### Requirement: Batch submission returns durable per-selection outcomes

`submit_show_entries` SHALL preserve its existing idempotency contract while returning a durable
outcome for every requested dog/class selection.

#### Scenario: One batch has created, waitlisted, and denied selections

- **WHEN** capacity differs across selections in one valid batch
- **THEN** the result SHALL identify each selection as `created`, `waitlisted`, or `denied`
- **AND** only created entries SHALL appear in the legacy `entries` array

#### Scenario: Idempotent retry repeats outcomes

- **WHEN** the same `p_submission_id` is retried after a successful mixed-outcome submission
- **THEN** the system SHALL return the previously stored result
- **AND** it SHALL NOT create duplicate entries or waitlist rows

#### Scenario: Unexpected persistence failure rolls back batch

- **WHEN** validation or persistence fails for a reason other than a capacity business outcome
- **THEN** the RPC SHALL roll back entries, waitlist rows, outcomes, and idempotency state together

### Requirement: Registration follow-up uses created outcomes only

The client SHALL calculate payment records and armband assignment from created entry outcomes and
SHALL explain waitlisted or denied selections on the existing confirmation path.

#### Scenario: Waitlisted selection is not charged as submitted

- **WHEN** a non-card registration returns a waitlisted selection
- **THEN** the client SHALL exclude that selection from the recorded submitted-entry payment total
- **AND** it SHALL explain that payment is not due until a spot is offered

#### Scenario: Legacy server response remains usable

- **WHEN** the client receives the prior response shape without an `outcomes` array
- **THEN** it SHALL treat the legacy `entries` rows as created outcomes
- **AND** it SHALL preserve existing submission behavior
