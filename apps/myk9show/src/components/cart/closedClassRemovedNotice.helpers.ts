import type { DroppedCartItem } from '@/store/cartStore.types';

/** "Rover in Novice Exterior: this class was cancelled." (MYK9-656) */
export function describeDroppedItem(item: DroppedCartItem): string {
  const what = [item.dogName, item.className].filter(Boolean).join(' in ') || 'One class';
  const why = item.reason.charAt(0).toLowerCase() + item.reason.slice(1);
  return `${what}: ${why}.`;
}
