# form-action-safety Specification

## Purpose

Keep form actions visible and operable while protecting unsaved work and making validation failures complete and accessible.

## Requirements

### Requirement: Transient notifications never obscure a persistent action bar

Transient notifications (toasts) SHALL NOT overlay, intercept pointer events on, or otherwise obscure any persistent action bar — including dialog footers, slide-out panel footers, and multi-step wizard navigation bars. Where a persistent action bar is present, the notification layer SHALL render above the page content but below that bar, or the bar's offset SHALL account for the notification's height so both remain fully visible and independently operable.

#### Scenario: Toast present while a dialog footer is on screen

- **WHEN** a toast is visible and a dialog with a sticky footer containing a primary action is open
- **THEN** the footer's primary and secondary controls remain fully visible and receive the pointer events for taps within their own bounds
- **AND** no control inside the toast receives a tap aimed at the footer

#### Scenario: Toast present during the entry wizard

- **WHEN** an "Added to cart" toast is visible on the registration wizard's class-selection step
- **THEN** the Back and Next controls remain fully visible and operable

### Requirement: Transient notifications dismiss on navigation

A transient notification SHALL be dismissed when the route changes, so it cannot persist onto an unrelated screen and interfere with that screen's controls.

#### Scenario: Toast does not survive route changes

- **WHEN** a success toast is raised on one route and the user navigates to two subsequent routes
- **THEN** the toast is no longer present on either subsequent route

### Requirement: The primary action of an action bar is never clipped

An action bar's primary control SHALL render fully within the viewport at every supported width down to 320px. Supplementary status content in the bar (for example an unsaved-changes indicator) SHALL wrap, stack, collapse to an icon, or be omitted before the primary control is allowed to overflow or truncate.

#### Scenario: Dog form footer at phone width with a status indicator

- **WHEN** the Add Dog or Edit Dog form renders at 390px width while displaying its unsaved-changes indicator
- **THEN** the primary control ("Create Dog" / "Save Changes") is entirely within the viewport with its full label visible
- **AND** the Cancel control remains visible and operable

#### Scenario: Action bar at the minimum supported width

- **WHEN** any dialog action bar renders at 320px width
- **THEN** the primary control renders fully within the viewport without horizontal page overflow

### Requirement: A form with unsaved changes guards against accidental abandonment

When a form is tracking unsaved changes, navigating away SHALL require explicit confirmation. The confirmation SHALL name what is at risk and offer both a way to stay and a way to discard. Deliberate cancellation through the form's own Cancel control SHALL remain available and SHALL NOT be blocked by this guard.

#### Scenario: Navigation attempt while the form is dirty

- **WHEN** the user has modified a field and a navigation is triggered without saving
- **THEN** a confirmation appears offering to stay on the form or discard the changes
- **AND** the changes are preserved unless discard is explicitly chosen

#### Scenario: Cancel is unaffected

- **WHEN** the user activates the form's own Cancel control with unsaved changes present
- **THEN** the form closes according to its existing cancel behavior without a duplicate navigation prompt

### Requirement: Validation summaries are legible and complete

A form-level validation summary SHALL render at a width sufficient to display its messages without collapsing to one or two words per line, and SHALL NOT hide any outstanding error behind a non-actionable counter. If a summary is condensed, the condensed affordance SHALL reveal or navigate to the hidden errors.

#### Scenario: Multiple validation errors at phone width

- **WHEN** a form is submitted at 390px with three required fields empty
- **THEN** the validation summary is legible at full available width
- **AND** every one of the three errors is either listed or reachable through an interactive control

#### Scenario: Submission blocked without a created record

- **WHEN** a required-field form is submitted while invalid
- **THEN** no record is created, the form stays open, and the errors are announced to assistive technology
