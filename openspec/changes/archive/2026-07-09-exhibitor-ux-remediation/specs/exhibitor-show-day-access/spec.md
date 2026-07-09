# exhibitor-show-day-access

## ADDED Requirements

### Requirement: Show day path never dead-ends entered exhibitors in worker jargon
When a signed-in exhibitor with entries in a show reaches the show's at-show gate without ringside access, the gate SHALL present exhibitor-voiced guidance and links to the exhibitor's own show-day information (their entries and check-in on My Shows), with the worker-passcode path presented as secondary. Gate copy for non-workers SHALL NOT assume the visitor was given a passcode.

#### Scenario: Entered exhibitor taps Show day
- **WHEN** an exhibitor with entries in a show navigates from the Show day nav item to that show and lacks ringside access
- **THEN** the page explains, in exhibitor language, where their check-in and show-day details live, and links there — the passcode prompt is available but not the primary message

#### Scenario: Visitor with no entries and no access
- **WHEN** a user with neither entries nor ringside access opens the at-show gate
- **THEN** the copy explains both audiences' paths (exhibitors → their entries; show workers → passcode) without assuming either

### Requirement: Check-in dialog speaks in exhibitor voice for exhibitors
When the check-in dialog is opened by an exhibitor for their own entry, status labels and descriptions SHALL be first-person exhibitor voice, staff-only statuses (Conflict, Pulled) SHALL NOT be selectable, and the identifying number SHALL be labeled with its actual type (confirmation number vs armband number). Staff surfaces retain the existing staff voice and full status set.

#### Scenario: Exhibitor updates own check-in
- **WHEN** an exhibitor opens check-in for their entry
- **THEN** the selectable statuses are limited to self-service ones (e.g. not checked in / checked in / at gate) with first-person labels, and no third-person "Exhibitor has…" copy is shown

#### Scenario: Identifier labeled correctly
- **WHEN** the check-in dialog header shows the entry's identifying number
- **THEN** the label matches the value's actual type and no dangling "#" placeholder renders when a number is absent
