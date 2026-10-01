/**
 * Redirects for the retired Class Creation page (MYK9-899).
 *
 * The class-create flow is now the show wizard's `add-classes` mode, so the two URLs the
 * old page lived at land there, focused on the same trial:
 *   /shows/:id/classes/:trialId/create  ->  wizard?showId=:id&mode=add-classes&trialId=:trialId
 *   /trials/:trialId/classes/create     ->  the same, with the show looked up from the trial
 */
import { Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { useTrialQuery } from '@/hooks/queries/useTrialsDatabase';
import { useTrialStore } from '@/store/trialStore';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';

export function LegacyShowClassCreateRedirect() {
  const { id, trialId } = useParams<{ id: string; trialId: string }>();
  if (!id) return <Navigate to="/secretary/dashboard" replace />;
  return <Navigate to={getAddClassesHref(id, trialId)} replace />;
}

export function LegacyTrialClassCreateRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  if (!trialId) return <Navigate to="/secretary/dashboard" replace />;
  return <TrialClassCreateRedirect key={trialId} trialId={trialId} />;
}

function TrialClassCreateRedirect({ trialId }: { trialId: string }) {
  const storeTrial = useTrialStore(state => state.getTrialById(trialId));
  // A cold browser's store is read from IndexedDB only and can be empty before replication
  // lands, so an empty store proves nothing. Ask the by-id query (the one TrialDetailsPage
  // uses) and only fall back once it has CONFIRMED the trial is absent.
  const {
    data: fetchedTrial,
    isSuccess,
    isError,
    refetch,
  } = useTrialQuery(storeTrial ? undefined : trialId);
  const trial = storeTrial ?? fetchedTrial;

  if (trial?.showId) return <Navigate to={getAddClassesHref(trial.showId, trialId)} replace />;
  if (isError) {
    return (
      <ErrorState
        message="We couldn't load this trial. Check your connection and try again."
        onRetry={() => void refetch()}
        headingLevel={1}
      />
    );
  }
  if (isSuccess) return <Navigate to="/secretary/dashboard" replace />;
  return <LoadingSkeleton variant="cards" count={2} />;
}
