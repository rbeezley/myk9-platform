## Purpose

Ensure operational show-day paperwork names the person assigned to handle each entry so gate calls and ring coordination match the entry record.

## ADDED Requirements

### Requirement: Operational paperwork prints the assigned handler

Check-in sheets and run orders SHALL display the entry's assigned handler when present and SHALL fall back to the dog's owner only when the entry has no assigned handler.

#### Scenario: Assigned handler differs from owner

- **WHEN** an entry names a handler who is not the dog's owner
- **THEN** the printed check-in and run-order handler name is the assigned handler

#### Scenario: Legacy entry has no assigned handler

- **WHEN** an entry has no assigned handler identity or handler text
- **THEN** the printed handler name falls back to the dog's owner

#### Scenario: Assigned identity cannot be resolved

- **WHEN** an entry has an assigned handler identity that is unavailable in the local people cache
- **THEN** the printed and show-day handler remains unknown rather than showing the dog's owner

### Requirement: Show-day identity is available offline

At-show class and quick-advance reads SHALL render replicated queue state and cached identity without waiting for online financial, result-release, or enrollment reads.

#### Scenario: Connection stalls during a show

- **WHEN** replicated entries are available and an online enrichment request does not resolve
- **THEN** the class list and quick-advance candidates still render local run order, ring state, and handler identity

### Requirement: Handler precedence is consistent across paperwork

Every organization-specific entry form or gazette section that labels a handler SHALL use the assigned handler before the owner fallback.

#### Scenario: Organization form renders owner and handler

- **WHEN** the assigned handler differs from the owner
- **THEN** the form preserves distinct owner and handler names in their respective fields
