/**
 * Field Guide design tokens — colors, spacing, durations.
 *
 * Source: docs/design/claude_code_handoff/design_handoff_field_guide/README.md.
 * The Deno edge function keeps a parallel copy in
 * supabase/functions/send-confirmation-email/fieldGuide-email.ts (Deno
 * cannot import workspace packages). Keep them in visual sync.
 *
 * Field Guide is fully fixed — there is no per-club brand-color machinery
 * (unlike Banner). Every show that selects this style gets the same
 * parchment + indicator-orange palette; the discipline is part of the
 * "utility reference document" intent.
 */

export const fieldGuideColors = {
  /** Page background — pale parchment. */
  paper: '#f6f1e6',
  /** Alternating row, header cell, mini-card background. */
  paperWarm: '#ebe4cf',
  /** Dark band (top strip, footer, mail-to). Same hex as ink. */
  paperDeep: '#1f2a24',
  /** Body type, rules. */
  ink: '#1f2a24',
  /** Body copy — slightly softer than ink. */
  soft: '#3a4339',
  /** Captions, mono labels. */
  mute: '#6b6e5e',
  /** Internal table hairlines. */
  hair: '#c4bba0',
  /** Indicator accent — chips, totals, CTA, status. */
  orange: '#c96442',
  /** Folio numbers, links, deeper accent text. */
  orangeDeep: '#8a3e21',
  /** Secondary indicator — used sparingly, 2–3× per page max. */
  cyan: '#3a6e72',
} as const;

export type FieldGuideColorToken = keyof typeof fieldGuideColors;

/**
 * Vertical rhythm. Field Guide is denser than Heritage / Banner — sections
 * are 64px instead of 96px because the page is meant to be scanned.
 */
export const fieldGuideSpacing = {
  sectionPaddingY: 64,
  pageGutterX: 32,
  contentMax: 1200,
} as const;

/**
 * Animation durations in ms. Field Guide is the most static style — only
 * the capacity bar animates, and only on first reveal.
 */
export const fieldGuideDurations = {
  capacityBarFill: 1100,
  capacityBarDelay: 400,
} as const;
