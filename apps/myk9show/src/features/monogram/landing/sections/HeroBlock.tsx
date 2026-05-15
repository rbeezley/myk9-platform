import { MonogramEmboss } from '../../components/MonogramEmboss';
import { MonogramHeading } from '../../components/MonogramHeading';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY, MONOGRAM_MONOGRAM_FAMILY } from '../../fonts';
import { monogramColors, monogramSpacing } from '../../tokens';
import { formatDateInTimezone, formatDateRange } from '../utils/dateFormat';

interface HeroBlockProps {
  monogramLetters: string;
  showName: string;
  showSubtitle: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  entryCloseDate: string | null;
  entryLimit: number | null;
  venueName: string | null;
  venueCity: string | null;
  timezone: string;
  entryWizardUrl: string;
}

const SMALLCAPS_MUTE: React.CSSProperties = {
  fontFamily: MONOGRAM_BODY_FAMILY,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.32em',
  textTransform: 'uppercase',
  color: monogramColors.mute,
  display: 'block',
  marginBottom: 6,
};

const META_VALUE: React.CSSProperties = {
  fontFamily: MONOGRAM_DISPLAY_FAMILY,
  fontSize: 22,
  color: monogramColors.ink,
  letterSpacing: '-0.01em',
};

const META_EM: React.CSSProperties = {
  fontStyle: 'italic',
  color: monogramColors.bronze,
};

/**
 * Hero block — the visual centerpiece of the Monogram landing.
 *
 * Layout: a 640px embossed-paper monogram floats behind the content (absolute,
 * centered, pointer-events: none). On top, a 4-cell meta grid surfaces the
 * facts a returning entrant scans for: dates, closing, limit, venue.
 *
 * The kicker line uses a flexbox-with-pseudo-elements trick in the mock CSS;
 * here we render explicit decorative rule spans rather than `::before` /
 * `::after`, since inline styles can't address pseudo-elements.
 */
export function HeroBlock({
  monogramLetters,
  showName,
  showSubtitle,
  trialStartDate,
  trialEndDate,
  entryCloseDate,
  entryLimit,
  venueName,
  venueCity,
  timezone,
  entryWizardUrl,
}: HeroBlockProps) {
  const countdown = useCountdown(entryCloseDate, timezone);
  const dateRangeLabel = formatDateRange(trialStartDate, trialEndDate, timezone);
  const closesLabel = entryCloseDate ? formatDateInTimezone(entryCloseDate, timezone, 'monthDay') : null;
  const venueLabel = [venueName, venueCity].filter(Boolean).join(' · ') || null;

  // Subtitle: registry license + dateRange, mirroring the handoff's "AKC
  // Licensed Trial · 12–14 June 2026" kicker.
  const heroKicker = [showSubtitle, dateRangeLabel].filter(Boolean).join(' · ');

  return (
    <header
      className="mg-hero"
      style={{
        position: 'relative',
        padding: '96px 56px 80px',
        overflow: 'hidden',
        borderBottom: '1px solid rgba(28, 24, 21, 0.12)',
      }}
    >
      <MonogramEmboss
        letters={monogramLetters}
        size={monogramSpacing.heroMonogramSize}
        variant="embossed"
        surface="paper"
        className="mg-hero__monogram"
      />

      <div
        className="mg-hero__inner"
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1100,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <div
          className="mg-hero__kicker"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            marginBottom: 36,
          }}
        >
          <span aria-hidden style={{ height: 1, background: monogramColors.ink, width: 60 }} />
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
            {heroKicker}
          </span>
          <span aria-hidden style={{ height: 1, background: monogramColors.ink, width: 60 }} />
        </div>

        <MonogramHeading level={1} className="mg-hero__title">
          {showName || 'Untitled Trial'}
        </MonogramHeading>

        {showSubtitle && (
          <p
            className="mg-hero__sub"
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 24,
              color: monogramColors.quill,
              maxWidth: 640,
              margin: '24px auto 40px',
            }}
          >
            {showSubtitle}
          </p>
        )}

        <div
          className="mg-hero__meta"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            maxWidth: 880,
            margin: '0 auto 44px',
            borderTop: `1px solid ${monogramColors.ink}`,
            borderBottom: `1px solid ${monogramColors.ink}`,
          }}
        >
          <div className="mg-hero__meta-cell" style={metaCellStyle}>
            <span style={SMALLCAPS_MUTE}>Dates</span>
            <span style={META_VALUE}>{dateRangeLabel || '—'}</span>
          </div>
          <div className="mg-hero__meta-cell" style={metaCellStyle}>
            <span style={SMALLCAPS_MUTE}>Closes</span>
            <span style={META_VALUE}>{closesLabel || 'TBA'}</span>
          </div>
          <div className="mg-hero__meta-cell" style={metaCellStyle}>
            <span style={SMALLCAPS_MUTE}>Limit</span>
            <span style={META_VALUE}>
              {entryLimit != null ? (
                <>
                  {entryLimit} <span style={META_EM}>runs</span>
                </>
              ) : (
                <span style={META_EM}>Open</span>
              )}
            </span>
          </div>
          <div className="mg-hero__meta-cell" style={metaCellStyleLast}>
            <span style={SMALLCAPS_MUTE}>Venue</span>
            <span style={META_VALUE}>{venueLabel || 'TBA'}</span>
          </div>
        </div>

        {countdown.hasTarget && !countdown.closed && (
          <p
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 13,
              color: monogramColors.mute,
              marginBottom: 28,
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ fontFamily: MONOGRAM_MONOGRAM_FAMILY, fontSize: 18, color: monogramColors.bronze }}>
              {countdown.days}
            </span>{' '}
            days · {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')} until
            entries close
          </p>
        )}
        {countdown.closed && (
          <p
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: monogramColors.bronze,
              marginBottom: 28,
            }}
          >
            Entries closed
          </p>
        )}

        <a
          href={entryWizardUrl}
          className="mg-hero__cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 36px',
            background: monogramColors.ink,
            color: monogramColors.paper,
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontSize: 18,
            letterSpacing: '0.02em',
            textDecoration: 'none',
            transition: 'all 280ms ease',
          }}
        >
          Enter your dog
          <span
            aria-hidden
            style={{ fontFamily: MONOGRAM_MONOGRAM_FAMILY, fontSize: 22 }}
          >
            →
          </span>
        </a>
      </div>
    </header>
  );
}

const metaCellStyle: React.CSSProperties = {
  padding: '18px 16px',
  borderRight: '1px solid rgba(28, 24, 21, 0.16)',
  textAlign: 'center',
};

const metaCellStyleLast: React.CSSProperties = {
  ...metaCellStyle,
  borderRight: 'none',
};
