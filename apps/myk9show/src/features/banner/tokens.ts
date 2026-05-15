/**
 * Banner design tokens — colors, spacing, durations.
 *
 * Source: docs/design/claude_code_handoff/design_handoff_banner/README.md.
 * The Deno edge function keeps a parallel copy in
 * supabase/functions/send-confirmation-email/banner-email.ts (Deno cannot
 * import workspace packages). Keep them in visual sync.
 *
 * Per-club configurable: `flag`, `flagDeep`, `flagBright` vary by show via
 * `shows.brand_color` + runtime derivation in `useBannerBrandColor`. The
 * defaults below are the design-handoff "demo" deep teal.
 */

export const bannerColors = {
  /** Page background — bright off-white paper. */
  paper: '#fafaf8',
  /** Alt-section background (Roster). */
  paperWarm: '#f0eeea',
  /** Primary text, footer flag, monolithic display copy. */
  ink: '#111111',
  /** Body copy — slightly softer than ink so long lines read calmer. */
  soft: '#2a2a2a',
  /** Captions, mid-tone labels. */
  mute: '#6b6b6b',
  /** Internal cell borders, hairline rules. */
  hair: '#d8d8d4',
  /** Default flag color (deep teal). Override via show.brand_color. */
  flag: '#0d4d4f',
  /** Hover state, deeper accent on dark surfaces. */
  flagDeep: '#093234',
  /** Single bright accent for "in confidence" emphasis on dark final band. */
  flagBright: '#1a7679',
  /** Single warm accent — used 1× for the live-status pulsing dot. */
  warn: '#d97742',
} as const;

export type BannerColorToken = keyof typeof bannerColors;

/**
 * Vertical rhythm. Banner uses tighter section padding than Heritage to keep
 * the page feeling architectural rather than literary.
 */
export const bannerSpacing = {
  sectionPaddingY: 96,
  pageGutterX: 64,
  contentMax: 1280,
  /** Flag-bar vertical padding (top + bottom flag bands). */
  flagPaddingY: 56,
  /** Section-head left column width — folio number sits in this fixed slot. */
  sectionHeadFolioWidth: 240,
} as const;

/**
 * Animation durations in ms. Banner motion is Swiss-snap — quick and
 * decisive, no eases-in. Names mirror the handoff motion vocabulary table.
 */
export const bannerDurations = {
  mastheadStagger: 120,
  mastheadFade: 600,
  capacityBarFill: 1200,
  capacityBarDelay: 600,
  statusDotPulse: 2400,
} as const;
