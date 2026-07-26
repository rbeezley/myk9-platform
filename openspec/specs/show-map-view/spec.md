# show-map-view Specification

## Purpose
Find Shows offers a map view mode rendering the filtered show list as status-colored venue pins, with popup show cards linking to show details and graceful handling of shows without coordinates.
## Requirements
### Requirement: Map is a fourth view mode of the existing Find Shows list

Find Shows SHALL offer a `map` view mode alongside `cards`, `table`, and `calendar`, URL-synced via the existing `?view=` parameter, rendering the same filtered show list the other view modes consume. Switching filters, tabs, or search SHALL update the map's markers without any map-specific filter logic.

#### Scenario: Map renders the filtered list

- **WHEN** a user with active filters switches to the map view
- **THEN** exactly the shows in the current filtered list that have coordinates appear as markers, and changing a filter updates the markers

#### Scenario: Deep link to map view

- **WHEN** a user opens Find Shows with `?view=map` in the URL
- **THEN** the map view is active on load, and invalid `?view=` values still fall back to the role-based default view

### Requirement: Markers encode live entry status

Each show marker SHALL be colored by a status derived from the show's entry data: `open`, `closing-soon` (entries open AND entry close within 7 days OR at least 90% of capacity filled), `full`, `waitlist`, or `closed`. The derivation SHALL be a pure function, and the map SHALL display a legend of the status colors.

#### Scenario: Nearly-full show shows closing-soon

- **WHEN** a show has open entries and 90% or more of its capacity filled
- **THEN** its marker renders in the closing-soon color

#### Scenario: Legend visible

- **WHEN** the map view is active
- **THEN** a legend mapping each status to its marker color is visible

### Requirement: Marker popup links to the show, never re-implements it

Clicking a marker SHALL open a compact popup with the show's name, dates, venue/city, entry fee, and entry status, plus a link to the existing show details page. The popup SHALL NOT contain registration controls.

#### Scenario: Popup navigates to show details

- **WHEN** a user clicks a marker and then the popup's link
- **THEN** they land on that show's existing details page

### Requirement: Shows without coordinates degrade gracefully

Shows lacking coordinates SHALL be omitted from the map view while remaining visible in the other three view modes. When any filtered shows are omitted, the map SHALL display a note with the omitted count. When zero filtered shows have coordinates, the map SHALL show an empty state directing the user back to the cards view.

#### Scenario: Partial coverage noted

- **WHEN** 10 shows match the filters and 3 lack coordinates
- **THEN** the map shows 7 markers and a "3 shows not mappable" note

#### Scenario: No mappable shows

- **WHEN** no filtered show has coordinates
- **THEN** an empty state with a link back to cards view renders instead of a bare map
