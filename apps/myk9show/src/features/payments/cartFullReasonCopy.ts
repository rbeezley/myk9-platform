/**
 * MYK9-753: say WHICH thing is full when a cart line cannot be paid now.
 *
 * A class with two judges can be open on one judge's day and full on the
 * other's, so "this class is full" alone leaves the exhibitor guessing. The
 * sentence names the judge's day when that is what is full. It is advisory
 * ("right now"): payment re-checks availability on the server.
 */

import { formatWeekdayLongMonthDay } from '@/lib/format/dates';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { CartFullReason } from './cartCapacitySplit';

export function describeCartFullReason(
  reason: CartFullReason | undefined,
  judgeNameById: ReadonlyMap<string, string> = new Map()
): string {
  if (!reason || reason.kind === 'class') return 'This class has no spots left right now.';

  const day = formatWeekdayLongMonthDay(reason.showDate);
  const judgeName = judgeNameById.get(reason.judgeId);
  const whose = judgeName ? `${judgeName}'s judging day` : "One judge's day";
  return day
    ? `${whose} on ${day} has no spots left right now.`
    : `${whose} has no spots left right now.`;
}

/**
 * The checkout stop when lines are full and take no wait list: each line with
 * what is full, then the one action that unblocks checkout.
 */
export function describeBlockedCheckout(
  blockedItems: readonly CartItemWithDetails[],
  fullReasonByItemId: ReadonlyMap<string, CartFullReason>,
  judgeNameById?: ReadonlyMap<string, string>
): string {
  const lines = blockedItems.map(
    item =>
      `${item.class?.name || 'A class'}: ${describeCartFullReason(
        fullReasonByItemId.get(item.id),
        judgeNameById
      )}`
  );
  const action =
    blockedItems.length === 1
      ? 'It is not accepting wait list entries. Remove it to continue.'
      : 'They are not accepting wait list entries. Remove them to continue.';
  return `${lines.join(' ')} ${action}`;
}
