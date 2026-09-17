import { SeeClassesLink } from '@/features/_shared/SeeClassesLink';
import { PosterInkBlot } from '../../components/PosterInkBlot';
import { PosterRotatingSquare } from '../../components/PosterRotatingSquare';
import {
  POSTER_DISPLAY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaSectionProps {
  classesHref: string | null;
  entryCloseDate: string | null;
  timezone: string;
  canEnterOnline?: boolean;
  entryClosed?: boolean;
}

/**
 * The Poster final CTA — section №9. A second hero block at the page
 * bottom: cream background with a giant ink-blot in the upper-right
 * (larger than the hero's), a rotating square in the lower-left (smaller
 * but more rotated), the closing date as a mono kicker, an Archivo Black
 * 168px headline, and the primary CTA button in ink.
 */
export function FinalCtaSection({
  classesHref,
  entryCloseDate,
  timezone,
  canEnterOnline = true,
  entryClosed = false,
}: FinalCtaSectionProps) {
  const countdown = useCountdown(entryCloseDate, timezone);
  // Gate on countdown.closed (not just entryCloseDate presence) so a past close
  // date doesn't keep reading as still-pending after registration has closed.
  const closesLabel =
    entryCloseDate && !countdown.closed
      ? formatDateInTimezone(entryCloseDate, timezone, 'monthDayUpper')
      : null;
  const closesTime =
    entryCloseDate && !countdown.closed
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
      <PosterInkBlot size={880} position={{ top: -240, right: -240 }} filter={null} />
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
          {closesLabel
            ? ` · CLOSES ${closesLabel}${closesTime ? ` · ${closesTime.toUpperCase()}` : ''}`
            : ''}
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
          {canEnterOnline ? (
            <>
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
            </>
          ) : entryClosed ? (
            <>
              Entries are <span style={{ color: posterColors.red }}>closed.</span>
            </>
          ) : (
            <>
              Entries open when <span style={{ color: posterColors.red }}>classes</span> are
              assigned.
            </>
          )}
        </h2>
        {canEnterOnline ? (
          <>
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
            {/* MYK9-633: the button here duplicated the top strip's
                "ENTER" CTA — that header CTA is the page's one entry action
                at 640px+; below that it's joined by the mobile-only sticky
                bar at the end of the page. */}
          </>
        ) : (
          <p
            style={{
              fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: '-0.015em',
              lineHeight: 1.35,
              color: posterColors.inkSoft,
              maxWidth: 540,
              margin: 0,
            }}
          >
            {entryClosed
              ? 'Contact the trial secretary for late-entry help.'
              : 'The secretary still needs to assign classes before online entry is available.'}
          </p>
        )}
        <div style={{ marginTop: 14, position: 'relative', zIndex: 3 }}>
          <SeeClassesLink
            href={classesHref}
            style={{ color: posterColors.ink, fontFamily: POSTER_MONO_FAMILY }}
          />
        </div>
      </div>
    </section>
  );
}
