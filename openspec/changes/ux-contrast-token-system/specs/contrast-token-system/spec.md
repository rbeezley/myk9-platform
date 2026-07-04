## ADDED Requirements

### Requirement: Semantic color tokens meet contrast thresholds
myK9Show semantic foreground/background token pairs SHALL meet WCAG AA contrast thresholds for their intended text or UI role in both light and dark themes. Normal text pairs SHALL be at least 4.5:1, large text and non-text UI affordances SHALL be at least 3:1, and filled controls SHALL ensure their foreground token meets the applicable threshold against the fill token.

#### Scenario: Core surface text is readable in both themes
- **WHEN** the app resolves core semantic pairs such as `foreground` on `background`, `card-foreground` on `card`, `popover-foreground` on `popover`, and `muted-foreground` on `muted`
- **THEN** every pair meets the WCAG AA threshold for normal text in light and dark themes

#### Scenario: Filled controls keep readable foreground text
- **WHEN** a filled button, badge, or status control uses a semantic fill token with its corresponding foreground token
- **THEN** the foreground/fill pair meets the applicable WCAG AA threshold in the active theme

### Requirement: Accent variants preserve contrast across themes
Every configured myK9Show accent variant SHALL provide contrast-safe `primary`, `primary-foreground`, `accent`, `accent-foreground`, tint, and ring-related token pairs for light and dark themes. Adding or changing an accent variant SHALL require updating the contrast verification matrix.

#### Scenario: User changes accent color
- **WHEN** the document root has any supported `data-accent` value in light or dark theme
- **THEN** primary text, primary-filled controls, accent text, and common accent tint pairings remain contrast-safe

#### Scenario: Developer adds an accent variant
- **WHEN** a new `data-accent` token block is introduced
- **THEN** the token contrast tests include that variant for both light and dark themes before the change is considered complete

### Requirement: Status and tint patterns are contrast-verified
Status tokens and their common tinted background patterns SHALL be verified as composed foreground/background pairs, not only as standalone colors. Components SHALL use the shared semantic status tokens for status text, icons, chips, and badges instead of raw palette classes when those elements convey state.

#### Scenario: Status chip renders on a tinted background
- **WHEN** a status chip uses a common pattern such as `bg-success/10 text-success`, `bg-warning/10 text-warning`, `bg-info/10 text-info-strong`, or `bg-destructive/10 text-destructive`
- **THEN** the composed foreground/background pair meets WCAG AA contrast for the chip text in both themes

#### Scenario: Component bypasses status tokens
- **WHEN** an audit finds a state-bearing badge, chip, icon, or label using raw Tailwind palette colors where shared status tokens exist
- **THEN** the implementation either migrates it to the shared status token vocabulary or documents why the local color is a distinct domain-specific exception

### Requirement: Page-level a11y remains the final regression gate
The existing myK9Show axe smoke coverage SHALL continue to enforce `color-contrast` for launch-critical public pages and authenticated role landings where credentials are available. Token tests SHALL supplement, not replace, rendered-page a11y verification.

#### Scenario: Public landing page a11y smoke runs
- **WHEN** the public a11y smoke scans the configured public launch pages
- **THEN** `color-contrast` is not disabled and serious or critical contrast violations fail the test

#### Scenario: Authenticated role landing coverage is unavailable
- **WHEN** authenticated role credentials are unavailable in the local or CI environment
- **THEN** the implementation reports the skipped coverage and still runs the token contrast tests plus public page a11y smoke

### Requirement: Contrast fixes do not add user-facing surface area
Contrast remediation SHALL consolidate existing token behavior and component usage without adding new pages, dialogs, theme settings, or workflow affordances unless a separate product decision approves that surface.

#### Scenario: Contrast issue is found on a page
- **WHEN** a rendered page has a contrast failure caused by shared token values or token bypasses
- **THEN** the fix updates the shared token or existing component usage rather than adding a new remediation surface
