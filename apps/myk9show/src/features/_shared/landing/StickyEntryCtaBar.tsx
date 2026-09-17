import { useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';

export interface StickyEntryCtaBarSurface {
  /** Bar background (typically the style's ink/dark surface). */
  background: string;
  /** Bar top border, e.g. a 1px accent rule. Optional. */
  borderTop?: string;
  /** Button fill. */
  buttonBackground: string;
  /** Button text color. */
  buttonColor: string;
  fontFamily?: string;
  fontStyle?: React.CSSProperties['fontStyle'];
  fontWeight?: React.CSSProperties['fontWeight'];
  fontSize?: number;
  letterSpacing?: string;
  textTransform?: React.CSSProperties['textTransform'];
}

interface StickyEntryCtaBarProps {
  entryWizardUrl: string;
  /** Whether the entry action is currently available (already includes
   * closed / not-yet-open / no-inventory gating — pass the same value the
   * page's header CTA uses). */
  canShowEntryCta: boolean;
  surface: StickyEntryCtaBarSurface;
  /** Visible button text. A trailing "→" is decorative and rendered
   * inside an `aria-hidden` span (MYK9-633 round 2) so it never becomes
   * part of the link's accessible name. */
  label?: string;
  /** Overrides the link's accessible name when it must differ from the
   * visible `label` — e.g. when the header CTA uses an `aria-label` of
   * its own. Must equal the header CTA's accessible name so the two links
   * read identically to assistive tech (MYK9-633 round 2). Defaults to
   * `label` with any trailing arrow stripped. */
  ariaLabel?: string;
  /** Extra class(es) on the outer bar, e.g. a style's own dark-surface
   * focus-visible utility class (`hl-on-ink`) so the bar reuses existing
   * CSS instead of a bespoke override. */
  className?: string;
}

const TRAILING_ARROW = /\s*\u2192$/;

/**
 * Mobile-only sticky repeat of a styled landing's header entry CTA
 * (MYK9-565 / MYK9-633).
 *
 * Extracted from Monogram's `FinalCtaBand` (MYK9-565, PR #2322), which
 * established the "header plus sticky" rule: at 640px and up, the header
 * nav's CTA is the page's ONE entry action; below 640px it is joined by
 * this fixed bottom bar, carrying identical copy and href. Each style's
 * `Final*Band`/`Final*Section` component renders this instead of its own
 * full-page final CTA section — the decorative content that section used
 * to wrap the CTA in is gone; the "why entry isn't available" prose lives
 * in the hero/masthead instead (kept there, not duplicated here) and this
 * bar renders nothing when there's no action to take.
 *
 * Two things a `position: fixed` bar breaks if left unhandled (round-1
 * review on #2322, MYK9-565):
 *  - It sits on top of whatever is normally last on the page (the footer),
 *    so an in-flow spacer matching the bar's measured height reserves the
 *    same space in the document, exactly like every other bottom-docked bar
 *    in this app (ClassBulkActionsBar, DogsBulkActionsBar, ...).
 *  - `useRegisterActionBar` also publishes that height to the shared
 *    action-bar registry (`actionBarStore.ts`) so `AppToaster`'s
 *    `selectReservedBottom` lifts bottom-docked toasts above it.
 *
 * Callers must render this as the LAST child of the page root (after the
 * footer), not inside `<main>` next to the CTA it replaces — placed
 * mid-page, the in-flow spacer opens a blank gap there while the footer
 * (the true last element) stays uncovered under the fixed bar (round-3
 * review on #2322).
 *
 * Callers must also add a `:focus-visible` outline-color override on
 * `.landing-sticky-cta a`, scoped by their own `[data-STYLE]` root, when
 * the default focus ring doesn't meet 3:1 contrast on `surface.background`.
 */
export function StickyEntryCtaBar({
  entryWizardUrl,
  canShowEntryCta,
  surface,
  label = 'Enter this show',
  ariaLabel,
  className,
}: StickyEntryCtaBarProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');
  const [barHeight, setBarHeight] = useState(0);
  const actionBarRef = useRegisterActionBar<HTMLDivElement>({ onHeightChange: setBarHeight });

  const shouldRender = isMobile && canShowEntryCta;

  if (!shouldRender) return null;

  const hasTrailingArrow = TRAILING_ARROW.test(label);
  const visibleLabel = hasTrailingArrow ? label.replace(TRAILING_ARROW, '') : label;
  const accessibleName = ariaLabel ?? visibleLabel;

  return (
    <>
      {/* In-flow spacer: without it the fixed bar below covers whatever the
          page normally ends with (the style's footer). */}
      <div aria-hidden="true" style={{ height: barHeight }} />

      <div
        ref={actionBarRef}
        className={['landing-sticky-cta', className].filter(Boolean).join(' ')}
        role="region"
        aria-label={accessibleName}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          padding: '10px 16px',
          background: surface.background,
          borderTop: surface.borderTop,
          // Respect the home-indicator safe area on notched phones.
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <a
          href={entryWizardUrl}
          className="landing-sticky-cta__link"
          {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            width: '100%',
            background: surface.buttonBackground,
            color: surface.buttonColor,
            fontFamily: surface.fontFamily,
            fontStyle: surface.fontStyle,
            fontWeight: surface.fontWeight,
            fontSize: surface.fontSize ?? 16,
            letterSpacing: surface.letterSpacing,
            textTransform: surface.textTransform,
            textDecoration: 'none',
          }}
        >
          {visibleLabel}
          {hasTrailingArrow && <span aria-hidden="true"> →</span>}
        </a>
      </div>
    </>
  );
}
