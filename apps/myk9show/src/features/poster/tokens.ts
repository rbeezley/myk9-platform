/**
 * Poster design tokens — colors, spacing, typography, durations.
 *
 * Source of truth: docs/design/claude_code_handoff/design_handoff_poster/.
 * The Deno edge function keeps a parallel copy in
 * supabase/functions/send-confirmation-email/poster-email.ts (Deno cannot
 * import workspace packages); keep them in visual sync.
 *
 * The palette is intentionally restricted to three colors — cream, ink, red
 * — with olive as the only modulator between black and dark. No grays, no
 * warm-cool shifts, no expansions. Restraint is the discipline.
 */

export const posterColors = {
  /** Page background — warm cream paper. */
  cream: '#f3ede0',
  /** Alt-section background. */
  creamWarm: '#e9dfc8',
  /** Body type, dark bands, footer. */
  ink: '#1f1d18',
  /** Body copy — slightly softer than ink so long lines read calmer. */
  inkSoft: '#3a342a',
  /** Captions, mid-tone labels. */
  mute: '#7a7466',
  /** Internal cell borders, hairline rules. */
  hair: '#cabe9f',
  /** Hero accent — ink-blot circle, italic emphasis, totals. */
  red: '#c83b1a',
  /** Gradient stop inside the ink-blot. */
  redDeep: '#8a2810',
  /** Rotating square, dark-band variant. */
  olive: '#3d3a2a',
  /** Deepest ink — same as `ink`, kept as alias for the design vocabulary. */
  oliveDeep: '#1f1d18',
  /** Cream chip color when used over ink (footer highlights, hover swaps). */
  textOnInk: '#f3ede0',
} as const;

export type PosterColorToken = keyof typeof posterColors;

/**
 * Vertical rhythm. Section padding is generous — Poster wants air around
 * each block so the giant Archivo Black headlines don't fight each other.
 */
export const posterSpacing = {
  sectionPaddingY: 96,
  pageGutterX: 32,
  contentMax: 1280,
  /** Mono running strip vertical padding (top + bottom strips). */
  monoStripPaddingY: 8,
  monoStripPaddingX: 32,
  /** Section-head left column width — folio number sits in this fixed slot. */
  sectionHeadFolioWidth: 160,
} as const;

/**
 * Animation durations in ms. Punchy and deliberate — every piece has a
 * moment. Names mirror the design-handoff motion vocabulary.
 */
export const posterDurations = {
  inkBlotIn: 1400,
  inkBlotDelay: 200,
  squareIn: 1000,
  squareDelay: 400,
  titleFade: 800,
  titleStagger: 120,
  capacityBarFill: 1200,
  capacityBarDelay: 400,
} as const;

/**
 * The rotation angle for the olive square. This is intentional and
 * load-bearing — the square is not "decorative" in the poster vocabulary,
 * it's an anchor element. Don't animate this away.
 */
export const posterSquareRotation = 8;
