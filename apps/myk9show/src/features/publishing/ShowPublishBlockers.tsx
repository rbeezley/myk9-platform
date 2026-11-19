import {
  clubPaymentsHref,
  useCanOpenClubPayments,
} from '@/features/payments/useCanOpenClubPayments';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import { useShowStore } from '@/store/showStore';
import { PublishBlockersList, type PublishBlockerFix } from './PublishBlockersList';
import type { PublishBlocker } from './publishBlockers';
import { usePublishBlockers } from './usePublishBlockers';

interface ShowPublishBlockersProps {
  showId: string;
  /** Falls back to the show in the store, which the wizard fills in on create. */
  clubId?: string | undefined;
  /** The show's status; falls back to the store's. The list is only for a draft. */
  status?: string | undefined;
  /** Inside an edit wizard: the entry-date lines jump to its Show Details step instead of leaving. */
  onEditEntryDates?: (() => void) | undefined;
}

/** A saved show's list, read from the server, with each line linked to where it is fixed. */
export function ShowPublishBlockers({
  showId,
  clubId,
  status,
  onEditEntryDates,
}: ShowPublishBlockersProps) {
  const stored = useShowStore(state => state.shows.find(s => s.id === showId));
  const resolvedClubId = clubId ?? stored?.clubId;
  // Only a draft has anything to publish: a public show has no list, a cancelled one is not
  // publishable, and neither asks the server.
  const isDraft = (status ?? stored?.status) === 'draft';
  const state = usePublishBlockers(showId, isDraft);
  const canOpenPayments = useCanOpenClubPayments(resolvedClubId);

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined => {
    switch (blocker.key) {
      case 'club_not_approved':
        // Waits on myK9Show: there is nothing for the secretary to fix, so no link.
        return undefined;
      case 'payouts_not_enabled':
        return resolvedClubId && canOpenPayments
          ? { href: clubPaymentsHref(resolvedClubId) }
          : undefined;
      case 'premium_not_published':
        return { href: `/shows/${showId}/about#${PREMIUM_CARD_ANCHOR}` };
      case 'entry_dates_missing':
      case 'entry_dates_out_of_order':
        return onEditEntryDates
          ? { onFix: onEditEntryDates }
          : { href: getShowEditHref(showId, 'basic') };
      default:
        return undefined;
    }
  };

  if (!isDraft) return null;
  return <PublishBlockersList state={state} fixFor={fixFor} viewerIsClubAdmin={canOpenPayments} />;
}
