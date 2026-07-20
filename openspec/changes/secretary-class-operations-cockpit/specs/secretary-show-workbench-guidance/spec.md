## MODIFIED Requirements

### Requirement: Show Desk signals land on resolving destinations

The system SHALL show cross-Class attention and next actions only when their destination can inspect or clear the named condition, SHALL preserve the invoking Show Desk context across the round trip, and SHALL NOT change Class focus merely because a signal appears.

#### Scenario: Pending closeout signal has a resolvable target

- **WHEN** Show Desk displays a result or Class closeout pending signal
- **THEN** activating the signal lands on the relevant closeout, Results Control, report, or Class context that explains the pending item
- **AND** it does not leave the secretary on an empty Show Map filter state
- **AND** Back to Show Desk restores the selected day and focused Class

#### Scenario: Pending signal is suppressed without a target

- **WHEN** the system cannot identify a target for a pending signal
- **THEN** Show Desk does not render that signal as an actionable chip
- **AND** the secretary is not asked to tap a signal that cannot lead to the fix

#### Scenario: Print check-in recommendation requires Entries

- **WHEN** Show Desk evaluates a `Print Check-In Sheet` next action for a Class with zero Entries
- **THEN** it does not present Print as the primary recommended action
- **AND** it either chooses another useful action or explains that there are no Entries to print yet

#### Scenario: New signal does not steal focus

- **WHEN** a higher-priority signal appears while the secretary is working in a focused Class
- **THEN** the attention strip updates without navigating or selecting another Class
- **AND** the stable schedule position and focused work remain intact
