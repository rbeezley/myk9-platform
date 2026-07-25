# exhibitor-sidebar-personalization Specification

## Purpose
The exhibitor sidebar greets the signed-in user by first name instead of a generic product label, with a safe fallback and no change to other roles' headers.
## Requirements
### Requirement: Sidebar header greets the exhibitor by first name

The exhibitor sidebar header SHALL display the signed-in user's first name (sourced from the existing auth context profile) in place of the generic "myK9 Exhibitor" label, falling back to "myK9 Exhibitor" when no first name is available. Other roles' header titles SHALL be unchanged.

#### Scenario: First name shown

- **WHEN** an exhibitor with profile first name "Richard" opens the app
- **THEN** the sidebar header shows Richard's name instead of "myK9 Exhibitor"

#### Scenario: Fallback without profile name

- **WHEN** an exhibitor's profile has no first name
- **THEN** the sidebar header shows "myK9 Exhibitor"

#### Scenario: Staff headers unchanged

- **WHEN** a secretary or admin opens the app
- **THEN** their sidebar header title is identical to before this change

