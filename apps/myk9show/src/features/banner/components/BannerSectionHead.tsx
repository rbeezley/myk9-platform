import { type JSX, type ReactNode } from 'react';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../fonts';
import { bannerColors } from '../tokens';

export interface BannerSectionHeadProps {
  /** Folio numeral as a 2-digit string, e.g. "01". */
  number: string;
  /** Eyebrow word(s) — rendered alongside the number as "01 / WELCOME". */
  label: string;
  /** Section heading. Wrap the colored fragment in `<span className="colored">…</span>`. */
  children: ReactNode;
  /** Per-club flag color for the colored fragment. */
  flag: string;
}

/**
 * Banner section heading — the architectural element that gives every
 * content section a consistent left-aligned anchor. Renders as
 * "01 / WELCOME" in monolithic Inter Tight on the left, with the giant
 * Inter Tight 900 title on the right.
 *
 * The colored portion of the title (the "important" word — "the chair.",
 * "the facts.", "quickly.", "ringside.") uses the per-club flag color.
 * Wrap the fragment you want colored in `<span className="colored">…</span>`
 * and the CSS scope picks up the color via inline style on this primitive.
 */
export function BannerSectionHead({
  number,
  label,
  children,
  flag,
}: BannerSectionHeadProps): JSX.Element {
  return (
    <header
      className="bn-section-head"
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gap: 32,
        alignItems: 'baseline',
        marginBottom: 48,
        paddingBottom: 18,
        borderBottom: `1px solid ${bannerColors.ink}`,
        // The colored fragment looks up flag via a CSS var so nested spans
        // pick it up without prop-drilling.
        ['--bn-section-flag' as string]: flag,
      }}
    >
      <div
        style={{
          fontFamily: BANNER_DISPLAY_FAMILY,
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '0.2em',
          color: flag,
          lineHeight: 1.4,
        }}
      >
        {number} / {label.toUpperCase()}
      </div>
      <h2
        className="bn-section__title"
        style={{
          fontFamily: BANNER_DISPLAY_FAMILY,
          fontWeight: 900,
          fontSize: 56,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
          color: bannerColors.ink,
          margin: 0,
        }}
      >
        {children}
      </h2>
    </header>
  );
}
