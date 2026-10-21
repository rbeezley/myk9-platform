/**
 * Redirects for the retired Mission Control pages (MYK9-1297, IA-8).
 *
 *   /secretary/pipeline/:trialId                           ->  /shows/:showId (the show home)
 *   /shows/:showId/trials/:trialId/classes/:classId/secretary  ->  the class page (ClassDetailsPage)
 *
 * The pipeline URL carries only a trial id, so the show is resolved the same way the legacy
 * `/trials/:trialId/classes` redirect does (MYK9-907).
 */
import { Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { useTrialRedirectTarget } from './useTrialRedirectTarget';

export function LegacyTrialPipelineRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  if (!trialId) return <Navigate to="/secretary/dashboard" replace />;
  return <TrialPipelineRedirect key={trialId} trialId={trialId} />;
}

function TrialPipelineRedirect({ trialId }: { trialId: string }) {
  const target = useTrialRedirectTarget(trialId);

  if (target.status === 'found') return <Navigate to={`/shows/${target.showId}`} replace />;
  if (target.status === 'error') {
    return (
      <ErrorState
        message="We couldn't load this trial. Check your connection and try again."
        onRetry={target.retry}
        headingLevel={1}
      />
    );
  }
  if (target.status === 'absent') return <Navigate to="/secretary/dashboard" replace />;
  return <LoadingSkeleton variant="cards" count={2} />;
}

export function LegacyClassSecretaryRedirect() {
  const { showId, trialId, classId } = useParams<{
    showId: string;
    trialId: string;
    classId: string;
  }>();
  if (!showId || !trialId || !classId) return <Navigate to="/secretary/dashboard" replace />;
  return <Navigate to={`/shows/${showId}/trials/${trialId}/classes/${classId}`} replace />;
}
