import { useState } from 'react';
import { useCartStore } from '@/store/cartStore';
import { cartErrorForDisplay } from './cartErrorCopy';

/**
 * MYK9-1823: the cart page's error line. `setError` records the sentence the page
 * wrote, so `error` shows it as it is; anything else on the store's `error` is
 * raw failure text and shows as the fixed fallback.
 */
export function useCartPageError(): {
  error: string | null;
  setError: (message: string | null) => void;
} {
  const storeError = useCartStore(state => state.error);
  const setStoreError = useCartStore(state => state.setError);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const setError = (message: string | null) => {
    setPageMessage(message);
    setStoreError(message);
  };
  return { error: cartErrorForDisplay(storeError, pageMessage), setError };
}
