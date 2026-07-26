import { STORAGE_KEYS } from '@/constants/storageKeys';
import type { WaitlistEntryResult } from '@/store/cartStore';

export interface CartSplitCheckoutSummary {
  correlationId: string;
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

function readStoredCartSplitCheckoutSummary(): CartSplitCheckoutSummary | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CartSplitCheckoutSummary>;
    if (
      typeof parsed.correlationId !== 'string' ||
      typeof parsed.showId !== 'string' ||
      typeof parsed.confirmedEntryCount !== 'number' ||
      !Array.isArray(parsed.waitlistEntries)
    ) {
      sessionStorage.removeItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT);
      return null;
    }

    return {
      correlationId: parsed.correlationId,
      showId: parsed.showId,
      confirmedEntryCount: parsed.confirmedEntryCount,
      waitlistEntries: parsed.waitlistEntries as WaitlistEntryResult[],
    };
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT);
    } catch {
      // sessionStorage can be unavailable in some browser contexts.
    }
    return null;
  }
}

export function readCartSplitCheckoutSummary(
  correlationId: string
): CartSplitCheckoutSummary | null {
  const summary = readStoredCartSplitCheckoutSummary();

  if (!summary || summary.correlationId !== correlationId) {
    return null;
  }

  return summary;
}
