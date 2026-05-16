import { type CSSProperties } from 'react';
import { PosterInkBlot } from '../../components/PosterInkBlot';
import { PosterRotatingSquare } from '../../components/PosterRotatingSquare';
import { PosterTitleStack, type PosterTitleWord } from '../../components/PosterTitleStack';
import {
  POSTER_DISPLAY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface HeroBlockProps {
  clubName: string;
  showName: string;
  showSubtitle: string;
  trialStartDate: string | null;
  entryCloseDate: string | null;
  entryLimit: number | null;
  venueName: string | null;
  timezone: string;
  /** AKC license number, e.g. "2026—2841". Falls back to license language. */
  licenseLabel: string | null;
}

/**
 * Build the title stack from the show name. Heuristic: split into 1–4
 * words, last word becomes red, first becomes ink, middle (if any) becomes
 * olive, and a final outline word ("'YY") riff is added when we have a
 * trial year.
 *
 * Falls back to a single-word stack with the full name if splitting
 * doesn't produce a good shape.
 */
function buildTitleWords(showName: string): PosterTitleWord[] {
  const cleaned = showName.trim();
  if (!cleaned) return [{ text: 'TRIAL', variant: 'ink' }];

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return [{ text: tokens[0]!.toUpperCase(), variant: 'ink' }];
  if (tokens.length === 2) {
    return [
      { text: tokens[0]!.toUpperCase(), variant: 'ink' },
      { text: tokens[1]!.toUpperCase() + '.', variant: 'red' },
    ];
  }
  // 3+: ink / red / olive / + tail joined into the third
  const head = tokens[0]!.toUpperCase();
  const accent = tokens[1]!.toUpperCase();
  const tail = tokens.slice(2).join(' ').toUpperCase() + '.';
  return [
    { text: head, variant: 'ink' },
    { text: accent, variant: 'red' },
    { text: tail, variant: 'olive' },
  ];
}

export function HeroBlock({
  clubName,
  showName,
  showSubtitle,
  trialStartDate,
  entryCloseDate,
  entryLimit,
  venueName,
  timezone,
  licenseLabel,
}: HeroBlockProps) {
  const titleWords = buildTitleWords(showName);
  const closesShort = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'monthDayUpper')
    : null;
  const closesTime = entryCloseDate ? formatDateInTimezone(entryCloseDate, timezone, 'time') : null;
  const trialYear = trialStartDate
    ? new Date(trialStartDate).getFullYear().toString().slice(-2)
    : null;

  const subtitleParts: string[] = [];
  if (entryLimit != null) subtitleParts.push(`${entryLimit} runs`);
  if (venueName) subtitleParts.push(`Hosted at ${venueName}`);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : showSubtitle;

  const heroStyle: CSSProperties = {
    position: 'relative',
    padding: `48px ${posterSpacing.pageGutterX}px 64px`,
    overflow: 'hidden',
    minHeight: '88vh',
    background: posterColors.cream,
  };

  return (
    <header className="po-hero" style={heroStyle}>
      <PosterInkBlot />
      <PosterRotatingSquare />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: posterSpacing.contentMax,
          margin: '0 auto',
        }}
      >
        {/* Masthead row — club mark on left, license meta on right */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 32,
            paddingBottom: 32,
            borderBottom: `2px solid ${posterColors.ink}`,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              fontFamily: POSTER_DISPLAY_FAMILY,
              fontSize: 24,
              letterSpacing: '-0.025em',
              color: posterColors.ink,
            }}
          >
            {(clubName || 'Kennel Club').toUpperCase()}
            <span style={{ color: posterColors.red }}>.</span>
          </div>
          {licenseLabel && (
            <div
              style={{
                textAlign: 'right',
                fontFamily: POSTER_MONO_FAMILY,
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: '0.04em',
                color: posterColors.ink,
              }}
            >
              {licenseLabel}
            </div>
          )}
        </div>

        {/* Title stack + year stamp */}
        <PosterTitleStack
          words={[
            ...titleWords,
            ...(trialYear ? [{ text: `'${trialYear}`, variant: 'cream-on-ink' as const }] : []),
          ]}
        />

        {/* Bottom row — sub-headline + closing chip */}
        <div
          className="po-hero-bottom"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 64,
            alignItems: 'end',
            marginTop: 64,
            position: 'relative',
            zIndex: 4,
          }}
        >
          <p
            style={{
              fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: posterColors.ink,
              maxWidth: 540,
              margin: 0,
              textWrap: 'balance',
            }}
          >
            {subtitle}
          </p>
          {closesShort && (
            <div
              style={{
                background: posterColors.ink,
                color: posterColors.cream,
                padding: '24px 32px',
                fontFamily: POSTER_MONO_FAMILY,
                minWidth: 280,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.32em',
                  textTransform: 'uppercase',
                  color: posterColors.red,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Closing
              </div>
              <div
                style={{
                  fontFamily: POSTER_DISPLAY_FAMILY,
                  fontSize: 38,
                  letterSpacing: '-0.025em',
                  lineHeight: 0.95,
                  color: posterColors.cream,
                }}
              >
                {closesShort}
              </div>
              {closesTime && (
                <div
                  style={{
                    fontFamily: POSTER_MONO_FAMILY,
                    fontSize: 11,
                    color: 'rgba(243,237,224,0.7)',
                    marginTop: 6,
                    letterSpacing: '0.04em',
                  }}
                >
                  {closesTime} · FIRM
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden semantic h1 for screen readers — title-stack uses span elements
          so a hidden h1 carries the document outline without breaking layout. */}
      <h1
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {showName}
      </h1>
    </header>
  );
}
