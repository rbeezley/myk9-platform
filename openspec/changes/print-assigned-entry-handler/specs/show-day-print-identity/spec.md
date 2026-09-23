## Purpose

Ensure operational show-day paperwork names the person assigned to handle each entry so gate calls and ring coordination match the entry record.

## ADDED Requirements

### Requirement: Printed check-in and run-order paperwork prints the assigned handler

Printed check-in sheets and run orders SHALL display the entry's assigned handler when present and SHALL fall back to the dog's owner only when the entry has no assigned handler.

#### Scenario: Assigned handler differs from owner

- **WHEN** an entry names a handler who is not the dog's owner
- **THEN** the printed check-in and run-order handler name is the assigned handler

#### Scenario: Legacy entry has no assigned handler

- **WHEN** an entry has no assigned handler identity or handler text
- **THEN** the printed handler name falls back to the dog's owner

#### Scenario: Assigned identity cannot be resolved on a printout

- **WHEN** an entry has an assigned handler identity that is unavailable in the local people cache
- **THEN** the printed handler remains unknown rather than showing the dog's owner

### Requirement: Handler precedence is consistent across organization printouts and packets

The AKC printed entry form, gazette handler section, and scheduled emergency packet SHALL use the assigned handler before the owner fallback. An assigned but unresolved handler SHALL remain unknown on those artifacts.

#### Scenario: Organization form renders owner and handler

- **WHEN** the assigned handler differs from the owner
- **THEN** the form preserves distinct owner and handler names in their respective fields

#### Scenario: Scheduled packet uses the same identity precedence

- **WHEN** an emergency packet includes an entry with an assigned handler who differs from the dog's owner
- **THEN** the packet prints the assigned handler and uses the owner only when the entry has no assigned handler identity

### Requirement: Scope excludes interactive surfaces

This change SHALL NOT alter interactive Secretary Run Sheet behavior or the Show Desk people roster. Those live surfaces remain separate follow-up work and are not implied to show an unknown handler by this print-specific rule.

#### Scenario: Interactive surfaces remain follow-up work

- **WHEN** this printed-identity change is implemented
- **THEN** interactive Secretary Run Sheet behavior and the Show Desk people roster remain outside its acceptance criteria
