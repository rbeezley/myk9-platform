# status-display

## Purpose

Defines the rule that entry status, check-in status, and class/scoring status each resolve their label, color, and icon through one shared classifier per domain, preserving documented role-specific copy differences, and requiring that date-derived status labels reflect the record's actual current status rather than merely the presence of a date field. Introduced by `ux-date-status-consistency` to stop page-local status maps from drifting from the shared classifiers that already exist.

## Requirements

### Requirement: Single status classifier per status domain
Entry status, check-in status, and class/scoring status SHALL each resolve their label, color, and icon through one shared classifier for that domain (`services/entryDisplay/entryDisplaySelectors.ts` + `entryStatusUiAdapter.ts` for entry status; `packages/ui/src/components/StatusBadge` or an equivalent documented shared config for other status domains). Components SHALL NOT maintain a page-local status-to-label/color map that duplicates a shared classifier's domain.

#### Scenario: Same entry status renders consistently across role-neutral surfaces
- **WHEN** an entry with a given status is displayed on two surfaces that are not documented as needing different copy
- **THEN** both surfaces show the same label, color, and icon, sourced from the shared classifier

#### Scenario: Developer adds a new place to show entry status
- **WHEN** a developer builds a new component that needs to display an entry's status
- **THEN** the component calls the shared entry-status classifier rather than switching on the raw status string with its own label/color map

### Requirement: Documented role-specific copy differences are preserved
Where a shared classifier's own documentation records an intentional wording difference between roles (e.g. exhibitor-facing "Pending Review" vs secretary-facing "Pending" for the same status), that difference SHALL be reproduced exactly by any migration onto the shared classifier, not collapsed to a single string.

#### Scenario: Migrating a page-local status map onto the shared classifier
- **WHEN** a page-local status-to-label map (e.g. in `components/exhibitor/EntryRow.tsx`) is migrated to call the shared classifier
- **THEN** the migrated output matches the pre-migration label for every status value the classifier's documentation marks as role-specific, and any other change in output is treated as a bug, not an acceptable side effect

### Requirement: Date-derived status labels reflect current status, not field presence
A UI label that is derived from a date field to imply a status (e.g. "Closes {date}" implying registration is still open) SHALL be gated on the actual current status signal (e.g. `canEnterOnline`, an explicit "closed" boolean, or equivalent), not merely on whether the date field is populated.

#### Scenario: Registration has closed but the close date is still set
- **WHEN** a show's registration has closed (its open/close-status signal indicates closed) and `entryCloseDate` is still a populated past date
- **THEN** a landing page or entry-blank document does not render "Closes {date}" as if registration were still pending; it either omits the label or shows a closed-state message

#### Scenario: No status signal is available at the render site
- **WHEN** a component has an `entryCloseDate` value but no corresponding open/closed status signal is available in its props/data
- **THEN** it renders the date (fail open on display) rather than hiding it, since a missing signal is not evidence that registration is closed

#### Scenario: Registration is still open
- **WHEN** a show's registration is currently open and `entryCloseDate` is a future date
- **THEN** "Closes {date}" renders normally, using the canonical date-formatting module for the date portion

### Requirement: Client class-status derivation agrees with the server
The client-side class/scoring-status derivations (`@myk9/core` `getClassDisplayStatus` and `@myk9/ringside` `classStatus.ts`) SHALL use the same expected/accounted-for completeness definition as the server derivation, or SHALL defer to the server's `is_scoring_finalized` signal for the "completed" verdict, so that a client never renders a class status that contradicts the server-stored status. The two client derivations SHALL agree with each other for the same inputs.

#### Scenario: Client does not contradict a server-completed class
- **WHEN** the server has set a class `completed` with `is_scoring_finalized = true`, and a client's local entry snapshot is mid-sync and still shows one entry unscored
- **THEN** the client renders the class as completed (deferring to `is_scoring_finalized`), not "in progress"

#### Scenario: Client excludes scratched entries from completeness like the server
- **WHEN** a class has all expected entries accounted-for but one scratched entry unscored
- **THEN** the client's `getClassDisplayStatus` derives "completed" (the scratched entry is excluded from expected), matching the server

#### Scenario: Core and ringside derivations match
- **WHEN** the same class entry counts are passed to `@myk9/core` `getClassDisplayStatus` and the `@myk9/ringside` classifier
- **THEN** both return the same display status
