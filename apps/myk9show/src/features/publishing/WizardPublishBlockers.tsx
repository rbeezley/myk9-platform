import { useCanOpenClubPayments } from '@/features/payments/useCanOpenClubPayments';
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

export const CLUB_CHECK_FAILED_MESSAGE =
  'Could not check the club’s approval and payouts. Try again.';

/**
 * The Review step's list. There is no saved show to ask the server about yet, so the club's lines
 * come from public.club_publish_blockers and the rest from the draft, through the one pure
 * function that mirrors the server's keys. The draft's own lines (premium, entry dates) always
 * show, offline included. A club read that failed is one extra row with a retry, never a list
 * that looks complete without the club's lines.
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
    clubBlockers: club.status === 'ready' ? club.blockers : null,
    entryOpenDate,
    entryCloseDate,
  });
  const failedPart =
    clubId && club.status === 'error'
      ? { message: CLUB_CHECK_FAILED_MESSAGE, retry: club.retry }
      : undefined;

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined =>
    blocker.key === 'entry_dates_missing' || blocker.key === 'entry_dates_out_of_order'
      ? { onFix: onEditDetails }
      : undefined;

  return (
    <PublishBlockersList
      state={{ status: 'ready', blockers }}
      fixFor={fixFor}
      viewerIsClubAdmin={canOpenPayments}
      failedPart={failedPart}
    />
  );
}
