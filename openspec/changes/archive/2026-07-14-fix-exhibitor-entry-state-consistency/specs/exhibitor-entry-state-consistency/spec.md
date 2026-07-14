## ADDED Requirements

### Requirement: Existing exhibitor surfaces agree on submitted entry state

Browse Shows and Show Detail SHALL derive present-tense submitted state from the same shared lifecycle classification of active, owned, non-deleted entries. Show Detail SHALL retain owned terminal entries as history in `My Entries`, but terminal history SHALL NOT produce a present-tense `Entry Submitted` indicator or `My entry` class marker.

#### Scenario: Active owned entry

- **WHEN** an exhibitor has an active submitted entry for a show
- **THEN** Browse Shows identifies the show as entered
- **AND** Show Detail defaults to/keeps `My Entries` with the owned entry visible
- **AND** the entry's class shows the existing `My entry` indicator

#### Scenario: Terminal history is not an active entry

- **WHEN** an exhibitor has only withdrawn, scratched, completed, rejected, or pulled entries for a show
- **THEN** Show Detail keeps the owned history visible
- **AND** Browse Shows SHALL NOT present the show as actively submitted
- **AND** Classes SHALL NOT present those rows as current entries

### Requirement: Entry reads preserve non-ready state

An entry query that is loading or has failed SHALL NOT render a ready zero-entry result. Show Detail SHALL defer exhibitor entry defaulting while the canonical read is loading and SHALL present a retryable error when that read fails. Browse Shows SHALL preserve account-level entry loading/error state instead of inferring an empty entry list.

#### Scenario: Cold or loading entry read

- **WHEN** an authenticated exhibitor's account or show entry read is loading
- **THEN** the affected surface SHALL remain loading rather than state that the exhibitor has zero entries

#### Scenario: Failed show entry read

- **WHEN** the canonical Show Detail entry read fails
- **THEN** the page SHALL present a retryable entry-read error
- **AND** it SHALL NOT render an empty My Entries tab or public no-entry landing

### Requirement: Cart selections remain distinct from submitted entries

Registration/cart selections that have not been submitted SHALL remain within the existing registration workflow and SHALL display `In cart`; they SHALL NOT be counted or labelled as submitted entries outside that workflow.

#### Scenario: Selected but unsubmitted class

- **WHEN** an exhibitor selects a class during registration but has not submitted it
- **THEN** the registration surface SHALL label it `In cart`
- **AND** Browse Shows and Show Detail SHALL NOT report an entry submission from that selection
