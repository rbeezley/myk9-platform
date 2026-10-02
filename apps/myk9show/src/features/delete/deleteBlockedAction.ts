import type { DeleteBlockedAction } from './DeleteObjectDialogView';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

/** Where a blocked delete points: Cancel show, or Withdraw / Pull on the entries page. */
export function blockedActionFor(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): DeleteBlockedAction | undefined {
  const first = targets[0];
  if (!first || targets.length !== 1) return undefined;
  if (kind === 'show') {
    // Cancel lives on the Managing tab's bulk bar ("Mark cancelled"), which every
    // role that can manage a show can open. Show Settings (/secretary/settings) is
    // secretary-only, so a club admin sent there is turned away.
    return { to: '/shows?tab=managing' };
  }
  const showId = first.context?.showId;
  if ((kind === 'trial' || kind === 'class' || kind === 'entry') && showId) {
    return { to: `/shows/${showId}/entries` };
  }
  return undefined;
}
