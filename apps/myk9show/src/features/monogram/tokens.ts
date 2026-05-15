/**
 * Monogram design tokens — colors, spacing, ornaments.
 *
 * Source: docs/design/claude_code_handoff/design_handoff_monogram/README.md.
 * The premium PDF MONOGRAM_TOKENS in features/premium/pdf/pdfTokens.ts
 * should align numerically — if they diverge, the values in this file
 * (the polished visual system) are the source of truth.
 *
 * The Deno edge function keeps a parallel copy in
 * supabase/functions/send-confirmation-email/monogram-email.ts (Deno cannot
 * import workspace packages). Keep them in visual sync.
 */

export const monogramColors = {
  /** Page background — ivory paper. */
  paper: '#f3eee4',
  /** Deeper paper tone — card surfaces, gradient mid-stop, page surround. */
  paperDeep: '#ece5d4',
  /** Primary text, borders, dark headings. */
  ink: '#1c1815',
  /** Accent / italic highlights / monogram on dark bands. */
  bronze: '#8a6938',
  /** Italic muted text, captions, labels — slightly cooler than bronze. */
  quill: '#5a4f3e',
  /** Subtle dividers, dotted underlines. */
  mute: '#7a6f5e',
  /** Off-page background — preview-only. */
  paperDark: '#d4ccba',
} as const;

export type MonogramColorToken = keyof typeof monogramColors;

/**
 * Vertical rhythm. The handoff specifies 48px between sections and a 1200px
 * content max-width for the landing page.
 */
export const monogramSpacing = {
  sectionPaddingY: 48,
  pageGutterX: 72,
  /** Card border stroke. */
  cardBorder: 1,
  /** Hero monogram bleed size (px). */
  heroMonogramSize: 640,
  /** Welcome aside card monogram size (px). */
  cardMonogramSize: 280,
  /** Final-CTA band monogram size (px) — embossed in dark tones. */
  finalCtaMonogramSize: 580,
  /** Footer monogram size (px) — solid, not embossed. */
  footerMonogramSize: 96,
  /** Judge card monogram size (px) — solid bronze. */
  judgeMonogramSize: 64,
  /** Inline nav monogram size (px) — solid ink, no emboss. */
  navMonogramSize: 32,
} as const;

/**
 * Ornament glyphs. Monogram uses a diamond ◆ (U+25C6, filled) on horizontal
 * rules rather than Heritage's outlined ✦. Section folios are lowercase
 * roman numerals in italic Italiana.
 */
export const monogramOrnaments = {
  diamond: '◆',
  sectionPrefix: '',
} as const;

/**
 * Animation durations in ms. Names mirror the handoff's MOTION VOCABULARY
 * table. Used by `useRevealOnScroll`, ornament rule transition, hero fade.
 */
export const monogramDurations = {
  ornamentRuleLine: 900,
  ornamentRuleGlyphDelay: 200,
  sectionHeadReveal: 720,
  capacityBarFill: 1400,
  embossFadeIn: 1200,
  heroChildFade: 800,
  countdownDigit: 120,
} as const;
