import {
  POSTER_DISPLAY_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';

interface PosterFooterProps {
  clubName: string;
  clubEstablished?: string | null;
  memberClubLanguage: string;
  licenseLanguage: string;
  venueAddress?: string | null;
  secretaryName?: string | null;
  secretaryEmail?: string | null;
  secretaryPhone?: string | null;
}

/**
 * The Poster footer — full-width ink band carrying the club mark, an
 * affiliate strip, and a fine-print rule across the bottom. Three-column
 * grid with the club identity dominant on the left.
 */
export function PosterFooter({
  clubName,
  clubEstablished,
  memberClubLanguage,
  licenseLanguage,
  venueAddress,
  secretaryName,
  secretaryEmail,
  secretaryPhone,
}: PosterFooterProps) {
  const lockup = [clubEstablished ? `EST. ${clubEstablished}` : null, memberClubLanguage]
    .filter(Boolean)
    .join(' · ');
  const subline = [lockup, venueAddress].filter(Boolean).join(' · ').toUpperCase();

  return (
    <footer
      style={{
        background: posterColors.ink,
        color: posterColors.cream,
        padding: `48px ${posterSpacing.pageGutterX}px 24px`,
      }}
    >
      <div
        style={{
          maxWidth: posterSpacing.contentMax,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: 56,
          alignItems: 'start',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: POSTER_DISPLAY_FAMILY,
              fontSize: 32,
              letterSpacing: '-0.025em',
              lineHeight: 0.9,
              color: posterColors.cream,
              marginBottom: 12,
            }}
          >
            {(clubName || 'Kennel Club').toUpperCase()}
            <span style={{ color: posterColors.red }}>.</span>
          </div>
          {subline && (
            <p
              style={{
                fontFamily: POSTER_MONO_FAMILY,
                fontSize: 12,
                letterSpacing: '0.04em',
                color: 'rgba(243,237,224,0.65)',
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              {subline}
            </p>
          )}
        </div>

        <div>
          <h4
            style={{
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: posterColors.red,
              margin: '0 0 14px',
            }}
          >
            TRIAL SECRETARY
          </h4>
          {secretaryName && <p style={footerLink}>{secretaryName}</p>}
          {secretaryEmail && (
            <a href={`mailto:${secretaryEmail}`} style={footerLink}>
              {secretaryEmail}
            </a>
          )}
          {secretaryPhone && (
            <a href={`tel:${secretaryPhone}`} style={footerLink}>
              {secretaryPhone}
            </a>
          )}
        </div>

        <div>
          <h4
            style={{
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: posterColors.red,
              margin: '0 0 14px',
            }}
          >
            REGISTRY
          </h4>
          <p style={footerLink}>{licenseLanguage}</p>
        </div>
      </div>

      <div
        style={{
          maxWidth: posterSpacing.contentMax,
          margin: '40px auto 0',
          paddingTop: 24,
          borderTop: '1px solid rgba(243,237,224,0.18)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          fontFamily: POSTER_MONO_FAMILY,
          fontSize: 10,
          letterSpacing: '0.04em',
          color: 'rgba(243,237,224,0.5)',
        }}
      >
        <span>© {new Date().getFullYear()} {clubName.toUpperCase() || 'BCKC'}</span>
        <span>PUBLISHED VIA myK9Show</span>
      </div>
    </footer>
  );
}

const footerLink = {
  fontFamily: POSTER_MONO_FAMILY,
  fontSize: 12,
  color: 'rgba(243,237,224,0.8)',
  margin: 0,
  display: 'block',
  letterSpacing: '0.02em',
  lineHeight: 1.7,
  textDecoration: 'none',
} as const;
