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

// NOTE: gradients, typography, durations, and spacing are intentionally NOT
// re-exported as JS constants. The Magazine surfaces consume those values
// in three different ways:
//
//  - CSS rules: paint via `var(--mz-*)` custom properties in magazine.css
//  - Deno email builder: duplicates the hex values locally (Deno cannot
//    import workspace packages, see `supabase/functions/.../magazine-email.ts`)
//  - PDF renderer: duplicates the hex values locally because @react-pdf
//    cannot read CSS variables (see `entry-blank/sections/pdfPrimitives.tsx`)
//
// Adding JS bundles here would create a *fourth* source of truth with no
// reader, and divergence is the failure mode this comment exists to
// prevent. Re-add the bundles only when a real consumer needs them.
