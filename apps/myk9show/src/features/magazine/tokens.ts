/**
 * Magazine design tokens — colors, gradients, typography, durations.
 *
 * Source: docs/design/claude_code_handoff/design_handoff_magazine/README.md.
 *
 * The Magazine style is the most photographic of the eight premium styles —
 * its gold accents are *gradients*, not flat colors, so we expose them
 * separately under `magazineGradients`. Sections reference the named ramps
 * (`goldRule`, `coverFallback`, `portraitFallback`, `finalBand`) rather than
 * inlining linear-gradient strings, which keeps the editorial palette
 * single-sourced and easy to retune.
 */

export const magazineColors = {
  /** Warm cream page background. */
  paper: '#f6f1e8',
  /** Inset surfaces (footer band, fees panel, mail-to panel). */
  paperDeep: '#ece4d3',
  /** Body type, rules, primary heading color. */
  ink: '#1a1a1a',
  /** Slightly softer body copy in multi-column prose. */
  soft: '#2e2820',
  /** Captions, labels, smallcaps eyebrow text. */
  mute: '#7a6e58',
  /** Italic muted text, deks, by-lines. */
  quill: '#5c4f3a',
  /** Lightest gold — gradient start, dark-band accent. */
  gold1: '#c9a87c',
  /** Mid gold — gradient end, dotted hairline color. */
  gold2: '#a8814f',
  /** Darkest gold — italic emphasis text, eyebrows, drop cap. */
  gold3: '#4a3826',
} as const;

export type MagazineColorToken = keyof typeof magazineColors;

/**
 * Gradient ramps. All named so sections + tests can assert them without
 * re-typing CSS strings.
 */
export const magazineGradients = {
  /** 1px hairline rule between columns and at section boundaries. */
  goldRule: 'linear-gradient(90deg, #c9a87c, #a8814f)',
  /** Italic emphasis text gradient. Identical to goldRule today; alias kept
   *  for readability at call sites. */
  goldEmphasis: 'linear-gradient(90deg, #c9a87c, #a8814f)',
  /** Hero cover fallback when no club photograph is uploaded. */
  coverFallback: 'linear-gradient(135deg, #c9a87c 0%, #a8814f 45%, #4a3826 100%)',
  /** Judge portrait fallback (slightly different angle so it reads distinct
   *  from the cover even when both render the placeholder). */
  portraitFallback: 'linear-gradient(160deg, #c9a87c 0%, #8a6a45 60%, #4a3826 100%)',
  /** Final CTA band — dark editorial gradient. */
  finalBand: 'linear-gradient(135deg, #4a3826 0%, #2e2820 60%, #1a1a1a 100%)',
} as const;

export type MagazineGradientToken = keyof typeof magazineGradients;

export const magazineTypography = {
  /** Display face — Cormorant Garamond. Italic carries the editorial flair. */
  display: "'Cormorant Garamond', 'EB Garamond', Georgia, serif",
  /** Body — Source Serif 4 with variable optical sizing. */
  body: "'Source Serif 4', Georgia, serif",
  /** Meta / smallcaps labels — Inter Tight 500. The only sans, used sparingly. */
  meta: "'Inter Tight', system-ui, sans-serif",
} as const;

/**
 * Animation durations in ms. Names mirror the README's motion table.
 * Slow and soft — the page composes itself like a printed page being lifted
 * into view.
 */
export const magazineDurations = {
  /** Stagger between hero text children. */
  heroStagger: 150,
  /** Hero text fade-up. */
  heroFade: 900,
  /** Cover photograph fade-in. */
  coverFade: 1200,
  /** Delay before cover starts fading. */
  coverFadeDelay: 300,
  /** Roster capacity-bar fill duration. */
  capacityBarFill: 1800,
  /** Delay before the bar starts filling once the section reveals. */
  capacityBarDelay: 400,
  /** Generic section-head reveal. */
  sectionHeadReveal: 720,
} as const;

export const magazineSpacing = {
  /** Section vertical padding desktop. */
  sectionPaddingY: 96,
  /** Page horizontal gutter desktop. */
  pageGutterX: 64,
  /** Multi-column body gap. */
  columnGap: 56,
} as const;
