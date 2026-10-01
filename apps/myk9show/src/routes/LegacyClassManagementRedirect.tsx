/**
 * Redirect for the retired Class Management page (MYK9-924).
 *
 * Judge assignment and bulk status moved to Setup → Classes, so the page's URLs land there:
 *   /shows/:id/classes/:trialId?status=…  ->  /shows/:id/setup?section=classes&view=…
 *   /trials/:trialId/classes              ->  the same, with the show looked up from the trial
 *
 * Only the lifecycle `status` filter maps (to the Classes view of the same name); the trial,
 * element, search, density and focus params have no Setup equivalent and are dropped.
 */
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { useTrialRedirectTarget } from './useTrialRedirectTarget';
import { getSetupClassesHref } from '@/pages/secretary/showSetupSections';

const VIEW_FOR_LEGACY_STATUS: Readonly<Record<string, string>> = {
  not_started: 'pending',
  completed: 'completed',
};

function useLegacyView(): string | undefined {
  const [searchParams] = useSearchParams();
  return VIEW_FOR_LEGACY_STATUS[searchParams.get('status') ?? ''];
}

export function LegacyShowClassManagementRedirect() {
  const { id } = useParams<{ id: string }>();
  const view = useLegacyView();
  if (!id) return <Navigate to="/secretary/dashboard" replace />;
  return <Navigate to={getSetupClassesHref(id, view)} replace />;
}

export function LegacyTrialClassManagementRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  if (!trialId) return <Navigate to="/secretary/dashboard" replace />;
  return <TrialClassManagementRedirect key={trialId} trialId={trialId} />;
}

function TrialClassManagementRedirect({ trialId }: { trialId: string }) {
  const view = useLegacyView();
  const target = useTrialRedirectTarget(trialId);

  if (target.status === 'found') {
    return <Navigate to={getSetupClassesHref(target.showId, view)} replace />;
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
