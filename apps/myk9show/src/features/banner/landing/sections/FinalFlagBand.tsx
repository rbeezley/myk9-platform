import { BannerFlagBar } from '../../components/BannerFlagBar';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors } from '../../tokens';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { BannerBrandColors } from '../../hooks/useBannerBrandColor';

interface FinalFlagBandProps {
  brandColors: BannerBrandColors;
  entryCloseDate: string | null;
  timezone: string;
  canEnterOnline?: boolean;
  entryClosed?: boolean;
  /** Prefix copy before the colored accent word. Default: "See you". */
  closingLead?: string;
  /** Colored accent word inside the final headline. Default: "ringside". */
  closingAccent?: string;
}

export function FinalFlagBand({
  brandColors,
  entryCloseDate,
  timezone,
  canEnterOnline = true,
  entryClosed = false,
  closingLead = 'See you',
  closingAccent = 'ringside',
}: FinalFlagBandProps) {
  const countdown = useCountdown(entryCloseDate, timezone);
  // Gate on countdown.closed (not just entryCloseDate presence) so a past close
  // date doesn't keep reading as still-pending after registration has closed.
  const closesLabel =
    entryCloseDate && !countdown.closed
      ? formatDateInTimezone(entryCloseDate, timezone, 'long')
      : null;

  return (
    <div>
      <BannerFlagBar
        variant="final"
        color={brandColors.flag}
        colorDeep={brandColors.flagDeep}
        // Paper on the band is safe by construction: the derivation darkens
        // `flagDeep` until paper reaches 4.5:1 on it, and the accents below
        // use `flagBrightOnDeep`, not the decorative `flagBright` (MYK9-765).
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
              color: brandColors.flagBrightOnDeep,
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
          {canEnterOnline ? (
            <>
              {closingLead}{' '}
              <span style={{ color: brandColors.flagBrightOnDeep }}>{closingAccent}.</span>
            </>
          ) : entryClosed ? (
            <>
              Entries are <span style={{ color: brandColors.flagBrightOnDeep }}>closed.</span>
            </>
          ) : (
            <>
              Entries open when{' '}
              <span style={{ color: brandColors.flagBrightOnDeep }}>classes are assigned.</span>
            </>
          )}
        </h2>
        {/* MYK9-633: the button here duplicated the masthead's "Enter this
            show" CTA. MYK9-633 round 2 moved that CTA into StickyNav (the
            masthead is not sticky, so it was unreachable once scrolled
            past) — StickyNav's CTA is the page's one entry action at
            desktop width; below that it's joined by the mobile-only sticky
            bar at the end of the page. */}
        {!canEnterOnline && (
          <p
            style={{
              maxWidth: 520,
              margin: 0,
              fontFamily: BANNER_BODY_FAMILY,
              fontWeight: 500,
              fontSize: 15,
              lineHeight: 1.6,
              color: bannerColors.paper,
              opacity: 0.85,
            }}
          >
            {entryClosed
              ? 'Contact the trial secretary for late-entry help.'
              : 'The secretary still needs to assign classes before online entry is available.'}
          </p>
        )}
      </BannerFlagBar>
    </div>
  );
}
