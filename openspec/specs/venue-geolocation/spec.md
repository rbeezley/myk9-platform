# venue-geolocation Specification

## Purpose
Shows carry optional venue coordinates, captured by the secretary via a geocoded, draggable map pin in the show-creation wizard and Show Settings, with geocoding failures never blocking show management.
## Requirements
### Requirement: Shows store optional venue coordinates

The `public.shows` table SHALL have nullable `latitude` and `longitude` (double precision) columns. Anonymous and authenticated clients SHALL be able to SELECT both columns (the browse surface is public). Column access SHALL be verified against the applied database (`pg_class.relacl` / `pg_attribute.attacl`), not the migration text alone.

#### Scenario: Anon reads coordinates

- **WHEN** an unauthenticated client selects shows including `latitude, longitude` via PostgREST
- **THEN** the request succeeds and returns the coordinate values

#### Scenario: Coordinates are optional

- **WHEN** a show is created without coordinates
- **THEN** the insert succeeds and both columns are null

### Requirement: Secretary confirms the pin at address entry

The show-creation wizard venue step and Show Settings SHALL embed a `VenuePinMap`: when a venue address is entered, the browser SHALL geocode it via Nominatim (with the required User-Agent/referer identification) and drop a draggable preview pin; the saved show coordinates SHALL be the pin's final position, not the raw geocode result.

#### Scenario: Geocode then correct

- **WHEN** a secretary enters an address, the pin drops slightly off, and they drag it to the right spot
- **THEN** the dragged position is what saves to the show's `latitude`/`longitude`

#### Scenario: Existing show gains coordinates

- **WHEN** a secretary opens Show Settings for a show created before this feature and confirms a pin
- **THEN** the show's coordinates save and it appears in the Find Shows map view

### Requirement: Geocoding failure never blocks show management

A Nominatim miss, error, or timeout SHALL surface as a non-blocking notice; the secretary SHALL be able to place the pin manually or skip it entirely, and a show without coordinates SHALL save normally.

#### Scenario: Nominatim finds nothing

- **WHEN** Nominatim returns no result for an address
- **THEN** the secretary sees a notice, can click/drag the map to place the pin manually, and can also save the show with no pin at all
