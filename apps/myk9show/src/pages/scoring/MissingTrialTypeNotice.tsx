import { Link } from 'react-router-dom';
import { useShowManageScope } from '@/hooks/useShowManageScope';

interface MissingTrialTypeNoticeProps {
  trialId: string | undefined;
  showId: string | undefined;
}

/**
 * Why a UKC/ASCA scoresheet is refused when its trial has no trial type, and where to
 * fix it. Only a viewer who can manage the show gets the link; a judge at ringside is
 * told who to ask.
 */
export function MissingTrialTypeNotice({ trialId, showId }: MissingTrialTypeNoticeProps) {
  const { canManage } = useShowManageScope(showId);
  const trialPath = showId && trialId ? `/shows/${showId}/trials/${trialId}` : null;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        This trial has no trial type set, so myK9 can&apos;t pick its scoresheet.
      </p>
      {canManage && trialPath ? (
        <Link to={trialPath} className="text-primary underline underline-offset-4">
          Set the trial type on the trial page
        </Link>
      ) : (
        <p className="text-muted-foreground">Ask the show secretary to set the trial type.</p>
      )}
    </div>
  );
}
