import { PosterInkBlot } from '../../components/PosterInkBlot';
import { PosterRotatingSquare } from '../../components/PosterRotatingSquare';
import {
  POSTER_DISPLAY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaSectionProps {
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
}

/**
 * The Poster final CTA — section №9. A second hero block at the page
 * bottom: cream background with a giant ink-blot in the upper-right
 * (larger than the hero's), a rotating square in the lower-left (smaller
 * but more rotated), the closing date as a mono kicker, an Archivo Black
 * 168px headline, and the primary CTA button in ink.
 */
export function FinalCtaSection({
  entryWizardUrl,
  entryCloseDate,
  timezone,
}: FinalCtaSectionProps) {
  const closesLabel = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'monthDayUpper')
    : null;
  const closesTime = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'time')
    : null;

  return (
    <section
      id="enter"
      style={{
        background: posterColors.cream,
        position: 'relative',
        overflow: 'hidden',
        borderTop: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterInkBlot
        size={880}
        position={{ top: -240, right: -240 }}
        filter={null}
      />
      <PosterRotatingSquare size={400} position={{ bottom: -100, left: -100 }} rotation={12} />

      <div
        style={{
          maxWidth: posterSpacing.contentMax,
          margin: '0 auto',
          padding: `120px ${posterSpacing.pageGutterX}px`,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontFamily: POSTER_MONO_FAMILY,
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.04em',
            color: posterColors.red,
            marginBottom: 24,
          }}
        >
          № 09 / ENTER
          {closesLabel ? ` · CLOSES ${closesLabel}${closesTime ? ` · ${closesTime.toUpperCase()}` : ''}` : ''}
        </div>
        <h2
          style={{
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 168,
            letterSpacing: '-0.05em',
            lineHeight: 0.82,
            color: posterColors.ink,
            margin: '0 0 24px',
            maxWidth: '14ch',
          }}
        >
          Enter
          <br />
          your <span style={{ color: posterColors.red }}>dog.</span>
          <br />
          <span
            style={{
              color: 'transparent',
              WebkitTextStroke: `3px ${posterColors.ink}`,
            }}
          >
            Today.
          </span>
        </h2>
        <p
          style={{
            fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '-0.015em',
            lineHeight: 1.35,
            color: posterColors.inkSoft,
            maxWidth: 540,
            margin: '0 0 40px',
          }}
        >
          First-received until the limit is hit. Refunds for written withdrawals before close.
        </p>
        <a
          href={entryWizardUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '22px 44px',
            background: posterColors.ink,
            color: posterColors.cream,
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontSize: 20,
            letterSpacing: '-0.015em',
            transition: 'all 200ms ease',
            position: 'relative',
            zIndex: 3,
            textDecoration: 'none',
          }}
        >
          OPEN ENTRY WIZARD →
        </a>
      </div>
    </section>
  );
}
