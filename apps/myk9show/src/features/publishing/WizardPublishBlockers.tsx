import {
  clubPaymentsHref,
  useCanOpenClubPayments,
} from '@/features/payments/useCanOpenClubPayments';
import { PublishBlockersList, type PublishBlockerFix } from './PublishBlockersList';
import { computeWizardPublishBlockers, type PublishBlocker } from './publishBlockers';
import { useClubPublishBlockers } from './usePublishBlockers';

interface WizardPublishBlockersProps {
  clubId: string | undefined;
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
  /** Jump back to the step that holds the entry dates (Show Details). */
  onEditDetails: () => void;
}

/**
 * The Review step's list for a show that is not saved yet (a saved show reads the server through
 * ShowPublishBlockers). The draft's own lines (premium, entry dates) come from the one pure
 * function that mirrors the server's keys and always show, offline included. The club's approval
 * and payouts come from public.club_publish_blockers; while that read is checking, offline or
 * failed it is its own row, never folded into a list that looks complete.
 */
export function WizardPublishBlockers({
  clubId,
  entryOpenDate,
  entryCloseDate,
  onEditDetails,
}: WizardPublishBlockersProps) {
  const club = useClubPublishBlockers(clubId);
  const canOpenPayments = useCanOpenClubPayments(clubId);
  const blockers = computeWizardPublishBlockers({
    clubBlockers: club.state === 'ready' ? club.blockers : null,
    entryOpenDate,
    entryCloseDate,
  });

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined => {
    switch (blocker.key) {
      case 'entry_dates_missing':
      case 'entry_dates_out_of_order':
        return { onFix: onEditDetails };
      case 'payouts_not_enabled':
        return clubId && canOpenPayments ? { href: clubPaymentsHref(clubId) } : undefined;
      default:
        return undefined;
    }
  };

  return (
    <PublishBlockersList
      state={{ state: 'ready', blockers }}
      fixFor={fixFor}
      viewerIsClubAdmin={canOpenPayments}
      clubPart={club.state === 'ready' ? undefined : club}
    />
  );
}
