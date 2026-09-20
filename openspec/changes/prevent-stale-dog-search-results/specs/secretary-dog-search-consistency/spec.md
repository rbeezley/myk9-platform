## Purpose

Keep secretary dog-search state truthful when overlapping requests resolve out of order, so the applied filter and visible roster always describe the same query.

## ADDED Requirements

### Requirement: The latest dog search owns the visible result

The secretary dog picker SHALL display results for the latest normalized search and SHALL NOT let an older request overwrite them after the applied search changes.

#### Scenario: Unfiltered response finishes after filtered response

- **WHEN** an unfiltered dog request begins, a filtered request begins later, and the unfiltered response finishes last
- **THEN** the visible rows remain the filtered result
- **AND** the applied search indicator matches those rows

#### Scenario: Search is cleared

- **WHEN** the secretary clears the search after a filtered request begins
- **THEN** the eventual filtered response does not replace the current unfiltered result

### Requirement: Superseded requests do not become user-visible errors

Cancelling or discarding a superseded dog request SHALL NOT surface an error toast or empty-state failure for the current search.

#### Scenario: Search request is superseded

- **WHEN** a pending search is cancelled because the secretary types a newer query
- **THEN** the current query continues normally without an error attributed to the cancelled request
