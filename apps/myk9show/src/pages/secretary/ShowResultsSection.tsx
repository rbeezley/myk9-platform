import { lazy, Suspense } from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { resolveShowDeskReturn } from '@/features/show-map/cockpit/cockpitRoutes';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { useOnlineStatus } from '@/lib/networkUtils';

const ShowStats = lazy(() =>
  import('@/components/analytics/ShowStatsSubTab').then(module => ({
    default: module.ShowStatsSubTab,
  }))
);
const ResultsTab = lazy(() => import('@/features/results-tab/ResultsTab'));
const ResultsSubmissionPage = lazy(() => import('@/pages/secretary/ResultsSubmissionPage'));
const ShowCloseStep = lazy(() => import('@/pages/secretary/ShowCloseStep'));

/**
 * The Results tab (MYK9-630 phase 2, rebuilt by MYK9-1031): by default the class list with each
 * class's scores beside it (`features/results-tab`).
 *
 * Submit and Close the show are still the pages they were, reached from the tab's finish row.
 * They keep their `?step=submit` and `?step=close` URLs
 * (the old `/submit-results` redirect and Overview's links emit them), so this file owns nothing
 * but which of the three is showing.
 */
export default function ShowResultsSection() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id ?? '';
  const [searchParams] = useSearchParams();
  const step = searchParams.get('step');
  const isFinishStep = step === 'submit' || step === 'close';
  const isOnline = useOnlineStatus();
  const showingStats = searchParams.get('resultsView') === 'show-stats';
  const nextParams = new URLSearchParams(searchParams);
  if (showingStats) nextParams.delete('resultsView');
  else nextParams.set('resultsView', 'show-stats');

  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
      {isFinishStep ? (
        <div className="mt-4 space-y-4">
          {/* One back link: to where the secretary came from (Overview, via returnTo) when there
              is one, otherwise to the class list (MYK9-1263). */}
          {resolveShowDeskReturn(searchParams.get('returnTo'), showId) ? (
            <ShowDeskReturnLink showId={showId} />
          ) : (
            <Link
              to={`/shows/${encodeURIComponent(showId)}/results`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All classes
            </Link>
          )}
          {step === 'submit' ? <ResultsSubmissionPage /> : <ShowCloseStep />}
        </div>
      ) : showingStats ? (
        <section className="mt-4 space-y-4">
          <Link
            to={{ search: nextParams.toString() }}
            className="inline-flex min-h-12 items-center gap-2 px-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Results
          </Link>
          <h1 className="text-xl font-semibold">Show Stats</h1>
          {isOnline ? (
            <ShowStats showId={showId} />
          ) : (
            <p role="status">Show Stats needs a connection.</p>
          )}
        </section>
      ) : (
        <ResultsTab
          showStatsLink={
            isOnline ? (
              <Link
                to={{ search: nextParams.toString() }}
                className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-md border px-3 text-sm font-medium"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Show Stats
              </Link>
            ) : (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                Show Stats needs a connection.
              </p>
            )
          }
        />
      )}
    </Suspense>
  );
}
