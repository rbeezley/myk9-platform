## MODIFIED Requirements

### Requirement: Entry card leads with summary and single next action

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

### Requirement: One card per online order

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

## REMOVED Requirements

### Requirement: Dog items wrap at five per row

**Reason**: Dogs are no longer inline items inside an order card; each dog is its own full-width card under the show header, so there is no row to wrap.
**Migration**: Nothing to migrate. The touch-target and no-horizontal-scroll requirements still apply to dog cards and class rows through "Minimum 44px touch targets" and the phone-layout scenarios in this change's new capabilities.
