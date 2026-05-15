import { BannerFlagBar } from '../../components/BannerFlagBar';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { BannerBrandColors } from '../../hooks/useBannerBrandColor';

interface FinalFlagBandProps {
  brandColors: BannerBrandColors;
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
  /** Prefix copy before the colored accent word. Default: "See you". */
  closingLead?: string;
  /** Colored accent word inside the final headline. Default: "ringside". */
  closingAccent?: string;
}

export function FinalFlagBand({
  brandColors,
  entryWizardUrl,
  entryCloseDate,
  timezone,
  closingLead = 'See you',
  closingAccent = 'ringside',
}: FinalFlagBandProps) {
  const closesLabel = entryCloseDate ? formatDateInTimezone(entryCloseDate, timezone, 'long') : null;

  return (
    <div id="enter">
      <BannerFlagBar
        variant="final"
        color={brandColors.flag}
        colorDeep={brandColors.flagDeep}
        textColor={bannerColors.paper}
      >
        {closesLabel && (
          <p
            style={{
              fontFamily: BANNER_BODY_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: brandColors.flagBright,
              margin: '0 0 18px',
            }}
          >
            Closes {closesLabel}
          </p>
        )}
        <h2
          style={{
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 900,
            fontSize: 80,
            letterSpacing: '-0.045em',
            lineHeight: 0.95,
            margin: '0 0 32px',
            color: bannerColors.paper,
            maxWidth: 900,
          }}
        >
          {closingLead}{' '}
          <span style={{ color: brandColors.flagBright }}>{closingAccent}.</span>
        </h2>
        <a
          href={entryWizardUrl}
          style={{
            display: 'inline-block',
            padding: '18px 36px',
            background: bannerColors.paper,
            color: bannerColors.ink,
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '-0.005em',
            textDecoration: 'none',
            border: 'none',
          }}
        >
          Open the entry wizard →
        </a>
      </BannerFlagBar>
    </div>
  );
}
