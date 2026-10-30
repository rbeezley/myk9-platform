/**
 * Mounts the show-level live sync for every show on My Shows (MYK9-1523).
 *
 * `useShowLiveSync` is what turns another device's broadcast into a replica
 * sync; without it the replica notices `useMyEntriesLiveRefresh` listens to
 * only follow the background poll. One hook per show, so one child per show.
 */

import { useEffect } from 'react';
import { holdFastPoll } from '@/providers/syncCadence';
import { useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';

function ShowLiveSyncMount({ showId }: { showId: string }) {
  useShowLiveSync(showId);
  return null;
}

export function MyShowsLiveSync({ showIds }: { showIds: readonly string[] }) {
  // The page also shows dogs, which no show channel broadcasts: keep the 60 s
  // poll instead of the 3-5 min one a SUBSCRIBED channel would earn.
  useEffect(() => holdFastPoll(), []);
  return (
    <>
      {[...new Set(showIds)].filter(Boolean).map(showId => (
        <ShowLiveSyncMount key={showId} showId={showId} />
      ))}
    </>
  );
}
