# show-desk-people-roster Specification

## ADDED Requirements

### Requirement: Show Desk exposes a people roster tool

The system SHALL provide a `People at show` tool inside the existing Show Desk
Tools drawer for staff users who can manage the show.

#### Scenario: Staff opens the people tool from Show Desk

- **WHEN** a staff user opens Show Desk Tools for a show they can manage
- **THEN** the drawer includes a `People at show` tool
- **AND** the tool opens inside the existing drawer rather than navigating to a new page

#### Scenario: Ordinary tools remain compact

- **WHEN** the Tools drawer contains only ordinary tools
- **THEN** the drawer keeps its existing compact width

#### Scenario: Roster tool requests wide layout

- **WHEN** the `People at show` tool is available or open
- **THEN** the Tools drawer provides a wider roster layout on desktop
- **AND** the drawer remains usable at tablet and mobile widths without clipped primary actions

### Requirement: Roster defaults to all exhibitors with operational lookup

The system SHALL default the roster to all exhibitors for the show and support
fast lookup by exhibitor name, dog name, and armband.

#### Scenario: All exhibitors is the default filter

- **WHEN** the People roster opens
- **THEN** the selected filter is `All exhibitors`
- **AND** exhibitors without pending check-in work remain visible

#### Scenario: Search matches person dog and armband

- **WHEN** staff searches by exhibitor name, dog name, or armband number
- **THEN** the roster narrows to matching exhibitors
- **AND** matching class rows remain reachable from the exhibitor row

#### Scenario: Search has no matches

- **WHEN** staff searches for a person, dog, or armband that has no matches
- **THEN** the tool shows a plain no-results state
- **AND** the rest of Show Desk remains usable

#### Scenario: Needs check-in filter narrows by eligible rows

- **WHEN** staff selects `Needs check-in`
- **THEN** the roster shows exhibitors with at least one eligible unchecked class row
- **AND** exhibitors with no eligible unchecked class rows are hidden

#### Scenario: Online filter uses advisory presence

- **WHEN** staff selects `Online`
- **THEN** the roster shows exhibitors currently present in the show presence roster
- **AND** the UI does not imply presence is authoritative check-in status

### Requirement: Exhibitor rows show presence and class details

The system SHALL render exhibitor rows as an accordion with an advisory presence
indicator and detailed class rows.

#### Scenario: Collapsed row summarizes the exhibitor

- **WHEN** an exhibitor row is collapsed
- **THEN** it shows the exhibitor name
- **AND** it shows dog/class summary information
- **AND** it shows an accessible presence indicator dot

#### Scenario: Clicking an exhibitor expands details

- **WHEN** staff clicks a collapsed exhibitor row
- **THEN** that exhibitor expands in place
- **AND** any previously expanded exhibitor row collapses

#### Scenario: Clicking the expanded exhibitor collapses it

- **WHEN** staff clicks the currently expanded exhibitor row
- **THEN** the row collapses
- **AND** no exhibitor detail panel remains open

#### Scenario: Class rows include desk lookup facts

- **WHEN** an exhibitor row is expanded
- **THEN** each class row shows armband number, dog name, class name, and status
- **AND** ring/time information is shown when available
- **AND** missing armbands use a plain missing-value state rather than blank space

### Requirement: Staff can directly check in eligible class rows

The system SHALL allow direct check-in from the People roster for eligible
current show-day class entries using the existing replicated check-in mutation.

#### Scenario: Eligible row can be checked in

- **WHEN** an active accepted current-day class row is not checked in
- **THEN** the row shows a `Check in` action
- **AND** activating it persists through the replicated check-in status path
- **AND** the row updates to checked in after the mutation succeeds

#### Scenario: Check-in failure keeps prior state

- **WHEN** a roster check-in mutation fails
- **THEN** the affected class row keeps or returns to its previous visible status
- **AND** staff sees plain retry-oriented feedback inside the People roster

#### Scenario: Ineligible row does not show direct check-in

- **WHEN** a class row is already checked in, waitlisted, scratched, withdrawn, pulled, absent, or otherwise inactive
- **THEN** the row does not present a primary `Check in` action
- **AND** the row status explains why it is not directly check-in eligible

#### Scenario: Check in all eligible only mutates eligible rows

- **WHEN** staff activates `Check in all eligible` for an expanded exhibitor
- **THEN** every eligible unchecked class row for that exhibitor is checked in
- **AND** ineligible rows are not mutated
- **AND** the action is disabled or hidden when no eligible rows remain

#### Scenario: Partial bulk check-in failure is visible

- **WHEN** `Check in all eligible` cannot check in every eligible row
- **THEN** successfully checked-in rows remain checked in
- **AND** failed rows remain actionable or show their prior status
- **AND** staff sees feedback that not every row was checked in

### Requirement: Roster routes to existing owner surfaces

The system SHALL route messaging and full entry management work to the existing
canonical surfaces instead of duplicating those workflows inside Show Desk.

#### Scenario: Message opens existing secretary conversation

- **WHEN** staff activates `Message` for an exhibitor with a message-capable auth user
- **THEN** the system gets or creates that exhibitor's existing show message thread
- **AND** it navigates to `/secretary/messages` with the show id and thread id in the URL
- **AND** the secretary messages page selects that thread from the URL

#### Scenario: Message unavailable without auth recipient

- **WHEN** an exhibitor has no message-capable auth user
- **THEN** the `Message` action is disabled or unavailable with a plain reason

#### Scenario: Manage entries opens canonical Entry Management

- **WHEN** staff activates `Manage entries` for an exhibitor
- **THEN** the system navigates to the existing show Entry Management page
- **AND** the page applies an exhibitor/person search filter so the relevant entries are visible
- **AND** payment, scratch, move-up, refund, and broad bulk operations remain owned by Entry Management

### Requirement: People roster is covered by focused verification

The system SHALL include automated checks that pin the roster's derivation,
actions, routing, and responsive shell behavior.

#### Scenario: Unit and component coverage is present

- **WHEN** the People roster implementation is complete
- **THEN** tests cover roster grouping, search/filter derivation, check-in eligibility, accordion behavior, direct check-in callbacks, and route construction

#### Scenario: Existing routes keep deep-link state

- **WHEN** secretary messages or entry management are opened with roster-generated query params
- **THEN** focused tests verify those pages honor the params without breaking their default states

#### Scenario: Width mode is verified

- **WHEN** the Tools drawer renders the People roster
- **THEN** tests or visual verification confirm the wide mode is applied only where intended
