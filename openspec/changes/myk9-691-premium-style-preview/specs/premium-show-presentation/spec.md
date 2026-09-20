## ADDED Requirements

### Requirement: Organizer previews and persists an entitled show style

An authorized organizer SHALL be able to use the existing Preview experience to select among entitled premium styles, see the pending presentation before save, and explicitly save or cancel the change through the canonical show-style mutation.

The canonical show-style mutation SHALL call `public.update_show_style(uuid,
text)`. That RPC SHALL be authenticated-only, SHALL authorize only a site admin
or a manager of the show club, SHALL return SQLSTATE `42501` for authorization
or Premium denial, SHALL return SQLSTATE `22023` for invalid style or missing
show input, and SHALL update only `shows.style` while returning the incremented
show version. The client SHALL perform this as a style-only offline mutation:
it SHALL not fabricate a cold local row, SHALL patch every field returned by the
mutation into the local cache, and SHALL scope pending/error state to the show
whose save is in flight.

#### Scenario: Default style is shown

- **WHEN** a show has no explicit style
- **THEN** Preview clearly indicates Monogram as the current default

#### Scenario: Pending style is previewed and saved

- **WHEN** the organizer selects an entitled style and saves
- **THEN** Preview updates before save and the canonical show style persists for public and printable presentation

#### Scenario: Change is canceled or fails

- **WHEN** the organizer cancels or the save fails
- **THEN** the persisted style remains active and the outcome is understandable

#### Scenario: Unentitled style is unavailable

- **WHEN** a style is outside the show or account entitlement
- **THEN** it is not offered as a selectable style

#### Scenario: Server authorization is narrow

- **WHEN** a caller is not a site admin or manager of the show club, or lacks
  effective account Premium for a non-monogram style
- **THEN** the RPC rejects the save with SQLSTATE `42501` and leaves every show
  field unchanged

#### Scenario: Cold local state is not fabricated

- **WHEN** a style-only mutation is acknowledged for a show absent from the
  local cache
- **THEN** the client does not create a partial show row and reports the
  show-scoped outcome instead

#### Scenario: Draft and published presentation stay distinct

- **WHEN** an organizer previews a pending style before saving, or saves a
  style on a draft versus a published show
- **THEN** the pending draft presentation is local until Save, and public and
  printable presentation use the persisted style only after a successful save
