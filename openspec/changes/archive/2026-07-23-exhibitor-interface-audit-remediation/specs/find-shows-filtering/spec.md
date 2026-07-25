# Delta: find-shows-filtering

## ADDED Requirements

### Requirement: Filter dropdowns paint above surrounding content

Filter chip dropdown menus on Find Shows SHALL render through a portal-based popover primitive so they are fully opaque and paint above all subsequent page content (including the Upcoming/Past Shows tab strip), regardless of stacking contexts created by ancestor containers (e.g., `backdrop-blur`).

#### Scenario: Dropdown overlaps tabs correctly

- **WHEN** a user opens a filter chip dropdown on Find Shows positioned above the Past Shows tab strip
- **THEN** the menu renders opaque and on top of the tabs, and every menu item is clickable

#### Scenario: All FilterChips consumers unaffected in layout

- **WHEN** the shared FilterChips component renders on its other consumer pages
- **THEN** chip layout and selection behavior are unchanged; only the open-menu rendering differs

### Requirement: Discipline filters match stored trial-type variants

The discipline filter SHALL match shows by normalized comparison (case-, whitespace-, and punctuation-insensitive, tolerant of organization prefixes) between the selected discipline and the show's trial-type-derived events, so that selecting "Scent Work" returns shows whose trials are stored as any variant (e.g., `Scent Work`, `Scentwork`, `scent_work`, `AKC Scent Work`).

#### Scenario: Scent Work returns results

- **WHEN** scent-work shows exist and the user selects the Scent Work filter
- **THEN** those shows appear in the results list instead of an empty state

#### Scenario: Variant trial types covered by tests

- **WHEN** the discipline-matching unit tests run
- **THEN** they assert a match for each known stored trial-type variant and a non-match for unrelated disciplines
