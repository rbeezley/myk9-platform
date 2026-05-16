import { type JSX, type ReactNode } from 'react';
import { POSTER_DISPLAY_FAMILY, POSTER_MONO_FAMILY } from '../fonts';
import { posterColors, posterSpacing } from '../tokens';

export interface PosterSectionHeadProps {
  /** Folio numeral as a 2-digit string, e.g. "01". */
  number: string;
  /** Eyebrow word(s), e.g. "WELCOME" — rendered as "№ 01 / WELCOME". */
  label: string;
  /** Section heading content. Wrap colored fragments in `<span style={{ color: posterColors.red }}>` etc. */
  children: ReactNode;
  /** Optional override color for the folio mono number. Defaults to red. */
  numberColor?: string;
  /** Optional override color for the title. Defaults to ink. */
  titleColor?: string;
  /** Optional font-size override for the title. Defaults to 96px. */
  titleSize?: number;
}

/**
 * The Poster section head — a two-column layout pairing the small mono
 * folio number ("№ 01 / WELCOME") with a giant Archivo Black title.
 *
 * Mirrors the Banner pattern (eyebrow + title) but with Poster's mono
 * folio convention and Archivo Black at 96px instead of Inter Tight 900
 * at 56px. The grid is 160/1fr so the title occupies the visual weight.
 *
 * Mobile collapse handled by `poster.css` `.po-section-head` rule.
 */
export function PosterSectionHead({
  number,
  label,
  children,
  numberColor = posterColors.red,
  titleColor = posterColors.ink,
  titleSize = 96,
}: PosterSectionHeadProps): JSX.Element {
  return (
    <header
      className="po-section-head"
      style={{
        display: 'grid',
        gridTemplateColumns: `${posterSpacing.sectionHeadFolioWidth}px 1fr`,
        gap: 48,
        alignItems: 'baseline',
        marginBottom: 56,
      }}
    >
      <div
        style={{
          fontFamily: POSTER_MONO_FAMILY,
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.04em',
          color: numberColor,
          paddingTop: 12,
        }}
      >
        № {number} / {label.toUpperCase()}
      </div>
      <h2
        className="po-section-title"
        style={{
          fontFamily: POSTER_DISPLAY_FAMILY,
          fontWeight: 400,
          fontSize: titleSize,
          letterSpacing: '-0.035em',
          lineHeight: 0.88,
          color: titleColor,
          margin: 0,
          textWrap: 'balance',
        }}
      >
        {children}
      </h2>
    </header>
  );
}
