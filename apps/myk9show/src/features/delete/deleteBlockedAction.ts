import type { DeleteBlockedAction } from './DeleteObjectDialogView';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

/** Where a blocked delete points: the Edit show panel (Status: Cancelled), or Withdraw / Pull on the entries page. */
export function blockedActionFor(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): DeleteBlockedAction | undefined {
  const first = targets[0];
  if (!first || targets.length !== 1) return undefined;
  if (kind === 'show') {
    // Already cancelled: the Cancel link would be a loop. The refund note carries on.
    if (first.context?.showStatus === 'cancelled') return undefined;
    // Cancel is the Status select (Cancelled) on the Edit show panel's Basic Info tab.
    // `?edit=true` opens that panel on Basic Info; the Managing tab's "Mark cancelled"
    // only appears after selecting a row, so it is not a one-click target.
    return { to: getShowEditHref(first.id) };
  }
  const showId = first.context?.showId;
  if (kind === 'entry' && showId) {
    return {
      to: `/shows/${encodeURIComponent(showId)}/entries?queue=all&entry=${encodeURIComponent(first.id)}`,
    };
  }
  if ((kind === 'trial' || kind === 'class') && showId) {
    return { to: `/shows/${showId}/entries` };
  }
  return undefined;
}
