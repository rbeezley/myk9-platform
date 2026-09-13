# exhibitor-my-shows-legibility Specification

## Purpose

The exhibitor My Shows page stays legible and operable for elderly, low-tech, touch-first users: visible orientation, one clear next action per entry card, readable text and filters, adequate touch targets, and reassuring copy — so the page answers "what show is next, what is my status, what do I do" without interpretation.

## Requirements

### Requirement: Visible page title on all viewports

The My Shows page SHALL render a visible "My Shows" heading (not screen-reader-only) on phone, tablet, and desktop viewports, preserving correct heading order.

#### Scenario: Phone landing orientation

- **WHEN** an exhibitor opens /exhibitor/entries at 390px width
- **THEN** a visible "My Shows" heading appears at the top of the page content, alongside or above the greeting

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

### Requirement: Show group leads with dog cards and a single next action

The My Shows list SHALL render one **show group** per show. A show group SHALL consist of a show header followed by one **dog card** per dog entered at that show, in armband order (unassigned armbands last, by dog name).

The show header SHALL contain: the show name; a meta line with the show date or date range, the venue city and state as a directions link, the money word from `exhibitor-money-on-exception`, and the "Entries close" date only while the editing window is open; and secondary actions "Orders & receipts", "Edit entry" (only while the editing window is open), "Add to calendar", and "View show". The header SHALL NOT carry an entry-status chip, a payment chip, a lifecycle sentence, or a details toggle.

Each dog card SHALL contain: the armband (a muted dash when unassigned), the dog's name, one status chip rolled up from the dog's classes, and one row per class showing the class name, the trial's calendar date and trial number, and the class's check-in state or result (result badge, placement once released, "preliminary" until released, search time and faults). A dog card SHALL carry at most one primary action, the day-gated batch check-in from `exhibitor-show-day-check-in`.

The dog chip SHALL be derived from the dog's class rows in this precedence: cancelled show → "Cancelled"; any class pulled → "Pulled"; any class in conflict → "Conflict"; any class in ring → "In ring"; any class at gate → "At gate"; every eligible class checked in → "Checked in"; results on some but not all classes → "Partially scored"; results on every class → "Scored"; otherwise the entry status label (Pending review, Accepted, Waitlist, Move-up requested, Rejected). A pending-review dog SHALL show the one-line secretary reassurance beneath its class rows.

#### Scenario: Multi-order show renders once

- **WHEN** an exhibitor has three orders for the same show covering four dogs
- **THEN** My Shows renders one show header for that show followed by four dog cards, and every class from all three orders is present on exactly one row

#### Scenario: Two trials on one day are distinguishable

- **WHEN** a dog is entered in two classes on the same calendar date in different trials
- **THEN** each class row shows that date with its own trial number

#### Scenario: Unassigned armband

- **WHEN** a dog's entry has no armband yet
- **THEN** the card shows a muted dash in the armband slot, not a filled pill

#### Scenario: Dog chip rolls up

- **WHEN** a dog has one class checked in and one class in the ring
- **THEN** the dog chip reads "In ring"

#### Scenario: Pending dog reassures

- **WHEN** a dog's entry status is pending review
- **THEN** its card includes the one-line reassurance that the show secretary is reviewing the entry

#### Scenario: Close date only while actionable

- **WHEN** a show's editing window has closed
- **THEN** the show header shows neither "Entries close" nor "Edit entry"

### Requirement: One show group per show

The My Shows page SHALL group entry rows by show (`showId`) into one show group, and within a show by dog (`dogId`) into one dog card, regardless of how many registrations (`registrationId`) the exhibitor holds for that show. Rows with a null `registrationId` SHALL join the show group of their `showId`. Regrouping SHALL conserve the total set of classes: every class row visible before the change remains visible after it. Order identity SHALL be retained on each class row (`registrationId`, confirmation number) so receipts, edit-entry and entry-scope deep links still resolve to the order they name.

#### Scenario: Multi-dog, multi-order show renders as one group

- **WHEN** an exhibitor's entries for a show span two registrations and three dogs
- **THEN** My Shows renders exactly one show group with three dog cards, and no class is lost

#### Scenario: Unregistered entry still appears

- **WHEN** an entry row has a null `registrationId` (e.g., secretary-entered)
- **THEN** it renders as a dog card inside its show's group and no class is lost from the page

#### Scenario: Scoped deep link narrows within the group

- **WHEN** My Shows is opened with `?entryIds=` naming the rows of one order
- **THEN** the show group renders only the dog cards and class rows named, and the scope banner reports the scope exactly as before

#### Scenario: Status filter narrows dogs

- **WHEN** the status filter is set to Pending and a show has one pending dog and two accepted dogs
- **THEN** the show group renders with only the pending dog card, and a show with no pending dog is not rendered
