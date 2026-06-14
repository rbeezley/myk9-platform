# Poster — Codebase Reconciliation Notes

Companion to `README.md`. Poster's graphic shapes (ink-blot circle, rotating square) are the most unusual primitives in the eight-style system. This doc covers the standard four-artifact port plus the graphic-shape component contracts.

---

## Where Poster files should land

```
apps/myk9show/src/features/poster/
  components/
    PosterInkBlot.tsx                ← NEW: red circle with mix-blend-mode + animate-in
    PosterRotatedSquare.tsx          ← NEW: olive square at fixed rotation + animate-in
    PosterMonoStrip.tsx              ← Top/bottom mono running strip (configurable items)
    PosterSectionFolio.tsx           ← "NO 0X / TITLE" mono format
    PosterHeading.tsx                ← Archivo Black display with outline-text variant
    PosterTitleStack.tsx             ← Stacked vertical title words (hero use)
  email/
    buildConfirmationProps.ts
  entry-blank/
    PosterEntryBlankDocument.tsx
    PosterEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks)
  landing/
    PosterLandingPage.tsx
    usePosterLandingData.ts
    types.ts
    sections/
      TopMonoStrip.tsx                ← Top bar with marquee + CTA
      HeroPoster.tsx                  ← Title stack + ink-blot + square
      WelcomeSection.tsx
      ParticularsSection.tsx
      FeesDarkBand.tsx                ← Black-on-cream → cream-on-black fee strip
      JudgesSection.tsx
      RosterSection.tsx
      TimelineOliveBand.tsx           ← Olive-background timeline section
      PlanSection.tsx
      OfficersSection.tsx
      FinalPosterBand.tsx             ← Hero echo at page bottom
      PosterFooter.tsx
    utils/
  wizard/
    PosterEntryReceived.tsx
  fonts.ts
  poster.css
  index.ts
  tokens.ts

packages/email/src/
  posterTokens.ts
  templates/PosterConfirmationEmail.tsx
  __tests__/PosterConfirmationEmail.test.ts
```

## Token map

### `apps/myk9show/src/features/poster/tokens.ts`

```ts
export const posterColors = {
  cream: '#f3ede0',
  creamWarm: '#e9dfc8',
  ink: '#1f1d18',
  inkSoft: '#3a342a',
  mute: '#7a7466',
  hair: '#cabe9f',
  red: '#c83b1a',
  redDeep: '#8a2810',
  olive: '#3d3a2a',
  oliveDeep: '#1f1d18',
} as const;

export const posterSpacing = {
  sectionPaddingY: 96,
  pageGutterX: 32,
  contentMax: 1280,
  monoStripPaddingY: 8,
  monoStripPaddingX: 32,
} as const;

export const posterTypography = {
  display: "'Archivo Black', system-ui, sans-serif",
  displayTight: "'Inter Tight', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const posterDurations = {
  inkBlotIn: 1400,
  inkBlotDelay: 200,
  squareIn: 1000,
  squareDelay: 400,
  titleStagger: 120,
  titleFade: 800,
  capacityBarFill: 1200,
  capacityBarDelay: 400,
} as const;

/** The rotation angle for the olive square is intentional and load-bearing. */
export const posterSquareRotation = 8;
```

### `packages/email/src/posterTokens.ts`

```ts
export const PO = {
  CREAM: '#f3ede0',
  INK: '#1f1d18',
  MUTE: '#7a7466',
  RED: '#c83b1a',
  HAIR: '#cabe9f',
  DISPLAY: "'Archivo Black','Inter Tight', Arial, sans-serif",
  DISPLAY_TIGHT: "'Inter Tight', Arial, sans-serif",
  BODY: "'Inter', Arial, sans-serif",
  MONO: "'IBM Plex Mono', Courier, monospace",
} as const;
```

The Deno edge function needs a parallel `PO` block.

## Component contracts

### `<PosterInkBlot>` and `<PosterRotatedSquare>`

```tsx
interface PosterInkBlotProps {
  /** Container-relative position. Defaults to top-right corner overflow. */
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Size in px. Defaults to 720. */
  size?: number;
  /** Color. Defaults to posterColors.red. */
  color?: string;
  /** Blend mode for layering on cream background. Defaults to 'multiply'. */
  blendMode?: React.CSSProperties['mixBlendMode'];
  /** Skip the entry animation. */
  staticMount?: boolean;
}

interface PosterRotatedSquareProps {
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  size?: number;
  color?: string;
  /** Final rotation. Defaults to 8 (degrees). */
  rotation?: number;
  blendMode?: React.CSSProperties['mixBlendMode'];
  staticMount?: boolean;
}
```

