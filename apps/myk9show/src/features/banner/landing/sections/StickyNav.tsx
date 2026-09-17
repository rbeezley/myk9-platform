import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors } from '../../tokens';

interface StickyNavProps {
  entryWizardUrl: string;
  canEnterOnline?: boolean;
  entryClosed?: boolean;
}

const SECTIONS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'particulars', label: 'Details' },
  { id: 'judges', label: 'Judges' },
  { id: 'plan', label: 'Plan' },
  { id: 'onday', label: 'On the day' },
] as const;

/**
 * The sub-bar — a thin sticky strip directly under the flag masthead.
 * Carries anchor links to each section.
 *
 * MYK9-633 round 2: this is now the page's ONE desktop entry CTA. The
 * masthead's own "Enter this show" link was reachable only while scrolled
 * to the very top — everywhere else on the page (any scroll position past
 * the masthead) had zero entry action once the duplicate final-band CTA
 * was removed. This bar's `position: sticky` keeps it in view at every
 * scroll position, so the CTA lives here instead.
 */
export function StickyNav({
  entryWizardUrl,
  canEnterOnline = true,
  entryClosed = false,
}: StickyNavProps) {
  return (
    <nav
      aria-label="Show sections"
      className="bn-subbar"
      style={{
        position: 'sticky',
        // Below the fixed app header, not the viewport top: at 0 this slid
        // under it and lost its top 48px. --app-top-inset is the shared
        // banner + header height (index.css, "App top-chrome offsets").
        top: 'var(--app-top-inset, 3rem)',
        zIndex: 30,
        background: bannerColors.paper,
        borderBottom: `1px solid ${bannerColors.hair}`,
        padding: '14px 64px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 28 }}>
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              fontFamily: BANNER_BODY_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: bannerColors.mute,
              textDecoration: 'none',
            }}
            onClick={e => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {s.label}
          </a>
        ))}
      </div>
      {canEnterOnline ? (
        <a
          href={entryWizardUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '8px 18px',
            border: `1.5px solid ${bannerColors.ink}`,
            fontFamily: BANNER_BODY_FAMILY,
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: bannerColors.ink,
            textDecoration: 'none',
          }}
        >
          Enter this show
        </a>
      ) : (
        <span
          style={{
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: bannerColors.mute,
          }}
        >
          {entryClosed ? 'Entries closed' : 'Classes pending'}
        </span>
      )}
    </nav>
  );
}
