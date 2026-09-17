import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors } from '../../tokens';

interface FinalCtaBandProps {
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
  canEnterOnline?: boolean;
}

/**
 * Mobile-only sticky repeat of the header CTA (MYK9-565).
 *
 * The full-page "Enter your dog in confidence" band used to be its own,
 * third repeat of the entry CTA (top: StickyNav, middle: HeroBlock, bottom:
 * this band) — the exact duplication a human tester called out unprompted.
 * The header nav's CTA (`StickyNav`, `position: sticky`) is the page's one
 * entry action on desktop; below 640px it is joined by this fixed bottom
 * bar, which is the closest existing "bottom CTA" component and is reused
 * rather than adding a new one, per the product owner's decision on
 * MYK9-565. It carries the header's exact copy ("Enter this show") and
 * renders nothing when there's no action to take: a persistently-visible
 * disabled bar has nothing to invite the visitor toward, and closed/pending
 * state is already surfaced by StickyNav's badge.
 */
export function FinalCtaBand({
  entryWizardUrl,
  entryCloseDate,
  timezone,
  canEnterOnline = true,
}: FinalCtaBandProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');
  const countdown = useCountdown(entryCloseDate, timezone);
  const canShowEntryCta = canEnterOnline && !countdown.closed;

  if (!isMobile || !canShowEntryCta) return null;

  return (
    <div
      role="region"
      aria-label="Enter this show"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        padding: '10px 16px',
        background: monogramColors.ink,
        borderTop: `1px solid ${monogramColors.bronze}`,
        // Respect the home-indicator safe area on notched phones.
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <a
        href={entryWizardUrl}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          width: '100%',
          background: monogramColors.paper,
          color: monogramColors.ink,
          fontFamily: MONOGRAM_DISPLAY_FAMILY,
          fontStyle: 'italic',
          fontSize: 16,
          letterSpacing: '0.02em',
          textDecoration: 'none',
        }}
      >
        Enter this show
      </a>
    </div>
  );
}
