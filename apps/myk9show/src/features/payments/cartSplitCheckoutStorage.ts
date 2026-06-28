import { STORAGE_KEYS } from '@/constants/storageKeys';
import type { WaitlistEntryResult } from '@/store/cartStore';

export interface CartSplitCheckoutSummary {
  showId: string;
  confirmedEntryCount: number;
  waitlistEntries: WaitlistEntryResult[];
}

export function writeCartSplitCheckoutSummary(summary: CartSplitCheckoutSummary): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT, JSON.stringify(summary));
  } catch {
    // sessionStorage can be unavailable in some browser contexts.
  }
}

export function readCartSplitCheckoutSummary(): CartSplitCheckoutSummary | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CartSplitCheckoutSummary>;
    if (
      typeof parsed.showId !== 'string' ||
      typeof parsed.confirmedEntryCount !== 'number' ||
      !Array.isArray(parsed.waitlistEntries)
    ) {
      return null;
    }

    return {
      showId: parsed.showId,
      confirmedEntryCount: parsed.confirmedEntryCount,
      waitlistEntries: parsed.waitlistEntries as WaitlistEntryResult[],
    };
  } catch {
    return null;
  }
}
