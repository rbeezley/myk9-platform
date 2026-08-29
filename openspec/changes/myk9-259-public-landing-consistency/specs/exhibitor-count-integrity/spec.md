## MODIFIED Requirements

### Requirement: Public entries-received counter reflects accepted entries

The show landing page's entries-received counter SHALL reflect the show's actual entry count from the sanctioned public read path, not render zero when entries exist or when the count read fails.

#### Scenario: Show with existing entries

- **WHEN** a show with accepted entries renders its public landing roster section
- **THEN** the entries-received figure is non-zero and consistent with what the show team sees

#### Scenario: Public entry count cannot be read

- **WHEN** the sanctioned public entry-count read fails
- **THEN** the entries-received figure renders as unknown rather than zero
- **AND** no percentage or capacity claim is calculated from the unavailable count
