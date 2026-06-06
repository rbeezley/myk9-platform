import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors } from '../../tokens';

interface StickyNavProps {
  flag: string;
  entryCount: number;
  entryLimit: number | null;
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
 * Carries anchor links to each section and a live-status pulsing dot
 * (the only animated colored element on the page per the design system).
 */
export function StickyNav({ flag, entryCount, entryLimit }: StickyNavProps) {
  const statusLabel =
    entryLimit != null
      ? `Entries open · ${entryCount} / ${entryLimit}`
      : `Entries open · ${entryCount}`;

  return (
    <nav
      className="bn-subbar"
      style={{
        position: 'sticky',
        top: 0,
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: BANNER_DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.04em',
          color: flag,
        }}
        aria-label={statusLabel}
      >
        <span className="bn-status-dot" aria-hidden />
        {statusLabel}
      </div>
    </nav>
  );
}
