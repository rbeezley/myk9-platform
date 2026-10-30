/**
 * Mounts the show-level live sync for every show on My Shows (MYK9-1523).
 *
 * `useShowLiveSync` is what turns another device's broadcast into a replica
 * sync; without it the replica notices `useMyEntriesLiveRefresh` listens to
 * only follow the background poll. One hook per show, so one child per show.
 */

import { useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';

function ShowLiveSyncMount({ showId }: { showId: string }) {
  useShowLiveSync(showId);
  return null;
}

export function MyShowsLiveSync({ showIds }: { showIds: readonly string[] }) {
  return (
    <>
      {[...new Set(showIds)].filter(Boolean).map(showId => (
        <ShowLiveSyncMount key={showId} showId={showId} />
      ))}
    </>
  );
}
