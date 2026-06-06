import { MonogramEmboss } from '../../components/MonogramEmboss';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors, monogramSpacing } from '../../tokens';

interface StickyNavProps {
  clubName: string;
  monogramLetters: string;
  entryWizardUrl: string;
}

/**
 * Sticky top nav: 32px solid-ink monogram + italic Bodoni club name on the
 * left, framed "Enter this show" CTA on the right. Translucent paper
 * background with backdrop-blur — matches the handoff's `.mg-nav` block.
 *
 * Anchors / IntersectionObserver tracking aren't required here: the Monogram
 * landing has a continuous flow rather than chapter jumps. If we later add
 * deep links to section folios, refactor to the Heritage StickyNav pattern.
 */
export function StickyNav({ clubName, monogramLetters, entryWizardUrl }: StickyNavProps) {
  return (
    <nav
      className="mg-nav"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'rgba(243, 238, 228, 0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(28, 24, 21, 0.08)',
        padding: '14px 56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: MONOGRAM_BODY_FAMILY,
      }}
    >
      <div className="mg-nav__brand" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <MonogramEmboss
          letters={monogramLetters}
          size={monogramSpacing.navMonogramSize}
          variant="solid"
          solidColor={monogramColors.ink}
        />
        <span
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 16,
            color: monogramColors.ink,
          }}
        >
          {clubName || 'Kennel Club'}
        </span>
      </div>
      <a
        href={entryWizardUrl}
        className="mg-nav__cta"
        style={{
          padding: '10px 22px',
          border: `1px solid ${monogramColors.ink}`,
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: monogramColors.ink,
          textDecoration: 'none',
          transition: 'all 240ms ease',
        }}
      >
        Enter this show
      </a>
    </nav>
  );
}
