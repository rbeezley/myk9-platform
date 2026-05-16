import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';

interface FieldGuideFooterProps {
  showCode: string;
  clubName: string;
  memberClubLanguage: string;
  licenseLanguage: string;
  venueAddress?: string | null;
  secretaryName?: string | null;
  secretaryEmail?: string | null;
  secretaryPhone?: string | null;
}

/**
 * The page-closing footer — three columns of mono-caption details with a
 * fine-print rule beneath. Stays on the parchment background (no dark
 * band here — the FinalCtaSection is the dark closer).
 */
export function FieldGuideFooter({
  showCode,
  clubName,
  memberClubLanguage,
  licenseLanguage,
  venueAddress,
  secretaryName,
  secretaryEmail,
  secretaryPhone,
}: FieldGuideFooterProps) {
  return (
    <footer
      style={{
        background: fieldGuideColors.paper,
        padding: '32px 32px 18px',
        borderTop: `1px solid ${fieldGuideColors.ink}`,
      }}
    >
      <div
        style={{
          maxWidth: fieldGuideSpacing.contentMax,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: 48,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: '-0.015em',
              color: fieldGuideColors.ink,
              marginBottom: 6,
            }}
          >
            {clubName || 'Kennel Club'}
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontSize: 12,
              letterSpacing: '0.02em',
              color: fieldGuideColors.soft,
              lineHeight: 1.7,
            }}
          >
            {memberClubLanguage}
          </p>
          {venueAddress && (
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: FIELD_GUIDE_MONO_FAMILY,
                fontSize: 12,
                letterSpacing: '0.02em',
                color: fieldGuideColors.soft,
                lineHeight: 1.7,
              }}
            >
              {venueAddress}
            </p>
          )}
        </div>

        {(secretaryName || secretaryEmail || secretaryPhone) && (
          <div>
            <h4
              style={{
                margin: '0 0 12px',
                fontFamily: FIELD_GUIDE_MONO_FAMILY,
                fontWeight: 600,
                fontSize: 10.5,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: fieldGuideColors.mute,
              }}
            >
              TRIAL SECRETARY
            </h4>
            {secretaryName && (
              <p
                style={{
                  margin: 0,
                  fontFamily: FIELD_GUIDE_MONO_FAMILY,
                  fontSize: 12,
                  color: fieldGuideColors.ink,
                  fontWeight: 600,
                  lineHeight: 1.7,
                }}
              >
                {secretaryName}
              </p>
            )}
            {secretaryEmail && (
              <a
                href={`mailto:${secretaryEmail}`}
                style={{
                  display: 'block',
                  fontFamily: FIELD_GUIDE_MONO_FAMILY,
                  fontSize: 12,
                  color: fieldGuideColors.soft,
                  letterSpacing: '0.02em',
                  lineHeight: 1.7,
                }}
              >
                {secretaryEmail}
              </a>
            )}
            {secretaryPhone && (
              <a
                href={`tel:${secretaryPhone.replace(/[^0-9+]/g, '')}`}
                style={{
                  display: 'block',
                  fontFamily: FIELD_GUIDE_MONO_FAMILY,
                  fontSize: 12,
                  color: fieldGuideColors.soft,
                  letterSpacing: '0.02em',
                  lineHeight: 1.7,
                }}
              >
                {secretaryPhone}
              </a>
            )}
          </div>
        )}

        <div>
          <h4
            style={{
              margin: '0 0 12px',
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 10.5,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: fieldGuideColors.mute,
            }}
          >
            DOCUMENT
          </h4>
          <p
            style={{
              margin: 0,
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontSize: 12,
              color: fieldGuideColors.soft,
              letterSpacing: '0.02em',
              lineHeight: 1.7,
            }}
          >
            FIELD GUIDE · REV 01
            <br />
            VIA myK9Show
          </p>
        </div>
      </div>

      <div
        style={{
          maxWidth: fieldGuideSpacing.contentMax,
          margin: '24px auto 0',
          paddingTop: 16,
          borderTop: `1px solid ${fieldGuideColors.hair}`,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          fontFamily: FIELD_GUIDE_MONO_FAMILY,
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.04em',
          color: fieldGuideColors.mute,
        }}
      >
        <span>© {new Date().getFullYear()} {clubName || 'KENNEL CLUB'}</span>
        <span>{showCode} · {licenseLanguage}</span>
        <span>PAGE FIELD-GUIDE.1</span>
      </div>
    </footer>
  );
}
