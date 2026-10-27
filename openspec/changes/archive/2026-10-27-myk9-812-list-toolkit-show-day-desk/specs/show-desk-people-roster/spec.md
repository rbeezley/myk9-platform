## MODIFIED Requirements

### Requirement: Roster defaults to all exhibitors with operational lookup

The system SHALL default the roster to all exhibitors for the show and support
fast lookup by exhibitor name, dog name, and armband. The `All exhibitors`,
`Needs check-in`, and `Online` filters SHALL render as the shared list-toolkit
view tabs, each carrying a live count of the exhibitors it matches, and the
active view SHALL serialize to and restore from the roster's URL state so a
refresh or shared link preserves it.

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

#### Scenario: View tabs show live counts

- **WHEN** the People roster renders its view tabs
- **THEN** each of `All exhibitors`, `Needs check-in`, and `Online` shows the count of exhibitors it currently matches
- **AND** the counts are derived from the same roster rows the view filters, not a separate query

#### Scenario: Deep link into a filtered view still works

- **WHEN** the Show Desk "Check in N entries" card links to the roster with a requested view
- **THEN** the roster opens with that view already selected
- **AND** the URL reflects the active view so refreshing keeps it selected

## ADDED Requirements

### Requirement: People roster does not gain cross-exhibitor bulk selection

The People roster SHALL NOT introduce row checkboxes, a header select-all control, or a floating bulk-action bar spanning multiple exhibitors. Each exhibitor's `Check in all eligible` action SHALL remain scoped to that exhibitor's own eligible class rows.

#### Scenario: No multi-exhibitor selection exists

- **WHEN** staff views the People roster, filtered or unfiltered
- **THEN** no control lets staff select rows across more than one exhibitor at once
- **AND** `Check in all eligible` for one exhibitor never affects another exhibitor's rows
