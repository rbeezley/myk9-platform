## ADDED Requirements

### Requirement: Styled public landing navigation is keyboard and screen-reader usable

Every styled public show landing SHALL provide meaningfully labeled navigation landmarks, descriptive link names without decorative glyph noise, and a visible themed focus indicator on interactive elements.

#### Scenario: Keyboard user traverses a dark or light landing section

- **WHEN** a keyboard user tabs through landing navigation and calls to action
- **THEN** each focused element has a visible focus indicator against its current background
- **AND** navigation landmarks and links expose human-readable destination names

### Requirement: Styled public landing tables remain reachable on narrow viewports

Every styled public show landing table SHALL remain usable when its intrinsic width exceeds the available viewport, and dense navigation SHALL reduce or reflow spacing at narrow widths.

#### Scenario: Public landing renders at 320 pixels wide

- **WHEN** a landing style contains a wide table or dense horizontal navigation
- **THEN** the table is contained in a keyboard-reachable horizontal scroll region or responsive alternative
- **AND** navigation content is not consumed by fixed desktop padding

