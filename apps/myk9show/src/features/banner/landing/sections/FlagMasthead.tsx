import { BannerFlagBar } from '../../components/BannerFlagBar';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerSpacing } from '../../tokens';
import { formatDateInTimezone, formatDateRange } from '../utils/dateFormat';
import type { BannerBrandColors } from '../../hooks/useBannerBrandColor';

interface FlagMastheadProps {
  brandColors: BannerBrandColors;
  showName: string;
  showSubtitle: string;
  clubName: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  entryCloseDate: string | null;
  entryLimit: number | null;
  venueName: string | null;
  venueCity: string | null;
  timezone: string;
  entryWizardUrl: string;
}

/**
 * The masthead — the signature Banner element. Full-bleed flag-color bar
 * holding the show identity: kicker, huge title, sub-paragraph, 4-cell
 * meta grid, primary CTA. Left-aligned throughout.
 */
export function FlagMasthead({
  brandColors,
  showName,
  showSubtitle,
  clubName,
  trialStartDate,
  trialEndDate,
  entryCloseDate,
  entryLimit,
  venueName,
  venueCity,
  timezone,
  entryWizardUrl,
}: FlagMastheadProps) {
  const dateRangeLabel = formatDateRange(trialStartDate, trialEndDate, timezone);
  const closesLabel = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'monthDay')
    : null;
  const venueLabel = [venueName, venueCity].filter(Boolean).join(', ') || null;

  return (
    <BannerFlagBar
      variant="masthead"
      color={brandColors.flag}
      textColor={brandColors.textOnFlag}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 40,
        }}
      >
        <span
          style={{
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.02em',
          }}
        >
          {clubName || 'Kennel Club'}
        </span>
        <a
          href={entryWizardUrl}
          style={{
            display: 'inline-block',
            padding: '10px 22px',
            border: `1.5px solid ${brandColors.textOnFlag}`,
            fontFamily: BANNER_BODY_FAMILY,
            fontWeight: 500,
            fontSize: 12,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: brandColors.textOnFlag,
            textDecoration: 'none',
          }}
        >
          Enter this show
        </a>
      </div>

      <p
        style={{
          fontFamily: BANNER_BODY_FAMILY,
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          opacity: 0.75,
          margin: '0 0 18px',
        }}
      >
        {showSubtitle}
      </p>

      <h1
        className="bn-hero-title"
        style={{
          fontFamily: BANNER_DISPLAY_FAMILY,
          fontWeight: 900,
          fontSize: 88,
          letterSpacing: '-0.045em',
          lineHeight: 0.95,
          margin: 0,
          maxWidth: 900,
        }}
      >
        {showName || 'Untitled Trial'}
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          marginTop: 40,
          maxWidth: bannerSpacing.contentMax,
          borderTop: `1px solid ${brandColors.textOnFlag}`,
          borderBottom: `1px solid ${brandColors.textOnFlag}`,
        }}
      >
        {[
          { label: 'Dates', value: dateRangeLabel || '—' },
          { label: 'Closes', value: closesLabel || 'TBA' },
          { label: 'Capacity', value: entryLimit != null ? `${entryLimit} runs` : 'Open' },
          { label: 'Venue', value: venueLabel || 'TBA' },
        ].map((cell, i, arr) => (
          <div
            key={cell.label}
            style={{
              padding: '20px 14px',
              borderRight: i === arr.length - 1 ? 'none' : `1px solid ${brandColors.textOnFlag}`,
            }}
          >
            <div
              style={{
                fontFamily: BANNER_BODY_FAMILY,
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                opacity: 0.75,
                marginBottom: 6,
              }}
            >
              {cell.label}
            </div>
            <div
              style={{
                fontFamily: BANNER_DISPLAY_FAMILY,
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: '-0.025em',
                color: brandColors.textOnFlag,
              }}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </BannerFlagBar>
  );
}
