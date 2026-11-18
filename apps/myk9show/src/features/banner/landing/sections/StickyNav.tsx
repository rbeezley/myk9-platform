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
 * alongside its CTA). Restored both.
 *
 * MYK9-633 round 5 (restructure — rounds 3 and 4 both picked a SINGLE
 * pixel breakpoint bisected against one status string, "Entries open ·
 * 42 / 100"; a different status string breaks a fixed threshold no
 * matter where it's drawn: "· count unavailable" is wider and crushed the
 * section links to 27px at round 4's 852px threshold, and a 4-digit
 * count/limit ("· 1247 / 2000") needs more room still. That's the
 * discriminator-branches trap — a new branch (which status string is
 * live) can carry the original bug (illegible section links) right back
 * in. Restructured so layout no longer depends on knowing the longest
 * possible string ahead of time:
 *  - The CTA (or its closed/pending fallback) is `flex: none` — fixed to
 *    its own content size, never shrinks, never wraps, and is always the
 *    LAST flex child so it can never be pushed past the viewport's right
 *    edge by anything to its left.
 *  - The status text is the only flexible item (`.bn-subbar-status`):
 *    `flex: 1 1 auto; min-width: 0` lets it shrink below its content
 *    width, `overflow: hidden; text-overflow: ellipsis; white-space:
 *    nowrap` truncates instead of pushing the CTA or wrapping the row.
 *  - The section-anchor list is a `container-type: inline-size` query
 *    against `.bn-subbar` itself (banner.css) rather than a plain media
 *    query on the viewport: this app already uses `@container` elsewhere
 *    (styles/manager-responsive.css), and container queries are the
 *    right primitive here regardless — they ask "is there room in THIS
 *    bar", the actual question, not "is the viewport wide enough" (which
 *    happens to be equivalent only because this bar is full-bleed). The
 *    threshold itself is still a measured number (banner.css has it and
 *    how it was derived) — no layout here depends on getting that number
 *    exactly right the way round 3/4's did, because hiding the sections
 *    too late only means the status text truncates a little more, never
 *    a second row or a clipped CTA.
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
      }}
    >
      <div className="bn-subbar-sections">
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
              whiteSpace: 'nowrap',
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
        className="bn-subbar-status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: BANNER_DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.04em',
          // The club's flag, not the default teal token: BannerLandingPage sets
          // --bn-flag-text per show (MYK9-751, a #2329 regression) — the
          // text-safe flag, since a light flag is unreadable on paper (MYK9-765).
          color: 'var(--bn-flag-text)',
        }}
      >
        <span className="bn-status-dot" aria-hidden style={{ flexShrink: 0 }} />
        <span className="bn-subbar-status__text">{statusLabel}</span>
      </div>

      {canEnterOnline ? (
        <a
          href={entryWizardUrl}
          className="bn-subbar-cta"
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
          className="bn-subbar-cta"
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
