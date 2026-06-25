# Plan: Public Default Landing

> **Status:** Complete

## Decision

Use the existing **Monogram** landing as the committed default public landing for `/shows/:id`
when a public visitor reaches a show with no explicit `style` / `landing_style`.

Do not build a ninth bespoke default landing. The default should become the same brand-register
surface the rest of the Experience system already treats as its default: `monogram`.

## Problem

Styled shows render a bespoke public landing. Unstyled shows currently fall through to the tabbed
show-details UI, where the hero is the shared product `DetailHero`. That creates product-template
chrome in a brand slot: the show link secretaries share with exhibitors can look like internal app
UI instead of a public show invitation.

PR #916 already resolved the mechanical accessibility/token fixes from the brand pass. The remaining
choice is whether the default public show page should be a new committed landing or one of the
existing styles.

## Duplication Question

Does this duplicate an existing page? Yes, a brand default landing would overlap the existing styled
landing surfaces.

Why is duplication justified instead of a link? It is not justified. The product already has a
default brand style:

- `DEFAULT_PREMIUM_STYLE` is `monogram`.
- `getShowStyle()` falls back to `monogram`.
- the show edit UI labels Monogram as the conservative classic default.
- `STYLED_LANDING_BY_STYLE` already maps `monogram` to a complete public landing.

The current issue is not missing UI. It is that `ShowDetailsPage` deliberately refuses to use the
existing fallback for public visitors when `style` is null or `default`, preserving legacy behavior.
The fall 2026 launch direction favors consolidation, so the fix should route public, unentered
visitors to the existing Monogram landing instead of creating another surface.

## Intent Fit

For exhibitors, the target feeling is "This respects my time." Monogram supports that better than the
tabbed `DetailHero` path because it puts dates, venue, entry status, judges, fees, and entry CTA in a
single public page designed for show discovery.

For secretaries, the target feeling is "That was easy." Making the public link always render a
polished landing reduces the need to understand whether a show is "styled" before sharing it.

The style should stay calm and readable. This is not a marketing splash page; it is a show invitation
that helps exhibitors decide whether and how to enter.

## Implementation Scope

1. Adjust the public landing gate in `ShowDetailsPage` so public, non-staff, unentered visitors use
   `MonogramLandingPage` when no explicit style is set.
2. Preserve the current tabbed details UI for:
   - show managers and admins,
   - management child routes,
   - authenticated exhibitors who already have entries,
   - public visitors who are intentionally viewing internal tabs/classes through the existing tab UI,
     if the route or state requires it.
3. Keep `DetailHero` unchanged. It remains the shared product hero for management/detail contexts.
4. Add an `// INTENT:` comment near the gate explaining why null/default style uses Monogram for
   public visitors but not for management users.
5. Update stale tests that currently assert no styled landing for `style = null` / `style = default`.

## Testing

- Unit: `ShowDetailsPage` renders Monogram for public visitors when `style` and `landing_style` are
  null.
- Unit: `ShowDetailsPage` renders Monogram for public visitors when `style = "default"`.
- Unit: management routes still bypass the public landing when style is null/default.
- Unit: authenticated exhibitors with entries still bypass the public landing.
- Unit: explicit styles still render their mapped landing.
- Focused test command: `cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx`.

## Notes

- The backlog note said there were 7 bespoke themes, but the current type/registry contains 8:
  Monogram, Banner, Headline, Magazine, Poster, Gazette, Field Guide, and Heritage.
- This plan intentionally avoids a new page, dialog, sheet, or affordance.
