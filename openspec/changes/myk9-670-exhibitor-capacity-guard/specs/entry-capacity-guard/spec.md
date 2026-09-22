## ADDED Requirements

### Requirement: User-supplied late-entry parameters do not disable exhibitor capacity checks

The registration wizard SHALL keep class-capacity checking enabled for exhibitor workflows regardless of late-entry query parameters, while preserving the intentional bypass for authorized non-exhibitor late-entry workflows.

#### Scenario: Exhibitor appends late-entry parameters

- **WHEN** an exhibitor opens registration with `?source=show-desk&entryMode=late`
- **THEN** class availability and fullness guards remain enabled

#### Scenario: Organizer performs late entry

- **WHEN** a non-exhibitor workflow legitimately uses the late-entry parameters
- **THEN** the established organizer capacity-check behavior remains unchanged
