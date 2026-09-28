# Spec Delta

## ADDED Requirements

### Requirement: Existing exhibitor show schedule states known show-day facts

For each accepted live entry, the existing show schedule SHALL show a known class start time and check-in state. It SHALL show a stored run position when assigned and explicitly say that the run position is pending when none is assigned. It SHALL NOT infer a published position from visual sort order, armband, or dogs-ahead count.

#### Scenario: New day-of entry without run order

- **WHEN** a class starts at 09:00, an accepted entry is checked in, and its stored run order is null
- **THEN** the exhibitor sees 9:00 AM, checked in, and run position pending on the existing show schedule

#### Scenario: Assigned position

- **WHEN** an entry has a stored run order of 3
- **THEN** the schedule identifies run position 3

#### Scenario: Start time unavailable

- **WHEN** the class has no start time
- **THEN** the schedule explains that timing is pending without inventing a time
