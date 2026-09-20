## ADDED Requirements

### Requirement: Organizer previews and persists an entitled show style

An authorized organizer SHALL be able to use the existing Preview experience to select among entitled premium styles, see the pending presentation before save, and explicitly save or cancel the change through the canonical show-style mutation.

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
