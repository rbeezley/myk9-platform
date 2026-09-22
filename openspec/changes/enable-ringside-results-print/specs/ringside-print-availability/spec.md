## Purpose

Ringside print actions must reflect class-level printable data rather than whichever entry-status tab happens to be visible.

## ADDED Requirements

### Requirement: Results Sheet availability is class-scoped

The Ringside Results Sheet action SHALL be enabled whenever the current class context has at least one accounted completed entry and SHALL remain independent of the active Pending or Completed tab.

#### Scenario: Pending tab with completed class entries

- **WHEN** staff remains on the Pending tab and the class has at least one accounted completed entry
- **THEN** Results Sheet SHALL be enabled

#### Scenario: Class has no completed entries

- **WHEN** the class context has zero accounted completed entries
- **THEN** Results Sheet SHALL be disabled on every status tab

#### Scenario: Combined section view has completed entries

- **WHEN** staff views a combined A/B class context with at least one accounted completed entry
- **THEN** Results Sheet SHALL be enabled regardless of the active status or section tab
