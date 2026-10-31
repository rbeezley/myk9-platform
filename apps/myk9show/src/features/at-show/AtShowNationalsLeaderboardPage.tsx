/**
 * The Nationals leaderboard on the ringside route (MYK9-1540), behind the at-show access gate so a
 * judge or steward can open it; the Results tab's own route is manage-only. It reuses the Results
 * tab's data hook and view, so the board ranks released classes only, exactly as there. A show that
 * is not nationals (or not yet known to be) never shows the board.
 */
import { Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NationalsLeaderboardView } from '@/features/results-tab/NationalsLeaderboardView';
import { useResultsTabData } from '@/features/results-tab/useResultsTabData';
import { useRingsideReturnStore } from './menu/ringsideReturnStore';

export default function AtShowNationalsLeaderboardPage() {
  const { showId = '' } = useParams<{ showId: string }>();
  const {
    rows,
    entries,
    showStartDate,
    isNationals,
    rankingKeyState,
    readState,
    retry,
    refreshFailed,
  } = useResultsTabData(showId);
  const ringsideHref = `/at-show/${encodeURIComponent(showId)}`;
  // Back goes to the ringside screen the menu was opened from, else the class picker.
  const cameFrom = useRingsideReturnStore(s => s.target?.returnTo);
  const backHref = cameFrom?.startsWith(`${ringsideHref}`) ? cameFrom : ringsideHref;

  if (readState === 'loading' || rankingKeyState === 'loading') {
    return (
      <div className="p-4">
        <LoadingSkeleton variant="cards" count={3} />
      </div>
    );
  }
  if (readState === 'failed' || readState === 'unavailable' || rankingKeyState === 'unavailable') {
    return (
      <Alert className="m-4">
        <AlertTitle>Couldn&apos;t load the leaderboard</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Check your connection and try again.</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (isNationals !== true) return <Navigate to={ringsideHref} replace />;

  return (
    <div className="p-4">
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
    </div>
  );
}
