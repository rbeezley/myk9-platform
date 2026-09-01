# checkout-payment-verification-recovery Specification

## ADDED Requirements

### Requirement: Successful checkout verification eventually converges

The checkout confirmation surface SHALL automatically re-check a parked verification result within a bounded, tested interval and SHALL render the success state when the same checkout session becomes readable and successful.

#### Scenario: Order becomes readable after the initial poll window

- **WHEN** the initial verification window returns no readable order for a valid checkout session
- **AND** a later automatic re-check returns a successful order for that same session
- **THEN** the page SHALL render the existing successful checkout confirmation without requiring a manual action
- **AND** the page SHALL not instruct the exhibitor to submit another payment

#### Scenario: Background recovery reaches its bound

- **WHEN** every bounded background re-check remains unresolved
- **THEN** the page SHALL stop background checks at the configured bound
- **AND** the page SHALL retain an explicit manual status-check action

### Requirement: Verification checks remain safe and truthful

The checkout confirmation flow SHALL serialize overlapping checks, ignore stale results after navigation or a newer verification generation, and SHALL distinguish unresolved, processing, failed, refunded, and successful outcomes using the existing truthful copy.

#### Scenario: Focus overlaps a scheduled check

- **WHEN** the tab regains focus while a scheduled verification request is in flight
- **THEN** the flow SHALL not issue a second concurrent request
- **AND** a successful result SHALL settle the page without a later failure reopening the issue state

#### Scenario: Persistent unresolved verification

- **WHEN** all automatic checks finish without proving a successful, processing, failed, or refunded order
- **THEN** the page SHALL show the existing unresolved-payment guidance
- **AND** it SHALL warn the exhibitor not to submit another payment
