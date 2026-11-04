import { ExternalLink, MapPin, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { useShowVenueWifi } from '@/hooks/queries/useShowVenueWifi';
import { useShowWithdrawalPolicySummary } from '@/hooks/queries/useShowWithdrawalPolicySummary';
import { buildVenueMapsUrls } from '@/utils/venueMaps';
import { summarizeWithdrawalPolicy } from './withdrawalPolicySummary';
import type { Show } from '@/types/show-types';

const SECTION_CLASS = 'rounded-xl border bg-card text-card-foreground shadow-sm';
const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The show's facts, read-only (MYK9-1683): where it is, what entering costs and the withdrawal
 * policy. Every value is text; changing one is "Edit show" -> Venue & policies, linked here,
 * never a second editor. The editable cards stay on that tab (MYK9-1682).
 */
export function ShowAboutWhere({ show }: { show: Show }) {
  const wifi = useShowVenueWifi(show.id);
  const location = show.location?.trim() ?? '';
  const maps = location ? buildVenueMapsUrls(location) : null;
  const network = wifi.data?.venueWifiNetwork?.trim() || null;
  const password = wifi.data?.venueWifiPassword?.trim() || null;
  return (
    <section aria-label="Where" className={`${SECTION_CLASS} space-y-2 p-4`}>
      <h2 className="font-semibold">Where</h2>
      <p className="flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span>{location || 'No venue set yet.'}</span>
      </p>
      {maps && (
        <a
          href={maps.viewOnMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          View on Google Maps
        </a>
      )}
      <div className="flex items-start gap-2 text-sm">
        <Wifi className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
        {wifi.isLoading ? (
          <Skeleton className="h-5 w-40" aria-label="Loading venue Wi-Fi" />
        ) : !wifi.data ? (
          // Errored OR paused offline with nothing cached: not a confirmed "no Wi-Fi".
          <span>Venue Wi-Fi is unavailable right now.</span>
        ) : network ? (
          <span>
            Wi-Fi: {network}
            {password ? ` · password ${password}` : ''}
          </span>
        ) : (
          <span>No Wi-Fi set.</span>
        )}
      </div>
    </section>
  );
}

export function ShowAboutEntries({
  show,
  canManageShow,
  entryCount,
}: {
  show: Show;
  canManageShow: boolean;
  entryCount: number | null;
}) {
  return (
    <section aria-label="Entries and fees" className={SECTION_CLASS}>
      <h2 className="px-4 pt-4 font-semibold">Entries &amp; fees</h2>
      <QuickInfoCards show={show} canManageShow={canManageShow} entryCount={entryCount} />
    </section>
  );
}

export function ShowAboutWithdrawal({ showId }: { showId: string }) {
  const policy = useShowWithdrawalPolicySummary(showId);
  const lines = policy.data ? summarizeWithdrawalPolicy(policy.data) : [];
  return (
    <section aria-label="Withdrawal policy" className={`${SECTION_CLASS} space-y-1 p-4`}>
      <h2 className="font-semibold">Withdrawal policy</h2>
      {policy.isLoading ? (
        <Skeleton className="h-5 w-56" aria-label="Loading withdrawal policy" />
      ) : !policy.data ? (
        <p className="text-sm">The withdrawal policy is unavailable right now.</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This show uses the club default withdrawal policy.
        </p>
      ) : (
        lines.map(line => (
          <p key={line} className="text-sm">
            {line}
          </p>
        ))
      )}
      <Link to="?edit=true&editTab=venue" className={LINK_CLASS}>
        Change in Venue &amp; policies
      </Link>
    </section>
  );
}
