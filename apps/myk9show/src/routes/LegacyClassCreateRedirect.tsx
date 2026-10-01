/**
 * Redirects for the retired Class Creation page (MYK9-899).
 *
 * The class-create flow is now the show wizard's `add-classes` mode, so the two URLs the
 * old page lived at land there, focused on the same trial:
 *   /shows/:id/classes/:trialId/create  ->  wizard?showId=:id&mode=add-classes&trialId=:trialId
 *   /trials/:trialId/classes/create     ->  the same, with the show looked up from the trial
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
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
  const trial = useTrialStore(s => s.getTrialById(trialId));
  const isLoading = useTrialStore(s => s.isLoading);
  const loadTrials = useTrialStore(s => s.loadTrials);
  const requestedLookupRef = useRef(false);
  const [lookupDone, setLookupDone] = useState(false);

  useEffect(() => {
    if (!trial && !isLoading && !requestedLookupRef.current) {
      requestedLookupRef.current = true;
      void loadTrials().finally(() => setLookupDone(true));
    }
  }, [trial, isLoading, loadTrials]);

  if (trial?.showId) return <Navigate to={getAddClassesHref(trial.showId, trialId)} replace />;
  if (isLoading || !lookupDone) return <LoadingSkeleton variant="cards" count={2} />;
  return <Navigate to="/secretary/dashboard" replace />;
}
