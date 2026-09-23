## Purpose

Protect sensitive person attributes from broad directory access while preserving the narrow self-service and show-paperwork workflows that legitimately require them.

## ADDED Requirements

### Requirement: Private person fields are not directory-readable

The system SHALL keep date of birth and registry junior-handler identifiers outside the broadly searchable people-directory authorization boundary.

#### Scenario: Unrelated show manager reads the directory
- **WHEN** a club admin or secretary searches people but manages no show connected to a person
- **THEN** that person's private fields are not returned

#### Scenario: Anonymous caller reads public person columns
- **WHEN** an anonymous caller reads the existing public person allowlist
- **THEN** no private person field is accessible

### Requirement: Private person fields have relationship-scoped access

The system SHALL allow a person to read and maintain their own private fields and SHALL allow authorized show staff to read private fields only for a person whose entry is connected to a show they manage.

#### Scenario: Person reads their own private profile
- **WHEN** an authenticated person reads their own private profile
- **THEN** their date of birth and junior-handler identifiers are returned

#### Scenario: Manager prepares paperwork for a related handler
- **WHEN** authorized show staff prepare paperwork for an entry whose assigned handler has private profile data
- **THEN** the staff member can read the private fields required by that paperwork

#### Scenario: Manager requests an unrelated person's private profile
- **WHEN** a manager requests private fields for a person with no entry in a show they manage
- **THEN** the request returns no private row

### Requirement: Migration preserves existing private values

The system SHALL migrate existing private values without guessing or losing registry keys and SHALL support rollback before the old columns are removed.

#### Scenario: Existing junior-handler data is migrated
- **WHEN** the expand migration runs against a person with a date of birth or supported registry identifier
- **THEN** an equivalent private record is created for that person while the legacy columns remain available during adoption
