/**
 * Heritage design tokens — colors, spacing, ornaments.
 *
 * Source: docs/design_handoff_heritage/README.md §Design Tokens.
 * The premium PDF Style 8 uses the same palette via features/premium/pdf/pdfTokens.ts;
 * keep them in sync if either is changed.
 */

export const heritageColors = {
  /** Page background, card surfaces. */
  paper: '#f8f4ea',
  /** Primary text, borders, dark headings. */
  ink: '#1a1612',
  /** Accent / italic highlights / corner dots / footer headers. */
  claret: '#8a1818',
  /** Secondary rules, dotted underlines, panel borders. */
  gold: '#8a6a45',
  /** Italic muted text, captions, labels. */
  quill: '#6b4f3a',
  /** Off-page background — preview-only, not used in prod. */
  paperDark: '#d9d2c2',
} as const;

export type HeritageColorToken = keyof typeof heritageColors;

/**
 * Vertical rhythm. The handoff specifies 48px between sections and 72px page
 * horizontal padding for the desktop layout. Mobile reductions live in the
 * landing page's responsive layer (Phase 2 §13.1).
 */
export const heritageSpacing = {
  sectionPaddingY: 48,
  pageGutterX: 72,
  /** Engraved double-border outer/inner stroke + gap (1 / 6 / 1 px). */
  doubleBorderOuter: 1,
  doubleBorderGap: 6,
  doubleBorderInner: 1,
  /** Corner dot radius range used on engraved frames (4–7 px per handoff). */
  cornerDotMinRadius: 4,
  cornerDotMaxRadius: 7,
} as const;

/**
 * Ornament glyphs. The diamond ✦ (U+2726) is the centerpiece of horizontal rules.
 * Section folios use the section-sign § followed by a roman numeral.
 */
export const heritageOrnaments = {
  diamond: '✦',
  sectionSign: '§',
} as const;

/**
 * Animation durations in ms. Names mirror the handoff's MICRO-ANIMATIONS table.
 * Used by `useRevealOnScroll`, the ornament rule transition, and hero fade.
 */
export const heritageDurations = {
  ornamentRuleLine: 900,
  ornamentRuleGlyphDelay: 200,
  sectionHeadReveal: 720,
  capacityBarFill: 1400,
  journeyStepStagger: 140,
  heroChildFade: 800,
  heroCornerDot: 1200,
  countdownDigit: 120,
} as const;
