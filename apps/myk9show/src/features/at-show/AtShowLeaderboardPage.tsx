/**
 * Ringside Nationals Leaderboard (MYK9-1540): the Results tab's leaderboard view, opened from the
 * ringside menu by staff who cannot reach the manager-only Results section. The data is the
 * server's `get_nationals_leaderboard_inputs` (a complete field with released scores), never the
 * device replica, which is partial for a judge and score-masked for a steward. Online only.
 */
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NationalsLeaderboardView } from '@/features/results-tab/NationalsLeaderboardView';
import { useOnlineStatus } from '@/lib/networkUtils';
import { replicatedShowsTable } from '@/services/replication';
import { getAtShowLeaderboardHref } from './atShowLeaderboardRoutes';
import { useNationalsLeaderboardInputs } from './leaderboard/useNationalsLeaderboardInputs';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';
import { useIsStaffDogViewer } from './useStaffDogGate';

export function AtShowLeaderboardPage() {
  const { showId = '' } = useParams<{ showId: string }>();
  const isStaff = useIsStaffDogViewer(showId);
  const isOnline = useOnlineStatus();
  // The ringside screen the menu was opened from; the class picker when the URL was opened directly.
  const returnTo = useRingsideReturnStore(state =>
    state.target?.scope === getAtShowLeaderboardHref(showId) ? state.target.returnTo : null
  );
  // Same query key the class list and menu use, so this reads the cache; the replica works offline.
  const showQuery = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId),
    enabled: isStaff && Boolean(showId),
    networkMode: 'always',
  });
  const isNationals = showQuery.data ? showQuery.data.isNationals === true : null;
  // A failed or empty show lookup is its own state, not an endless skeleton.
  const showLookupFailed = showQuery.isError || (showQuery.isSuccess && !showQuery.data);
  const { inputs, isLoading, isError, liveDown, retry } = useNationalsLeaderboardInputs(
    showId,
    isStaff && isNationals === true && isOnline
  );

  // Staff only, and only on a nationals show: anyone else goes back to the class picker.
  if (!isStaff || isNationals === false) return <Navigate to={`/at-show/${showId}`} replace />;

  const backHref = returnTo ?? `/at-show/${encodeURIComponent(showId)}`;
  const back = (
    <Button asChild variant="ghost" className="min-h-11 gap-2">
      <Link to={backHref}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to ringside
      </Link>
    </Button>
  );

  const retryAll = () => {
    if (showLookupFailed) void showQuery.refetch();
    retry();
  };
  const loadError = (
    <>
      {back}
      <Alert variant="destructive" className="mt-4">
        <AlertTitle>Couldn&apos;t load the leaderboard</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Check your connection and try again.</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={retryAll}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </>
  );

  let body;
  if (!isOnline) {
    // Checked before the cache: rankings held from an earlier load may be out of date, and a
    // stale board is worse than none (it ranks the field as if nothing had moved).
    body = (
      <>
        {back}
        <Alert className="mt-4">
          <AlertTitle>Needs a connection</AlertTitle>
          <AlertDescription>
            The leaderboard ranks every dog in the show, so it is not shown from this device alone.
            It loads when you are back online.
          </AlertDescription>
        </Alert>
      </>
    );
  } else if (showLookupFailed && !inputs) {
    body = loadError;
  } else if (inputs) {
    body = (
      <>
        {liveDown && (
          <Alert className="mt-2">
            <AlertTitle>Live updates paused</AlertTitle>
            <AlertDescription>
              Rankings may be behind. They refresh when the connection returns.
            </AlertDescription>
          </Alert>
        )}
        <NationalsLeaderboardView
          showId={showId}
          entries={inputs.entries}
          rows={inputs.classRows}
          showStartDate={inputs.showStartDate}
          refreshFailed={isError}
          onRetry={retry}
          backHref={backHref}
          backLabel="Back to ringside"
        />
      </>
    );
  } else if (isError) {
    body = loadError;
  } else {
    body = (
      <>
        {back}
        {(isLoading || isNationals === null) && <LoadingSkeleton variant="cards" count={3} />}
      </>
    );
  }

  return (
    <main className="ringside-root mx-auto max-w-4xl px-4 py-4" data-testid="at-show-leaderboard">
      {body}
    </main>
  );
}

export default AtShowLeaderboardPage;
