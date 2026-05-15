import { type JSX, type ReactNode } from 'react';
import { MonogramSectionFolio } from './MonogramSectionFolio';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../fonts';
import { monogramColors } from '../tokens';

export interface MonogramSectionHeadProps {
  /** Folio numeral, lowercase roman (i, ii, iii…viii). Decorative. */
  numeral: string;
  /** Bronze small-caps eyebrow above the title (e.g. "Trial particulars"). */
  eyebrow: string;
  /** Section title. Wrap accent fragments in `<span className="italic">…</span>`
   *  to get the bronze italic styling. ReactNode so callers can interpolate
   *  data into the accent. */
  title: ReactNode;
}

/**
 * The two-column section header used by every content section on the
 * Monogram landing: 80px folio numeral on the left, eyebrow + h2 on the
 * right, separated from the section body by a 1px ink rule.
 *
 * Extracted from the inlined heads in WelcomeSection / ParticularsSection /
 * JudgesSection / RosterSection / PlanSection / OfficersSection (PR #187
 * review). Single source of truth for the eyebrow type scale, bronze tone,
 * and h2 weight — design-system updates touch one file.
 */
export function MonogramSectionHead({
  numeral,
  eyebrow,
  title,
}: MonogramSectionHeadProps): JSX.Element {
  return (
    <header
      className="mg-section__head"
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr',
        gap: 28,
        alignItems: 'baseline',
        marginBottom: 48,
        paddingBottom: 16,
        borderBottom: `1px solid ${monogramColors.ink}`,
      }}
    >
      <MonogramSectionFolio numeral={numeral} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: monogramColors.bronze,
          }}
        >
          {eyebrow}
        </span>
        <h2
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontSize: 44,
            letterSpacing: '-0.015em',
            color: monogramColors.ink,
            margin: 0,
            lineHeight: 1.1,
            fontWeight: 400,
          }}
        >
          {title}
        </h2>
      </div>
    </header>
  );
}
