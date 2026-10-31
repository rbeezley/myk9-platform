/**
 * Ringside Nationals Leaderboard (MYK9-1540): the Results tab's leaderboard view, opened from the
 * ringside menu by staff who cannot reach the manager-only Results section. Same component, same
 * reads (`useResultsTabData`: replicated entries and class rows), so only RELEASED classes rank.
 */
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NationalsLeaderboardView } from '@/features/results-tab/NationalsLeaderboardView';
import { useResultsTabData } from '@/features/results-tab/useResultsTabData';
import { useTrialStore } from '@/store/trialStore';
import { getAtShowLeaderboardHref } from './atShowLeaderboardRoutes';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';
import { useIsStaffDogViewer } from './useStaffDogGate';

export function AtShowLeaderboardPage() {
  const { showId = '' } = useParams<{ showId: string }>();
  const isStaff = useIsStaffDogViewer(showId);
  // The ringside screen the menu was opened from; the class picker when the URL was opened directly.
  const returnTo = useRingsideReturnStore(state =>
    state.target?.scope === getAtShowLeaderboardHref(showId) ? state.target.returnTo : null
  );
  const loadTrials = useTrialStore(state => state.loadTrials);
  const loadTrialClasses = useTrialStore(state => state.loadTrialClasses);
  useEffect(() => {
    if (!showId || !isStaff) return;
    void loadTrials();
    void loadTrialClasses();
  }, [showId, isStaff, loadTrials, loadTrialClasses]);
  const {
    rows,
    entries,
    showStartDate,
    isNationals,
    rankingKeyState,
    readState,
    retry,
    refreshFailed,
  } = useResultsTabData(isStaff ? showId : '');

  // Staff only, and only on a nationals show: anyone else goes back to the class picker.
  if (!isStaff || isNationals === false) return <Navigate to={`/at-show/${showId}`} replace />;

  const backHref = returnTo ?? `/at-show/${encodeURIComponent(showId)}`;
  const loading =
    readState === 'loading' || (isNationals === null && rankingKeyState === 'loading');
  const failed = readState === 'failed' || readState === 'unavailable' || isNationals === null;

  return (
    <main className="ringside-root mx-auto max-w-4xl px-4 py-4" data-testid="at-show-leaderboard">
      {loading || failed ? (
        <Button asChild variant="ghost" className="min-h-11 gap-2">
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to ringside
          </Link>
        </Button>
      ) : null}
      {loading ? (
        <LoadingSkeleton variant="cards" count={3} />
      ) : failed ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Couldn&apos;t load the leaderboard</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Check your connection and try again.</span>
            <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <NationalsLeaderboardView
          showId={showId}
          entries={entries}
          rows={rows}
          showStartDate={showStartDate}
          refreshFailed={refreshFailed}
          onRetry={retry}
          backHref={backHref}
          backLabel="Back to ringside"
        />
      )}
    </main>
  );
}

export default AtShowLeaderboardPage;
