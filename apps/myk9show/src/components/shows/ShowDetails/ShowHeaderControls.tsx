import React from 'react';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { useSyncNote } from '@/components/shows/ShowDetails/ShowSyncStatus';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { getTrialTimezone } from '@/features/registries';
import { isInOfflinePromptWindow } from '@/features/offline-readiness/offlinePromptWindow';
import type { Show } from '@/types/show-types';

/**
 * The device line (offline copy plus "All changes saved", one sentence and one action), live
 * status and presence. The show's own status (the pill and the publishing nudge) is one line
 * under the title instead (`ShowStatusLine`, MYK9-1282), visually separate from the device.
 */
export const ShowHeaderControls: React.FC<{ show: Show }> = ({ show }) => {
  const note = useSyncNote();
  const { data: trials } = useShowTrials(show.id);
  // Unknown timezone (trials not read yet) leaves the helper in the window: fail toward the prompt.
  const inPromptWindow = isInOfflinePromptWindow({
    firstDay: show.startDate,
    lastDay: show.endDate,
    timeZone: trials?.[0] ? getTrialTimezone(trials[0]) : null,
    now: new Date(),
  });
  return (
    <>
      {/* Offline readiness and "Save for show day" (MYK9-957: was on Show Day). */}
      <OfflineReadyBadge
        showId={show.id}
        note={note.label}
        noteNeedsAttention={note.needsAttention}
        inPromptWindow={inPromptWindow}
      />
      <LiveUpdateIndicator />
      <ShowPresenceStack />
    </>
  );
};
