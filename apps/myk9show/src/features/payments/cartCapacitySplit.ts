import type { CartItemWithDetails } from '@/store/cartStore';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

export interface CartCapacitySplitDecision {
  confirmedItemIds: Set<string>;
  waitlistItemIds: Set<string>;
  blockedItems: CartItemWithDetails[];
}

export function splitCartItemsByJudgeDayCapacity(
  items: CartItemWithDetails[],
  judgeDays: JudgeDayCapacity[],
  fullClassIds: readonly string[] = []
): CartCapacitySplitDecision {
  const remainingByJudgeDay = new Map<string, number>();
  const classesAtCapacity = new Set(fullClassIds);

  for (const day of judgeDays) {
    remainingByJudgeDay.set(judgeDayKey(day), Math.max(0, day.availableSpots));
  }

  const confirmedItemIds = new Set<string>();
  const waitlistItemIds = new Set<string>();
  const blockedItems: CartItemWithDetails[] = [];

  for (const item of items) {
    if (!item.class_id) {
      confirmedItemIds.add(item.id);
      continue;
    }

    const matchingJudgeDays = judgeDays.filter(day => day.classIds.includes(item.class_id!));
    const itemFits =
      !classesAtCapacity.has(item.class_id) &&
      matchingJudgeDays.every(day => {
        const remaining = remainingByJudgeDay.get(judgeDayKey(day)) ?? 0;
        return remaining > 0;
      });

    if (!itemFits) {
      // submit_show_entries uses COALESCE(allow_waitlist, false), so a missing
      // or NULL client value must not turn a denied class into a wait-list
      // request.
      if (item.class?.allow_waitlist !== true) {
        blockedItems.push(item);
      } else {
        waitlistItemIds.add(item.id);
      }
      continue;
    }

    confirmedItemIds.add(item.id);
    for (const day of matchingJudgeDays) {
      const key = judgeDayKey(day);
      remainingByJudgeDay.set(key, (remainingByJudgeDay.get(key) ?? 0) - 1);
    }
  }

  return { confirmedItemIds, waitlistItemIds, blockedItems };
}

function judgeDayKey(day: JudgeDayCapacity): string {
  return `${day.judgeId}:${day.showDate}`;
}
