import { type JSX } from 'react';
import { MONOGRAM_MONOGRAM_FAMILY } from '../fonts';
import { monogramColors } from '../tokens';

export interface MonogramSectionFolioProps {
  /** Folio numeral, lowercase roman (i, ii, iii, iv, v, vi, vii, viii). */
  numeral: string;
  /** Font size in px. Defaults to 56 (matches the handoff section folio). */
  size?: number;
  /** Optional className for positioning. */
  className?: string;
}

/**
 * Lowercase-roman folio numeral rendered in Italiana on bronze.
 *
 * The Monogram visual register uses lowercase roman folios (i, ii, iii…)
 * where Heritage uses uppercase (I, II, III…). The lowercase form pairs with
 * Italiana's softer, more typewriter-feeling glyphs to suggest a printed
 * programme's table of contents rather than Heritage's engraved title page.
 *
 * Decorative; default `aria-hidden` so screen readers don't announce the
 * roman numeral alongside the section heading.
 */
export function MonogramSectionFolio({
  numeral,
  size = 56,
  className,
}: MonogramSectionFolioProps): JSX.Element {
  return (
    <span
      aria-hidden
      className={`mg-section-folio ${className ?? ''}`.trim()}
      style={{
        fontFamily: MONOGRAM_MONOGRAM_FAMILY,
        fontSize: size,
        color: monogramColors.bronze,
        lineHeight: 1,
        letterSpacing: '-0.03em',
        display: 'inline-block',
      }}
    >
      {numeral}
    </span>
  );
}

/** Convert a 1-indexed integer to its lowercase roman equivalent (caps at viii
 *  for layout safety; falls back to arabic past 8). */
export function toLowerRoman(n: number): string {
  const map = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
  if (n < 1) return String(n);
  if (n > map.length) return String(n);
  return map[n - 1]!;
}
