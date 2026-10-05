import type { CartItemWithDetails } from '@/store/cartStore';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

/**
 * One judge's day, as the split reads it: the self-service spots left and every
 * class that takes a spot on it. A full `JudgeDayCapacity` satisfies it; the
 * cart builds these from `get_show_class_judge_day_availability` (MYK9-753).
 */
export type CartJudgeDayCapacity = Pick<
  JudgeDayCapacity,
  'judgeId' | 'showDate' | 'availableSpots' | 'classIds'
>;

/** Spots left in a class with an entry limit. Unlimited classes are omitted. */
export interface CartClassCapacity {
  classId: string;
  availableSpots: number;
}

/** Why a line cannot be paid now: its class, or one judge's day it runs on. */
export type CartFullReason =
  { kind: 'class' } | { kind: 'judge-day'; judgeId: string; showDate: string };

export interface CartCapacitySplitDecision {
  confirmedItemIds: Set<string>;
  waitlistItemIds: Set<string>;
  blockedItems: CartItemWithDetails[];
  /** For every wait-list or blocked line: what is full. */
  fullReasonByItemId: Map<string, CartFullReason>;
}

/**
 * Decide which new cart lines can be paid now, in cart order.
 *
 * The rule is the server's (`evaluate_entry_capacity`): a line needs a spot in
 * its class (when the class has a limit) AND a spot on EVERY judge day its
 * class runs on, and once admitted it takes one of each. So a line in a
 * two-judge class uses a spot on both judges' days, and lines earlier in the
 * cart use up spots before later ones are judged. Advisory only: payment
 * re-decides under the server's locks.
 *
 * A full line goes to the wait list only when its class is in
 * `waitlistClassIds`: the classes the server's availability read reports as
 * taking a wait list (`allow_waitlist`, the EFFECTIVE value: the class's own
 * setting, else the show's, MYK9-1019). The cart never works that out itself,
 * so checkout's refetch carries a setting changed while the cart was open.
 * A class missing from the set is "no", so a denied class never becomes a
 * wait-list request.
 */
export function splitCartItemsByJudgeDayCapacity(
  items: CartItemWithDetails[],
  judgeDays: readonly CartJudgeDayCapacity[],
  classSpots: readonly CartClassCapacity[] = [],
  waitlistClassIds: readonly string[] = []
): CartCapacitySplitDecision {
  const takesWaitlist = new Set(waitlistClassIds);
  const remainingByJudgeDay = new Map<string, number>();
  const remainingByClass = new Map<string, number>();

  for (const day of judgeDays) {
    remainingByJudgeDay.set(judgeDayKey(day), Math.max(0, day.availableSpots));
  }
  for (const cls of classSpots) {
    remainingByClass.set(cls.classId, Math.max(0, cls.availableSpots));
  }

  const confirmedItemIds = new Set<string>();
  const waitlistItemIds = new Set<string>();
  const blockedItems: CartItemWithDetails[] = [];
  const fullReasonByItemId = new Map<string, CartFullReason>();

  for (const item of items) {
    // Recovery carts contain entries that were already submitted before the
    // class filled. Capacity gates new submissions, but must not strand an
    // existing unpaid entry that is being recovered for payment.
    if (item.entry_id) {
      confirmedItemIds.add(item.id);
      continue;
    }

    const classId = item.class_id;
    if (!classId) {
      confirmedItemIds.add(item.id);
      continue;
    }

    const itemJudgeDays = judgeDays.filter(day => day.classIds.includes(classId));
    const classLeft = remainingByClass.get(classId);
    const fullDay = itemJudgeDays.find(
      day => (remainingByJudgeDay.get(judgeDayKey(day)) ?? 0) <= 0
    );
    const reason: CartFullReason | null =
      classLeft !== undefined && classLeft <= 0
        ? { kind: 'class' }
        : fullDay
          ? { kind: 'judge-day', judgeId: fullDay.judgeId, showDate: fullDay.showDate }
          : null;

    if (reason) {
      fullReasonByItemId.set(item.id, reason);
      if (!takesWaitlist.has(classId)) {
        blockedItems.push(item);
      } else {
        waitlistItemIds.add(item.id);
      }
      continue;
    }

    confirmedItemIds.add(item.id);
    if (classLeft !== undefined) remainingByClass.set(classId, classLeft - 1);
    for (const day of itemJudgeDays) {
      const key = judgeDayKey(day);
      remainingByJudgeDay.set(key, (remainingByJudgeDay.get(key) ?? 0) - 1);
    }
  }

  return { confirmedItemIds, waitlistItemIds, blockedItems, fullReasonByItemId };
}

function judgeDayKey(day: CartJudgeDayCapacity): string {
  return `${day.judgeId}:${day.showDate}`;
}