Both are `aria-hidden` (purely decorative), absolutely positioned within their nearest positioned ancestor, `pointer-events: none`.

### Outline-text variant

`<PosterHeading variant="outline">SPRING</PosterHeading>` renders the text with `-webkit-text-stroke: 3px currentColor; color: transparent`. **Firefox falls back to solid color** (acceptable). Add a CSS feature query if a fallback is desired.

### Email: ink-blot must degrade

Outlook does not support `mix-blend-mode`. The email template renders the ink-blot as a flat-color circle with `opacity: 0.92`. Test fixture must assert:
- No `mix-blend-mode` anywhere in the rendered email HTML
- No `-webkit-text-stroke` in rendered email
- All hero text uses solid color

## Wizard completion: prop-interface parity

`PosterEntryReceived` uses the **same** `HeritageEntryReceivedProps` interface, no extensions. The Poster style's identity is graphic-shape-based, not data-driven.

The mock includes an ink-blot in the upper-right corner of the receipt card — this is a smaller version of the hero ink-blot (240px). Reuse `<PosterInkBlot>` with `size={240}` and the top-right position.

## Migration changes required

### 1. `shows.landing_style` constraint

Add `'poster'` (no-op if previously batched).

### 2. Email template registration

Add `PosterConfirmationEmail` export. Update send-function switch.

### 3. No new columns

Poster does not require image upload or brand-color overrides. Pure design system.

## Tests to mirror

| Heritage test file | Poster equivalent |
|---|---|
| `__tests__/HeritageOrnamentRule.test.tsx` | `PosterInkBlot.test.tsx` (position, size, color, blend-mode props; animation runs once; respects reduced motion) |
| — | `PosterRotatedSquare.test.tsx` |
| — | `PosterTitleStack.test.tsx` (renders N stacked words; each can have color/outline variant; respects letter-spacing tight) |
| `__tests__/HeritageSectionFolio.test.tsx` | `PosterSectionFolio.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `PosterHeading.test.tsx` (solid, outlined, red variants; never below 18px) |
| `__tests__/landingUtils.test.ts` | `poster/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/PosterConfirmationEmail.test.ts` + asserts:<br>• no `mix-blend-mode` in output<br>• no `-webkit-text-stroke` in output<br>• ink-blot rendered as flat color with opacity |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/PosterEntryReceived.test.tsx` |

Plus Playwright visual snapshots at 375/768/1280 in `tests/visual-references/poster/`. Capture both ink-blot animation initial frame and final frame.

## Open questions for engineering

1. **`mix-blend-mode` performance** — on lower-end devices the blend modes can cause repaint thrashing during scroll. Test on iPhone SE / older Android. Possible mitigation: switch to flat color with opacity below a certain device pixel ratio.
2. **Archivo Black font loading** — single weight, ~50kb subset. Should it be preloaded (`<link rel="preload" as="font">`)? On the poster landing page, FOUT is dramatic because the headline is 224px. Recommend preload for Archivo Black even on non-poster pages, since other styles use it for select moments.
3. **Outline text fallback strategy** — Firefox renders `-webkit-text-stroke` as solid. Three options:
   - Accept the degradation (recommended)
   - Use SVG `<text>` with `stroke` and `fill: none` (more code, perfect fidelity, accessibility cost)
   - Use `text-shadow` to approximate (looks wrong)
4. **Marquee top strip** — the top mono strip on the landing page is currently static. Should it scroll horizontally like a stock ticker? Spec'd as static for now; could add `scroll-snap` marquee if the show count is high enough that the strip overflows.
5. **Email ink-blot position** — Gmail strips `position: absolute`. The email template positions the red circle inside a `<table>` cell with `background-image: radial-gradient(...)` or as an inline `<div>` floated to the right. Currently the email template renders no ink-blot at all (replaced by the red mono strip at top), which is acceptable degradation. Confirm before shipping.

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Poster Landing Page.html` | `features/poster/landing/PosterLandingPage.tsx` + sections |
| `Poster Entry Blank.html` | `features/poster/entry-blank/PosterEntryBlankDocument.tsx` |
| `Poster Confirmation Email.html` | `packages/email/src/templates/PosterConfirmationEmail.tsx` |
| `Poster Wizard Completion.html` | `features/poster/wizard/PosterEntryReceived.tsx` |
| `README.md` | Design system, tokens, motion vocabulary, graphic-shape rationale |
| `Poster Reconciliation Notes.md` | This file — component contracts, Outlook degradation, performance notes |
