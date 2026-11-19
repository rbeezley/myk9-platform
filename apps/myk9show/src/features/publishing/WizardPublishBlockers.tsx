import { useCanOpenClubPayments } from '@/features/payments/useCanOpenClubPayments';
import { PublishBlockersList, type PublishBlockerFix } from './PublishBlockersList';
import { computeWizardPublishBlockers, type PublishBlocker } from './publishBlockers';
import { useClubPublishBlockers, type PublishBlockersState } from './usePublishBlockers';

interface WizardPublishBlockersProps {
  clubId: string | undefined;
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
  /** Jump back to the step that holds the entry dates (Show Details). */
  onEditDetails: () => void;
}

/**
 * The Review step's list. There is no saved show to ask the server about yet, so the club's lines
 * come from public.club_publish_blockers and the rest from the draft, through the one pure
 * function that mirrors the server's keys. The wizard always saves a draft; this says what stands
 * between that draft and publishing.
 */
export function WizardPublishBlockers({
  clubId,
  entryOpenDate,
  entryCloseDate,
  onEditDetails,
}: WizardPublishBlockersProps) {
  const club = useClubPublishBlockers(clubId);
  const canOpenPayments = useCanOpenClubPayments(clubId);
  // A club that cannot be read must not look ready: the list stays on its error line.
  const state: PublishBlockersState =
    club.status === 'ready' || !clubId
      ? {
          status: 'ready',
          blockers: computeWizardPublishBlockers({
            clubBlockers: club.status === 'ready' ? club.blockers : null,
            entryOpenDate,
            entryCloseDate,
          }),
        }
      : club;

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined =>
    blocker.key === 'entry_dates_missing' || blocker.key === 'entry_dates_out_of_order'
      ? { onFix: onEditDetails }
      : undefined;

  return <PublishBlockersList state={state} fixFor={fixFor} viewerIsClubAdmin={canOpenPayments} />;
}
