# date-formatting (delta)

## ADDED Requirements

### Requirement: Landing-page dates are anchored to the trial timezone and agree with app surfaces
Per-theme landing-page date helpers SHALL anchor show dates, date ranges, and entries-close dates to the trial's configured IANA timezone (via the canonical trial-timezone accessor). A show's calendar dates SHALL NOT differ between the public landing page and app-facing surfaces (shows list, entry cards) for the same viewer.

#### Scenario: Show date consistent between list and landing
- **WHEN** a show starting Aug 1 (trial-local) is rendered on the shows list and its public landing page
- **THEN** both display Aug 1 as the start date, with no one-day offset from UTC/local conversion

#### Scenario: Entries-close date consistent
- **WHEN** a show's entries close Jun 30 at the trial-local cutoff
- **THEN** the landing page, shows list, and entry cards all present the same close date

### Requirement: Landing venue falls back to the show address
When a landing page's venue field is not set, the landing page SHALL fall back to the show's address record rather than rendering a "TBA" placeholder while other surfaces display the full address.

#### Scenario: Venue unset but address known
- **WHEN** a show has no explicit venue name but has a street address
- **THEN** the landing venue section renders the address (not "TBA")
