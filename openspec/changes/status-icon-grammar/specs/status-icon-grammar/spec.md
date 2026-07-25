## ADDED Requirements

### Requirement: Single shared status icon grammar per family

The system SHALL provide one shared status icon component with a single status→(shape, color, label) map for each of the entry, class, and trial status families. The families SHALL share one shape vocabulary so that equivalent states (e.g. "complete") read the same across families. The component SHALL be presentation-only, performing no data access or mutation.

#### Scenario: Same state reads consistently across families

- **WHEN** a completed entry and a completed class are rendered with the shared component
- **THEN** both use the same "complete" shape from the shared vocabulary

#### Scenario: One map owns each family

- **WHEN** an entry status is rendered on any migrated surface
- **THEN** its icon comes from the single entry-family map, not a per-surface map

### Requirement: Shape encodes state independently of color

Each status SHALL be distinguished by shape, not by color alone, so that state is discernible without relying on color perception. Color SHALL reinforce, not solely convey, the state.

#### Scenario: State is distinguishable without color

- **WHEN** status icons are viewed without color differentiation (e.g. by a color-blind user)
- **THEN** the shapes still distinguish not-started, pending, in-progress, complete, and needs-attention states

### Requirement: Unmapped status values fall back safely

Status lookups SHALL route through a helper that returns a defined neutral fallback (the existing `no-status` convention) for any unknown, undefined, or unmapped value. Direct unguarded map indexing SHALL NOT be used in the shared component or migrated call sites. Rendering an unmapped status SHALL NOT throw and SHALL NOT render blank.

#### Scenario: Unknown status does not crash

- **WHEN** a status value with no entry in its family map is rendered
- **THEN** the component renders the neutral `no-status` icon
- **AND** no error is thrown

### Requirement: Status colors come from ux-contrast tokens and pass contrast in both themes

Status icon colors SHALL reference ux-contrast design tokens rather than hardcoded values, and SHALL meet contrast expectations in both light and dark themes for every status in each family.

#### Scenario: Contrast holds in dark theme

- **WHEN** status icons are rendered in dark theme
- **THEN** each status color meets the contrast expectation against its background

### Requirement: Entry/class/trial status renderings consume the shared grammar

Existing entry, class, and trial status renderings — badges, tables, cards, the Class Details readiness strip, Show Desk, and the attention summary — SHALL consume the shared component. Redundant per-surface status→icon maps and duplicate status badge components for these families SHALL be removed as their last caller migrates. Unrelated status families (email-delivery, promo-code, system-health) SHALL be out of scope and unchanged.

#### Scenario: Legacy duplicate maps are gone

- **WHEN** the codebase is checked after migration
- **THEN** no per-surface entry/class/trial status icon map remains outside the shared grammar

#### Scenario: Out-of-scope status families are untouched

- **WHEN** email-delivery, promo-code, or system-health status is rendered
- **THEN** its existing rendering is unchanged by this change

### Requirement: Each family map covers its full status enum

Every value in the entry, class, and trial status enums SHALL have an entry in its family map, verified by test, so migration cannot silently drop a status distinction.

#### Scenario: Full enum coverage is enforced

- **WHEN** the family-map coverage test runs
- **THEN** it fails if any enum value for entry, class, or trial status lacks a mapped descriptor
