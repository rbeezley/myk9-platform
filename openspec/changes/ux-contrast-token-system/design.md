## Context

myK9Show already centralizes most app color behavior in `apps/myk9show/src/index.css`: core surface/text tokens, light/dark theme tokens, semantic status tokens, and the `data-accent` accent system. The current a11y smoke test (`apps/myk9show/src/test/e2e/a11y-smoke.spec.ts`) enforces axe `color-contrast` for public and authenticated role landing pages, and `index.css` already contains several hand-documented WCAG fixes.

That current state is useful but implicit. Contrast requirements are documented in comments near specific fixes, while the code still has many ways to accidentally bypass tokens with raw Tailwind palette classes or to add an accent/status token pair that is not covered by the scanned routes. The change should preserve the role intent from `docs/INTENT.md`: readable, calm, hard-to-misread UI for volunteers and exhibitors, especially on tablets and show-day screens.

This is a UI/theme contract only. It does not touch persistent show-day data, replication, Supabase, or mutation flows, so there is no offline-first data impact.

## Goals / Non-Goals

**Goals:**
- Define the contrast behavior expected of myK9Show semantic, accent, status, and interactive-state tokens.
- Keep fixes centralized in shared tokens where possible, and only update component class names when a component bypasses those tokens.
- Add focused tests that enumerate important token foreground/background pairs across light/dark themes and accent variants.
- Keep the existing axe smoke coverage as the user-facing regression guard for real pages.
- Preserve the calm visual direction: adjust contrast without adding new UI, animation, theme choices, or brand treatment.

**Non-Goals:**
- No new settings surface or user-selectable high-contrast mode.
- No wholesale redesign of cards, buttons, landing pages, or role dashboards.
- No migration of decorative PDF/premium print palettes unless they are shown in the app baseline being audited.
- No change to offline replication, show-day mutations, scoring logic, or data schemas.

## Decisions

1. Treat `index.css` semantic tokens as the source of truth.
   - Rationale: the app already uses CSS custom properties through Tailwind and shadcn/ui conventions. Fixing shared tokens prevents page-local drift.
   - Alternative considered: patch each failing page. Rejected because it duplicates color decisions and conflicts with the current consolidation phase.

2. Add a small TypeScript contrast utility for tests rather than a runtime dependency.
   - Rationale: token contrast can be tested in Vitest by parsing known token values and computing WCAG ratios. Runtime code does not need a new dependency for a build-time quality check.
   - Alternative considered: rely only on axe. Rejected because axe scans rendered routes, not every theme/accent/status token pair.

3. Keep axe `color-contrast` enabled and use it as the end-to-end proof.
   - Rationale: the existing smoke test already waits for the SPA shell and reports failing selectors clearly. It proves real rendered pages, including web fonts and composed states.
   - Alternative considered: replace axe with token tests. Rejected because token tests cannot catch every component composition or overlay/backdrop issue.

4. Prefer token usage fixes over new component abstractions.
   - Rationale: this change is about closing contrast drift. New UI primitives are only justified if an existing shared component has a missing token hook that multiple callers need.
   - Alternative considered: introduce a contrast-aware badge/button family. Rejected unless implementation finds repeated local bypasses that cannot be corrected through existing shadcn/ui variants and tokens.

## Risks / Trade-offs

- [Risk] Darkening an accent or muted color can subtly shift the brand feel. -> Mitigation: keep hue families stable, change only lightness/chroma needed for WCAG AA, and record measured ratios in tests or comments for non-obvious values.
- [Risk] A token may pass in isolation but fail when used with opacity utilities like `bg-primary/10`. -> Mitigation: include common tint patterns in the token-pair test matrix.
- [Risk] Raw Tailwind palette classes can continue bypassing the token system. -> Mitigation: audit the a11y failure selectors and targeted high-traffic components, then convert bypasses only where they affect contrast.
- [Risk] E2E a11y can be slow or require credentials for authenticated pages. -> Mitigation: run focused token/unit tests first, then the existing public a11y smoke; report any credential-gated coverage that cannot run locally.

## Migration Plan

1. Inventory current semantic, accent, status, and common tint token pairs from `index.css`.
2. Add a focused contrast test matrix for light/dark theme and accent combinations.
3. Run the test red if any current pair fails, then adjust shared tokens or token usage until it passes.
4. Run the existing a11y smoke for public pages, and authenticated role landings when credentials are available.
5. Update tracking docs if the implementation closes a known contrast-token follow-up or leaves a scoped follow-up.

Rollback is straightforward: revert token and test changes. No data migration or shared-system mutation is involved.

## Open Questions

- Which exact route set should be the minimum required a11y smoke for this slice if authenticated credentials are unavailable locally?
- Should token tests live beside `index.css` under `apps/myk9show/src/styles` if a style-test folder already exists, or beside the current a11y tests for visibility?
