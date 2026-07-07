# Literal Color Triage

Date: 2026-07-03

Source: `docs/plan-ux-walk-remediation-2026-07.md` task 3.G/T7 and OpenSpec task 5.5.

## Named Fixed-Surface Families

- `PrintableReport`: retained as fixed-light paper output. The root keeps `bg-white text-black`; source now carries an `INTENT:` marker explaining that exported/browser-printed reports must remain legible on physical paper regardless of app theme.
- `TVDisplay`: retained as a fixed-dark venue display. The route is a standalone wall/projector surface, so zinc/green/red literal classes do not inherit user theme. Source now carries an `INTENT:` marker at the route entry.
- `CreditCardVisual`: retained as fixed illustrative/payment-object art. Issuer SVG colors, chip colors, and the dark card body stay literal; the surrounding form remains tokenized. Source now carries an `INTENT:` marker.
- `landing-v2`: retained as fixed-light editorial marketing. `landing.css` already scopes the page under `.landing-v2` and pins `color-scheme: light`; the existing comment now uses the explicit `INTENT:` marker.
- `HeritageLandingPage`: retained as fixed-light public show styling. The page already scopes all CSS under `data-heritage`, uses the paper background directly, and now has an `INTENT:` marker plus AA-safe dark-band token tests.

## Guard

`apps/myk9show/src/styles/__tests__/fixed-light-surface-intent.test.ts` pins the named families above so future literal-color edits have to preserve or update the intent markers.

## Deferred Token Cleanup

Broad literal color cleanup outside the named matrix families remains separate design-system debt. This task did not attempt a global ban because charts, PDFs, brand logos, and standalone displays have legitimate literal colors; future cleanup should be component-family-specific and backed by contrast checks rather than a repo-wide regex ban.
