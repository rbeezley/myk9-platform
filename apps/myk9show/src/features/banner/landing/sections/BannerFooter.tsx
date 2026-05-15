import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';

interface BannerFooterProps {
  clubName: string;
  memberClubLanguage: string;
  licenseLanguage: string;
  venueAddress?: string | null;
}

export function BannerFooter({
  clubName,
  memberClubLanguage,
  licenseLanguage,
  venueAddress,
}: BannerFooterProps) {
  return (
    <footer
      style={{
        background: bannerColors.ink,
        color: bannerColors.paper,
        padding: `48px ${bannerSpacing.pageGutterX}px`,
      }}
    >
      <div
        style={{
          maxWidth: bannerSpacing.contentMax,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 48,
          alignItems: 'start',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: BANNER_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}
          >
            {clubName || 'Kennel Club'}
          </div>
          <p
            style={{
              fontFamily: BANNER_BODY_FAMILY,
              fontSize: 13,
              lineHeight: 1.55,
              color: 'rgba(250, 250, 248, 0.7)',
              margin: 0,
            }}
          >
            {memberClubLanguage}
            {venueAddress && (
              <>
                <br />
                {venueAddress}
              </>
            )}
          </p>
        </div>
        <div
          style={{
            fontFamily: BANNER_BODY_FAMILY,
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'rgba(250, 250, 248, 0.55)',
            textAlign: 'right',
            lineHeight: 2,
          }}
        >
          {licenseLanguage}
          <br />
          myK9Show
        </div>
      </div>
    </footer>
  );
}
