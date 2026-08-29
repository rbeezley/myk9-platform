## Why

The eight public-show landing styles currently disagree about which show facts exist, how failed entry reads are represented, and whether core navigation and status states are accessible. Consolidating the shared data contract now prevents cosmetic theme choices from hiding exhibitor-critical information and reduces the repeated logic that has already produced divergent date and count behavior before fall 2026 launch.

## What Changes

- Introduce one shared public-landing data contract and derivation path for facts common to every visual style, including awards, house rules, trials, judges, entry limits, entry links, and journey steps.
- Keep all eight existing visual styles as presentation-only skins while ensuring each receives the same factual data.
- Represent failed public entry-count reads as unknown instead of zero and keep the rest of the show page available when counts cannot load.
- Remove the dead `getShowLandingStyle` helper/export and correct comments that name it as the style selector.
- Repair the issue-scoped accessibility defects: show-name heading hierarchy, navigation labels, decorative arrows, focus visibility, loading/error semantics, and responsive table/nav containment.
- Add focused shared-data, component, accessibility, and responsive regression coverage.

This change does not duplicate an existing page or workflow. It consolidates the data layer beneath the canonical `/shows/:id` surface; a link cannot solve inconsistent facts or semantics within that same page.

### Non-goals

- Add a ninth landing style, a new public-show route, or another show-information surface.
- Redesign the established palettes, typography, fixed-light intent, or visual identity of any style.
- Change show creation, entry mutation, or replication behavior.
- Replace the separate issue/PR responsible for the immediately preceding public-landing date and stale-read fixes.

## Capabilities

### New Capabilities

- `public-show-landing-consistency`: Defines a single factual contract across visual styles, theme-independent show content, truthful partial-read behavior, and public-landing semantic requirements.

### Modified Capabilities

- `exhibitor-count-integrity`: Requires failed public entry-count reads to render as unknown rather than a truthful-looking zero.
- `shell-interaction-integrity`: Extends existing public-page accessibility and responsive requirements to the concrete landing navigation, status, focus, heading, and table defects in scope.

## Impact

- Affects `apps/myk9show/src/features/_shared/landing`, the eight styled landing feature folders, `ShowDetailsPage` public class/count mapping, registry helpers, and their focused tests.
- Changes internal TypeScript landing-data and class-count types; no external API or database schema changes.
- Preserves the existing replication-backed read path and makes only its error presentation more truthful.
- Supports fall 2026 launch readiness by giving anonymous visitors and exhibitors consistent, accessible show facts regardless of the club's visual style.
