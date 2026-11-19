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
}

/** A saved show's list, read from the server, with each line linked to where it is fixed. */
export function ShowPublishBlockers({ showId, clubId }: ShowPublishBlockersProps) {
  const storedClubId = useShowStore(state => state.shows.find(s => s.id === showId)?.clubId);
  const resolvedClubId = clubId ?? storedClubId;
  const state = usePublishBlockers(showId);
  const canOpenPayments = useCanOpenClubPayments(resolvedClubId);

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined => {
    switch (blocker.key) {
      case 'club_not_approved':
        return resolvedClubId ? { href: `/clubs/${resolvedClubId}` } : undefined;
      case 'payouts_not_enabled':
        return resolvedClubId && canOpenPayments
          ? { href: clubPaymentsHref(resolvedClubId) }
          : undefined;
      case 'premium_not_published':
        return { href: `/shows/${showId}/about#${PREMIUM_CARD_ANCHOR}` };
      case 'entry_dates_missing':
      case 'entry_dates_out_of_order':
        return { href: getShowEditHref(showId, 'basic') };
      default:
        return undefined;
    }
  };

  return <PublishBlockersList state={state} fixFor={fixFor} viewerIsClubAdmin={canOpenPayments} />;
}
