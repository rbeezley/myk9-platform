import { PosterMonoStrip } from '../../components/PosterMonoStrip';
import { formatDateRange } from '../utils/dateFormat';

interface StickyNavProps {
  showAbbreviation: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  timezone: string;
  venueName: string | null;
  venueCity: string | null;
  entryCount: number;
  entryLimit: number | null;
  entryWizardUrl: string;
}

/**
 * The Poster top mono running strip — sits at the very top of the page
 * carrying the show abbreviation, dates, venue, capacity counter, and
 * an enter-CTA chip in red.
 *
 * Sticky positioning is intentional: the strip stays in view as the user
 * scrolls so the entry CTA is always reachable. On narrow viewports the
 * later items hide off-edge (`po-strip-item--hide-narrow`).
 */
export function StickyNav({
  showAbbreviation,
  trialStartDate,
  trialEndDate,
  timezone,
  venueName,
  venueCity,
  entryCount,
  entryLimit,
  entryWizardUrl,
}: StickyNavProps) {
  const dateLabel = formatDateRange(trialStartDate, trialEndDate, timezone, true);
  const venueLabel = [venueName, venueCity].filter(Boolean).join(', ').toUpperCase();
  const capacityLabel =
    entryLimit != null ? `${entryCount} / ${entryLimit} CLAIMED` : `${entryCount} ENTERED`;

  const items = [
    { label: showAbbreviation || 'TRIAL' },
    ...(dateLabel ? [{ label: dateLabel }] : []),
    ...(venueLabel ? [{ label: venueLabel }] : []),
    { label: capacityLabel },
  ];

  return (
    <PosterMonoStrip
      items={items}
      cta={{ label: 'ENTER →', href: entryWizardUrl }}
      className="po-sticky-nav"
      ariaLabel="Trial header"
    />
  );
}
