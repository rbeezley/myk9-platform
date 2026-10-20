import { lazy, Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { resolveShowDeskReturn } from '@/features/show-map/cockpit/cockpitRoutes';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';

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

  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
      {step === 'submit' || step === 'close' ? (
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
      ) : (
        <ResultsTab />
      )}
    </Suspense>
  );
}
