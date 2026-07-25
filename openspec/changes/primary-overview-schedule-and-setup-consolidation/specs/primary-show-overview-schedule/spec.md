## ADDED Requirements

### Requirement: Overview provides a concise public schedule

The system SHALL present a compact, read-only schedule on the primary show Overview for authenticated exhibitors and show managers without requiring access to Show Desk.

#### Scenario: Viewer opens a show Overview

- **WHEN** an authenticated exhibitor or show manager opens the primary Overview
- **THEN** a schedule summary is visible on that page
- **AND** each visible class includes its trial date, trial number when available, class/element label, start or expected time, and judge or location information when available
- **AND** the viewer can open the existing complete Classes view without a new schedule page

#### Scenario: Show has multiple trials

- **WHEN** the Overview contains classes from more than one trial
- **THEN** classes are grouped under collapsible headers that identify both trial date and trial number
- **AND** expanding or collapsing one trial does not change another trial's contents

#### Scenario: Schedule data is unavailable

- **WHEN** schedule data is loading, unavailable, or empty
- **THEN** the Overview shows an honest loading, retry/error, or no-schedule message
- **AND** it does not present unavailable data as zero classes

### Requirement: Overview schedule preserves manager editing without exposing it to exhibitors

The system SHALL expose the existing replicated schedule editing affordance from the Overview only to authorized show managers.

#### Scenario: Manager edits a scheduled start

- **WHEN** an authorized manager activates a class start-time editor on Overview
- **THEN** the scheduled time can be changed through the existing mutation/replication path
- **AND** the editor identifies the change as a scheduled or expected start update

#### Scenario: Exhibitor views the schedule

- **WHEN** an exhibitor opens the same Overview
- **THEN** schedule times are read-only
- **AND** no manager edit control or manager-only action is rendered

### Requirement: Overview retains compact show details

The system SHALL keep judges, officials, and venue/directions information discoverable on the primary Overview without requiring a Setup navigation item.

#### Scenario: Viewer checks show details

- **WHEN** a viewer opens the show Overview
- **THEN** judges, officials, and venue/directions information are available as secondary sections
- **AND** those sections do not duplicate the secretary's Show Desk class-work controls

### Requirement: Overview schedule uses shared show data

The system SHALL derive the Overview schedule from the existing show schedule query/data contract used by the application.

#### Scenario: Show Desk and Overview are compared

- **WHEN** the same show schedule is viewed in Overview and Show Desk
- **THEN** both surfaces reflect the same trial/class times and underlying class identity
- **AND** differences are limited to presentation and role-appropriate actions
