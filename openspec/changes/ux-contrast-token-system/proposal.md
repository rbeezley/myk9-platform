## Why

The public a11y smoke baseline previously found serious `color-contrast` violations across launch-critical pages, and later token fixes turned the axe rule back on. The remaining gap is that the contrast rules live as scattered comments and test expectations, not as an explicit token-system contract, so future accent/status/theme changes can regress the launch-critical calm, readable experience without a clear spec to check against.

## What Changes

- Add a contrast-token contract for myK9Show semantic text, surface, accent, status, and interactive-state tokens.
- Audit the existing light/dark theme and accent token combinations that power public pages.
- Adjust only shared token values or token usage needed to clear WCAG AA for normal text, large text, icons, controls, focus states, and status chips.
- Keep the existing axe `color-contrast` regression gate on and add narrower token-pair coverage where axe cannot cheaply enumerate all theme/accent combinations.
- Keep this as a consolidation pass: no new page, settings screen, theme picker, dialog, or visual redesign.

## Capabilities

### New Capabilities
- `contrast-token-system`: Defines the contrast requirements and verification expectations for semantic theme tokens, accent tokens, status tokens, and tokenized UI states in myK9Show.

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/myk9show/src/index.css`, theme/accent token helpers, token-consuming UI components if they bypass shared tokens, and focused token/a11y tests.
- Affected docs/tracking: `OPEN-TODOS.md` and/or launch-readiness tracking should be updated if implementation closes or creates contrast-token follow-ups.
- Affected systems: no database, API, replication, or offline data-path changes.
- Duplication check: this does not duplicate an existing page or workflow. It consolidates the existing theme/token surface; a link is not enough because the problem is shared token behavior, not navigation to an existing remediation surface.
- Non-goals: no new design-system documentation site, no user-facing contrast preference, no wholesale brand refresh, no migration of decorative heritage/premium PDF palettes unless they are part of the failing app UI baseline.
