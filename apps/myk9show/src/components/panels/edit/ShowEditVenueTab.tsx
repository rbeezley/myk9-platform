import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { ShowSettingsCards } from '@/components/shows/ShowDetails/ShowSettingsCards';

interface ShowEditVenueTabProps {
  /** Undefined while the show is unsaved: the cards persist themselves and need a saved show. */
  showId: string | undefined;
  /** The saved status; refund-all appears only once it is `cancelled` (MYK9-1296). */
  showStatus: string;
  /** Whether this tab is showing; the cards mount on first visit and then stay mounted. */
  isActive: boolean;
}

/**
 * Venue pin, Wi-Fi, withdrawal policy and (cancelled shows only) refund-all. Each card saves
 * itself, so nothing here joins the Edit form's dirty state or its Save button.
 */
export function ShowEditVenueTab({ showId, showStatus, isActive }: ShowEditVenueTabProps) {
  // Mounted on first visit (the cards read on mount) and kept mounted afterwards, so an unsaved
  // Wi-Fi, policy or pin draft survives a trip to another tab.
  const [visited, setVisited] = useState(isActive);
  if (isActive && !visited) setVisited(true);
  return (
    <TabsContent
      value="venue"
      keepMounted
      className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
    >
      {!visited ? null : showId ? (
        <>
          <p className="text-sm text-muted-foreground">
            These cards save on their own; you do not need to press Save for the show.
          </p>
          <ShowSettingsCards showId={showId} showStatus={showStatus} />
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Save the show first to set its venue and policies.
        </p>
      )}
    </TabsContent>
  );
}
