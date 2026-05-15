import { MonogramEmboss } from '../../components/MonogramEmboss';
import {
  MONOGRAM_BODY_FAMILY,
  MONOGRAM_DISPLAY_FAMILY,
} from '../../fonts';
import { monogramColors, monogramSpacing } from '../../tokens';

interface MonogramFooterProps {
  monogramLetters: string;
  clubName: string;
  memberClubLanguage: string;
  licenseLanguage: string;
  venueAddress?: string | null;
}

/**
 * Footer — 3-column layout: 96px solid-ink monogram, club identity block in
 * the middle, registry meta on the right (license number, sanctioning body).
 * Collapses to single-column under 900px (via monogram.css).
 */
export function MonogramFooter({
  monogramLetters,
  clubName,
  memberClubLanguage,
  licenseLanguage,
  venueAddress,
}: MonogramFooterProps) {
  return (
    <footer
      className="mg-footer"
      style={{
        padding: '56px 56px 36px',
        borderTop: '1px solid rgba(28, 24, 21, 0.18)',
        background: monogramColors.paperDeep,
        display: 'grid',
        gridTemplateColumns: '200px 1fr auto',
        gap: 56,
        alignItems: 'start',
      }}
    >
      <MonogramEmboss
        letters={monogramLetters}
        size={monogramSpacing.footerMonogramSize}
        variant="solid"
        solidColor={monogramColors.ink}
      />
      <div>
        <div
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontSize: 22,
            color: monogramColors.ink,
            marginBottom: 8,
          }}
        >
          {clubName || 'Kennel Club'}
        </div>
        <p
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 14,
            color: monogramColors.quill,
            lineHeight: 1.65,
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
          fontFamily: MONOGRAM_BODY_FAMILY,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: monogramColors.mute,
          textAlign: 'right',
          lineHeight: 2,
        }}
        className="mg-footer__meta"
      >
        {licenseLanguage}
        <br />
        myK9Show
      </div>
    </footer>
  );
}
