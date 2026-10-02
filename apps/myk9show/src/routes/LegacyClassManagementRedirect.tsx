/**
 * Redirect for the retired Class Management page (MYK9-924).
 *
 * Judge assignment and bulk status moved to Setup → Classes, so the page's URLs land there:
 *   /shows/:id/classes/:trialId?status=…  ->  /shows/:id/setup?section=classes&view=…&trialId=…
 *   /trials/:trialId/classes              ->  the same, with the show looked up from the trial
 *
 * The trial, the lifecycle `status` filter (to the Classes view of the same name), `focus` and
 * `returnTo` carry over. Element, search and density have no URL form on Setup and are dropped.
 */
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { useTrialRedirectTarget } from './useTrialRedirectTarget';
import { getSetupClassesHref } from '@/pages/secretary/showSetupSections';

const VIEW_FOR_LEGACY_STATUS: Readonly<Record<string, string>> = {
  not_started: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  all: 'all',
};

function useLegacyOptions(trialId: string | undefined) {
  const [searchParams] = useSearchParams();
  return {
    view: VIEW_FOR_LEGACY_STATUS[searchParams.get('status') ?? ''],
    options: {
      trialId,
      focusClassId: searchParams.get('focus')?.trim() || undefined,
      returnTo: searchParams.get('returnTo') || undefined,
    },
  };
}

export function LegacyShowClassManagementRedirect() {
  const { id, trialId } = useParams<{ id: string; trialId: string }>();
  const { view, options } = useLegacyOptions(trialId);
  if (!id) return <Navigate to="/secretary/dashboard" replace />;
  return <Navigate to={getSetupClassesHref(id, view, options)} replace />;
}

export function LegacyTrialClassManagementRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  if (!trialId) return <Navigate to="/secretary/dashboard" replace />;
  return <TrialClassManagementRedirect key={trialId} trialId={trialId} />;
}

function TrialClassManagementRedirect({ trialId }: { trialId: string }) {
  const { view, options } = useLegacyOptions(trialId);
  const target = useTrialRedirectTarget(trialId);

  if (target.status === 'found') {
    return <Navigate to={getSetupClassesHref(target.showId, view, options)} replace />;
  }
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
