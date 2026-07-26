## ADDED Requirements

### Requirement: Navigation descriptions render in full

Where the exhibitor navigation renders a description beneath a destination label, that description SHALL be displayed in full at every supported width — wrapping to additional lines as needed. It SHALL NOT be truncated to a single clipped line, because these descriptions exist specifically to orient users who cannot infer a destination from its label alone.

#### Scenario: Sidebar descriptions at desktop width

- **WHEN** the exhibitor sidebar renders at 1280px
- **THEN** each destination's description is fully readable rather than ending in an ellipsis

#### Scenario: Drawer descriptions at phone width

- **WHEN** the exhibitor navigation drawer is opened at 390px
- **THEN** each destination's description is fully readable

### Requirement: The payment history table fits its desktop container

The My Payments history table SHALL render every column fully within its container at desktop widths, without clipping or horizontal scrolling.

> Scope note: the **phone-width** disclosure of amount, status, and receipt is owned by `exhibitor-journey-completion` task 6.6 and is deliberately excluded here to avoid duplicating in-flight work. This requirement covers only the desktop clipping the 2026-07-24 audit found, which that task does not address.

#### Scenario: Payment history at desktop width

- **WHEN** the payment history renders at 1280px
- **THEN** no column is clipped or truncated, including the receipt column
- **AND** the table does not scroll horizontally within its container

### Requirement: The dog record leads with the dog

The dog record's default view SHALL present the dog's own identifying details before any sub-collection. Identity details SHALL be reachable without scrolling past the full tab content at any supported width, and a single action SHALL NOT be offered more than once on the same view.

> Scope note: this builds on the merged Overview/Career/Records consolidation (`exhibitor-journey-completion` slice 2, PR #1438). These are defects observed in that shipped result, not a re-plan of it.

#### Scenario: Default view shows the dog first

- **WHEN** an owner opens a dog record
- **THEN** the dog's identifying details are presented before any sub-collection such as registrations

#### Scenario: Identity details on a phone

- **WHEN** the dog record renders at 390px
- **THEN** the dog's identifying details are reachable without scrolling past the entire tab content

#### Scenario: One action offered once

- **WHEN** the dog record renders a view offering an add-registration action
- **THEN** that action appears once, with consistent wording

#### Scenario: A saved edit is verifiable

- **WHEN** an owner saves a change to a dog attribute and returns to the dog record
- **THEN** the changed attribute is visible on that record without reopening the edit form

### Requirement: Icon-only controls carry visible or persistent labels

An exhibitor-facing control whose only visual content is an icon SHALL carry a visible text label, or an equivalent persistently discoverable label that does not depend on hover. This applies to view-mode toggles and comparable controls where the icon alone does not convey the resulting change.

#### Scenario: Find Shows view toggles

- **WHEN** the Find Shows view-mode toggles render
- **THEN** each conveys its resulting view without relying on hover or prior knowledge of the icon

### Requirement: Interactive elements expose accessible names

Every interactive element on exhibitor surfaces SHALL expose a non-empty accessible name matching its visible purpose. This includes navigation links, entity card links, tab controls, and select controls.

#### Scenario: Navigation and card links are announced

- **WHEN** the accessibility tree is inspected for the exhibitor sidebar and the My Dogs list
- **THEN** every navigation link and every dog card link exposes a non-empty accessible name matching its visible text

#### Scenario: Dialog controls are announced

- **WHEN** the accessibility tree is inspected for the Add Dog dialog
- **THEN** its tab controls and select controls each expose a non-empty accessible name

### Requirement: Unavailable schedule detail is stated once, not repeated per row

Where scheduling detail (time, armband, judge) is not yet published, the schedule SHALL communicate this once for the affected scope rather than repeating placeholder text on every row. Rows SHALL show real detail as soon as it exists.

#### Scenario: Schedule before details are published

- **WHEN** an exhibitor views a show schedule in which no times, armbands, or judges are assigned
- **THEN** the unavailability is stated once for the affected scope, including when the detail is expected
- **AND** the per-row placeholders are not repeated for every entry

#### Scenario: Partially published schedule

- **WHEN** some entries have assigned times or armbands and others do not
- **THEN** entries with detail display it, and the remainder are covered by the single unavailability message
