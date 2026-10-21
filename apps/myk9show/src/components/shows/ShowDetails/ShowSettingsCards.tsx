import React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VenueLocationCard } from '@/components/secretary/VenueLocationCard';
import { VenueWifiCard } from '@/components/secretary/VenueWifiCard';
import { RefundAllEntriesCard } from '@/components/shows/RefundAllEntriesCard';
import { WithdrawalPolicyCard } from '@/components/shows/WithdrawalPolicyCard';
import { useVenueWifiMutation } from '@/hooks/mutations/useVenueWifiMutation';
import { useShowVenueWifi } from '@/hooks/queries/useShowVenueWifi';

/**
 * Venue Wi-Fi, composed so the card never seeds its inputs from an unloaded read: it is mounted
 * only once the saved values resolve, so a saved network is never shown (and re-saved) as blank.
 */
const ShowVenueWifi: React.FC<{ showId: string }> = ({ showId }) => {
  const { data, isError, refetch } = useShowVenueWifi(showId);
  const mutation = useVenueWifiMutation();
  if (isError && !data) {
    return (
      <div role="alert" className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <p>We couldn't load the venue WiFi. Please try again.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <Skeleton className="h-32 w-full rounded-lg" aria-label="Loading venue WiFi" />;
  return (
    <VenueWifiCard
      key={`${data.venueWifiNetwork ?? ''}|${data.venueWifiPassword ?? ''}`}
      showId={showId}
      network={data.venueWifiNetwork ?? ''}
      password={data.venueWifiPassword ?? ''}
      onSave={(network, password) => mutation.mutate({ showId, network, password })}
      isSaving={mutation.isPending}
    />
  );
};

/**
 * The show-level settings that used to live on the unlinked /secretary/settings page (IA-1):
 * the venue map pin, the Wi-Fi the armband labels print, the per-show withdrawal policy, and the
 * human-approved refund-all for a cancelled show. Every card is keyed on the show the route
 * opened, never on the store's `selectedShowId`. Managers only.
 *
 * INTENT: refund-all appears only once the show is cancelled (owner decision, MYK9-1296). A live
 * show never carries a "mark cancelled and refund everyone" control one click from its header.
 * A show is cancelled through the Status select on the Edit show panel's Basic Info tab, or the
 * Managing tab's "Mark Cancelled" bulk action (the header status pill offers no cancel), and the
 * refund card then appears here. The card itself is unchanged and still re-reads the status from the server.
 */
export const ShowSettingsCards: React.FC<{ showId: string; showStatus: string }> = ({
  showId,
  showStatus,
}) => (
  <div className="space-y-3" data-testid="show-settings-cards">
    <VenueLocationCard showId={showId} />
    <ShowVenueWifi showId={showId} />
    <WithdrawalPolicyCard scope="show" entityId={showId} />
    {showStatus === 'cancelled' && <RefundAllEntriesCard showId={showId} />}
  </div>
);
