/**
 * Gazette design tokens — newspaper broadsheet palette + spacing.
 *
 * Source: docs/design/claude_code_handoff/design_handoff_gazette/README.md
 * + Gazette Reconciliation Notes.md.
 *
 * The palette is fixed — Gazette has no per-club color (unlike Banner). Volume
 * and edition numerals are display metadata only; the README explicitly
 * recommends leaving them as pure visual tokens for MVP.
 */

export const gazetteColors = {
  /** Warm ivory page background. Pairs with the 0.018-opacity 45° letterpress texture. */
  paper: '#f7f1e3',
  /** Inset / footer surface. */
  paperWarm: '#ede5d2',
  /** Body type, rules, masthead — the darkest ink. */
  ink: '#2a2520',
  /** Body copy. One step lighter than ink so paragraphs read warm rather than stark. */
  soft: '#3d352c',
  /** Captions, mono labels. */
  mute: '#7a6e58',
  /** Accent — italic emphasis, kickers, classifieds tags. */
  brown: '#6b4f3a',
  /** Internal hairlines, dotted rules. */
  hair: '#b8a98a',
  /** Final-ad band background. */
  deep: '#1a1611',
} as const;

export type GazetteColorToken = keyof typeof gazetteColors;

/**
 * Vertical rhythm. README §Visual System specifies 1100px content max with
 * 48px gutter on desktop. Mobile reductions are layered in the responsive
 * block of gazette.css (≤900px → 24px gutter, column-count drops to 1).
 */
export const gazetteSpacing = {
  contentMax: 1100,
  pageGutterX: 48,
  sectionPaddingY: 48,
  columnGap: 32,
  classifiedGap: 24,
} as const;

/**
 * Type stack — three families with distinct roles.
 *
 * `bodyFeatureSettings` is consumed by gazette.css and by inline styles on
 * landing body copy. NOTE: @react-pdf does not implement OpenType feature
 * shaping (pdfkit reads glyph tables directly without a layout engine), so
 * PDF entry blanks fall back to lining figures regardless of this token —
 * see entry-blank/sections/pdfPrimitives.tsx for the carve-out.
 */
export const gazetteTypography = {
  display: "'Playfair Display', Georgia, serif",
  body: "'Source Serif 4', Georgia, serif",
  meta: "'IBM Plex Mono', ui-monospace, monospace",
  /** Old-style figures + standard ligatures on body copy. Email opts out (Outlook). */
  bodyFeatureSettings: '"onum" 1, "liga" 1',
} as const;

/**
 * Motion timings. Gazette is the quietest style — only four animations
 * defined. Everything else is static, matching the "print doesn't animate"
 * register established in the README.
 */
export const gazetteDurations = {
  /** Masthead title rises 6px over 800ms, 100ms delay. */
  titleFade: 800,
  titleDelay: 100,
  /** Lead title and dek rise sequentially. */
  leadTitleDelay: 280,
  leadDekDelay: 420,
  /** Capacity bar fill — the only sustained motion on the page. */
  capacityBarFill: 1400,
  capacityBarDelay: 400,
} as const;

/**
 * Lowercase-roman folios appear on the entry blank and wizard receipt
 * (i, ii, iii…). Exported as a tuple so callers can index by 0-based
 * trial/section index without recomputing.
 */
export const gazetteFolios = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'] as const;

/**
 * Section letters appear on landing-page page rules ("SECTION B · PARTICULARS").
 * `gazetteSectionLetter(0) === 'A'`.
 */
export const gazetteSectionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function gazetteSectionLetter(index: number): string {
  return gazetteSectionLetters[index] ?? String.fromCharCode(65 + index);
}

/**
 * Fixed visual metadata — the masthead always renders these unless explicitly
 * overridden. README §Open Questions Q5 recommends keeping them static for MVP.
 */
export const GAZETTE_DEFAULT_VOLUME_ROMAN = 'LXXIX';
export const GAZETTE_DEFAULT_EDITION = 47;
export const GAZETTE_DEFAULT_MOTTO = 'All the news fit to point at a hide.';
