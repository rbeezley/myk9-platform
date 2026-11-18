import { useState } from 'react';
import type { PaymentMethod } from '@/types/show-registration-types';

/**
 * MYK9-2149 (Codex P2): "Use the money already on this form" belongs to ONE form, the selected
 * exhibitor's. When the exhibitor changes (the secretary goes back and picks another owner's
 * dog), that form is no longer the one being entered, so the choice is cleared and she chooses
 * again. A refreshed balance for the same exhibitor leaves it alone.
 *
 * Adjusts state during render (no effect), so no render ever pairs the new exhibitor with
 * the old choice.
 */
export function useClearFormMoneyOnOwnerChange(
  ownerId: string | undefined,
  paymentMethod: PaymentMethod | undefined,
  clearPaymentMethod: () => void
): void {
  const [seenOwnerId, setSeenOwnerId] = useState(ownerId);
  if (ownerId !== seenOwnerId) {
    setSeenOwnerId(ownerId);
    if (paymentMethod === 'form_money') clearPaymentMethod();
  }
}
