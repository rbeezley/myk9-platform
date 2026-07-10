# exhibitor-my-shows-legibility Specification

## Purpose
The exhibitor My Shows page stays legible and operable for elderly, low-tech, touch-first users: visible orientation, one clear next action per entry card, readable text and filters, adequate touch targets, and reassuring copy — so the page answers "what show is next, what is my status, what do I do" without interpretation.

## Requirements
### Requirement: Visible page title on all viewports

The My Shows page SHALL render a visible "My Shows" heading (not screen-reader-only) on phone, tablet, and desktop viewports, preserving correct heading order.

#### Scenario: Phone landing orientation

- **WHEN** an exhibitor opens /exhibitor/entries at 390px width
- **THEN** a visible "My Shows" heading appears at the top of the page content, alongside or above the greeting

### Requirement: Entry card leads with summary and single next action

Each entry card SHALL render an always-visible summary band containing status, dog identity, show date, location, and exactly one primary next action, with per-class detail, confirmation number, and result detail collapsed behind a labeled "Show details" control. The next action SHALL be derived by precedence: finish payment, then check-in (when a class is check-in eligible), then view show. Activating check-in from the summary SHALL use the existing check-in mutation path.

#### Scenario: Details toggle is accessible

- **WHEN** the "Show details" control renders
- **THEN** it exposes `aria-expanded` state, references its panel, and has at least a 44px hit area

#### Scenario: Pending entry reassures

- **WHEN** an entry's status is pending review
- **THEN** the summary band includes a one-line reassurance that the show secretary is reviewing the entry

#### Scenario: Card collapsed by default

- **WHEN** an entry card renders
- **THEN** status, dog, show date, location, and the next action are visible without expanding, and class rows and confirmation number are hidden until "Show details" is activated

#### Scenario: Check-in surfaced as next action

- **WHEN** an entry is fully paid and has a check-in-eligible class
- **THEN** the summary band's primary action is check-in and it performs the same mutation as the in-details check-in control

#### Scenario: Close date only while actionable

- **WHEN** an entry's editing window has closed
- **THEN** the "Entries close" date is not shown in the summary band (it remains available inside details)

### Requirement: Minimum 44px touch targets

Primary and inline interactive elements on the My Shows page SHALL have a minimum 44px touch-target height, including the "Enter a Show" call to action, the directions link, and the sidebar close control.

#### Scenario: Directions link hit area

- **WHEN** an entry card renders a directions link
- **THEN** its interactive area is at least 44px tall

### Requirement: Readable supporting text in both color modes

Muted supporting copy that carries primary reading content on the My Shows page SHALL render at 16px-equivalent (or no smaller than 14px with strengthened contrast) and SHALL meet readability in both dark and light themes without hardcoded colors.

#### Scenario: Dark and light verification

- **WHEN** the page renders in dark mode and in light mode
- **THEN** summary-band and stat supporting text uses the upgraded size/contrast classes in both themes

### Requirement: Clickable metric cards look clickable

Each clickable summary metric card SHALL display a persistent visible navigation cue (trailing chevron) in addition to its accessible label.

#### Scenario: Metric card affordance

- **WHEN** the summary metric cards render
- **THEN** each card shows a visible chevron indicating it navigates

### Requirement: Filter strip stays legible on phone

The entry filter strip SHALL keep its labels legible at 390px width — labels SHALL NOT truncate below readability; the strip scrolls horizontally instead — and horizontally scrollable strips (filters and dog strip) SHALL show a visible overflow cue when more content exists offscreen.

#### Scenario: Phone filter labels

- **WHEN** the six entry filters render at 390px width
- **THEN** every visible filter label is readable text (not icon-plus-ellipsis), and an edge cue indicates offscreen filters

### Requirement: Filter-specific empty states

Each entry filter tab SHALL have its own empty-state heading, explanation, and recovery action appropriate to that filter, driven by a testable lookup table; the Pending filter's copy SHALL reassure that the show secretary reviews entries.

#### Scenario: Empty waitlist tab

- **WHEN** the Waitlist tab is selected with zero waitlisted entries
- **THEN** the empty state explains what waitlisting is rather than only offering "Browse All Shows"

### Requirement: Offline-first error copy

The entries load-failure state SHALL use non-blaming, offline-normal phrasing that does not instruct the user to check their connection, and SHALL retain a retry action.

#### Scenario: Load failure

- **WHEN** entry data fails to load
- **THEN** the message reassures that saved information persists and offers Retry, without "check your connection" phrasing

### Requirement: Simplified phone header

At phone widths, the global header SHALL show at most search, notifications, cart (when non-empty), and account as standalone icon controls; the theme toggle and assistant entry points SHALL be consolidated as labeled items inside the existing account menu. Desktop header layout SHALL be unchanged.

#### Scenario: Phone header consolidation

- **WHEN** a signed-in exhibitor views the header at 390px width
- **THEN** theme and assistant are reachable as labeled items in the account menu and do not render as standalone header icons
