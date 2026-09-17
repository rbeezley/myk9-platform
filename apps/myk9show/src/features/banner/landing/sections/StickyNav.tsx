import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors } from '../../tokens';
import { formatEntryCount } from '@/features/_shared/landing/entryCount';

interface StickyNavProps {
  entryWizardUrl: string;
  entryCount: number | null;
  entryLimit: number | null;
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
 * Carries anchor links to each section, the live entry-status readout, and
 * (MYK9-633 round 2) the page's one desktop entry CTA.
 *
 * MYK9-633 round 2: this is now the page's ONE desktop entry CTA. The
 * masthead's own "Enter this show" link was reachable only while scrolled
 * to the very top — everywhere else on the page (any scroll position past
 * the masthead) had zero entry action once the duplicate final-band CTA
 * was removed. This bar's `position: sticky` keeps it in view at every
 * scroll position, so the CTA lives here instead.
 *
 * MYK9-633 round 3: round 2 dropped the entry-count status text and dot
 * while adding the CTA — the issue asked for one CTA, not removal of
 * status copy (poster's equivalent StickyNav kept its status line
 * alongside its CTA). Restored both. The section-anchor list is now
 * `.bn-subbar-sections`, hidden below a breakpoint (banner.css) — the
 * same pattern Heritage's StickyNav already uses — because fitting five
 * section links AND the status line AND the CTA in one row at narrow
 * widths overflowed (measured: 481px on origin/main with no CTA, 504px
 * once round 2 added one).
 *
 * MYK9-633 round 4: the section-anchor list is hidden below 852px, not
 * 640px — round 3's `flex-wrap: wrap` let the row silently grow to two
 * lines (133px tall) from 640px up to 851px, the row's measured natural
 * (unwrapped) content width; only at 852px+ does it fit on one line
 * unwrapped. `flex-wrap` itself is now removed: with the section list
 * hidden, the remaining status+CTA group's natural width (293.5px) never
 * approaches even the narrowest supported viewport, so no wrap is ever
 * needed. This is a real width range with no compact affordance replacing
 * the hidden section links (a future improvement, not this issue) — so
 * the `<nav>` landmark's label was changed from "Show sections" to the
 * always-true "Show navigation" rather than leave an aria-label that lies
 * about the landmark's contents at 6 out of 8 measured widths.
 */
export function StickyNav({
  entryWizardUrl,
  entryCount,
  entryLimit,
  canEnterOnline = true,
  entryClosed = false,
}: StickyNavProps) {
  const statusLabel =
    entryCount == null
      ? 'Entries open · count unavailable'
      : entryLimit != null
        ? `Entries open · ${formatEntryCount(entryCount)} / ${entryLimit}`
        : `Entries open · ${formatEntryCount(entryCount)}`;

  return (
    <nav
      aria-label="Show navigation"
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div className="bn-subbar-sections" style={{ display: 'flex', gap: 28 }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.04em',
            color: bannerColors.flag,
            whiteSpace: 'nowrap',
          }}
        >
          {/* MYK9-633 round 4: aria-label on a plain <div> (no ARIA role)
              is inert -- assistive tech ignores it and falls back to the
              element's own text content, which already reads identically
              to statusLabel. Dropped the redundant attribute. */}
          <span className="bn-status-dot" aria-hidden />
          {statusLabel}
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
              whiteSpace: 'nowrap',
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
              whiteSpace: 'nowrap',
            }}
          >
            {entryClosed ? 'Entries closed' : 'Classes pending'}
          </span>
        )}
      </div>
    </nav>
  );
}
