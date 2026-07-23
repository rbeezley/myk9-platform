## ADDED Requirements

### Requirement: Queue chips remain fully reachable at narrow widths

At the cockpit's compact breakpoint, every queue chip (Needs review, Missing information, Payment due, All registrations) SHALL remain visible and activatable, and no control SHALL overlap or clip another.

#### Scenario: Chips wrap on a phone-width viewport

- **WHEN** the cockpit renders at 390 px width
- **THEN** all four queue chips are visible (wrapping to additional lines as needed)
- **AND** the density control does not overlap any chip

#### Scenario: Counts stay attached to their chips

- **WHEN** chips wrap
- **THEN** each chip keeps its count adjacent to its label

### Requirement: Registration rows stay legible at narrow widths

At the compact breakpoint, registration rows SHALL restructure so exhibitor name, dog summary, review/payment state, and the row action are each fully legible, using a single DOM copy repositioned responsively.

#### Scenario: Names are not truncated to fragments

- **WHEN** the queue renders at 390 px width
- **THEN** the exhibitor name and dog summary render on their own lines without mid-word truncation to fewer than ~20 characters

#### Scenario: One DOM copy

- **WHEN** the row renders at any width
- **THEN** the row content exists once in the DOM (no CSS-hidden duplicate copies)

#### Scenario: Tablet keeps the grid

- **WHEN** the cockpit renders at 768 px width or wider (non-compact)
- **THEN** the existing multi-column row grid renders unchanged

### Requirement: Manager entries tab links to the cockpit instead of duplicating it

For show managers, the show-details "Entries" tab SHALL present a brief entry summary and a link into Entry Management rather than a parallel entry table.

#### Scenario: Manager sees summary and link

- **WHEN** a secretary opens the show-details Entries tab
- **THEN** they see summary counts (total entries, needs review, payment due) and an "Open Entry Management" action that navigates to `/shows/:showId/entry-management`
- **AND** no duplicate full entry table renders for the manager audience

#### Scenario: Public audience unaffected

- **WHEN** an anonymous visitor views public entries for a show
- **THEN** the existing public entries rendering is unchanged
