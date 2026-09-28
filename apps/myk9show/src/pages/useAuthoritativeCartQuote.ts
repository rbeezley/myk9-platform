import { useEffect, useRef, useState } from 'react';
import { refreshEntryCartFeeQuote } from '@/lib/stripe';
import { useCartItems, useCartStore } from '@/store/cartStore';

interface Options {
  profileId: string | undefined;
  recoveryShowId: string | undefined;
  recoveryEntryIds: string[];
}

/** Load the cart and confirm its money with the same authority checkout uses. */
export function useAuthoritativeCartQuote({
  profileId,
  recoveryShowId,
  recoveryEntryIds,
}: Options) {
  const cart = useCartStore(state => state.cart);
  const items = useCartItems();
  const isCartLoading = useCartStore(state => state.isLoading);
  const loadActiveCart = useCartStore(state => state.loadActiveCart);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [result, setResult] = useState<{
    key: string;
    error: string | null;
  } | null>(null);
  const [retryNumber, setRetryNumber] = useState(0);
  const attemptedKey = useRef<string | null>(null);
  const recoveryIdsKey = recoveryEntryIds.join(',');
  const loadKey = `${profileId ?? ''}:${recoveryShowId ?? ''}:${recoveryIdsKey}`;
  const feeKey =
    cart?.id && items.length > 0
      ? `${cart.id}:${items.map(item => `${item.id}:${item.entry_id ?? ''}:${item.handler_id ?? ''}:${item.entry_fee_cents}`).join('|')}`
      : null;

  useEffect(() => {
    if (!profileId) return;
    let current = true;
    void loadActiveCart(profileId, {
      ...(recoveryShowId ? { showId: recoveryShowId } : {}),
      recoveryEntryIds,
      isCurrent: () => current,
    }).finally(() => {
      if (current) setLoadedKey(loadKey);
    });
    return () => {
      current = false;
    };
  }, [profileId, recoveryShowId, recoveryEntryIds, recoveryIdsKey, loadKey, loadActiveCart]);

  useEffect(() => {
    if (!profileId || loadedKey !== loadKey || isCartLoading || !cart?.id || !feeKey) return;
    const attempt = `${loadKey}:${feeKey}:${retryNumber}`;
    if (attemptedKey.current === attempt) return;
    attemptedKey.current = attempt;
    void (async () => {
      try {
        await refreshEntryCartFeeQuote(cart.id);
        await loadActiveCart(profileId, {
          ...(recoveryShowId ? { showId: recoveryShowId } : {}),
          recoveryEntryIds,
          isCurrent: () => useCartStore.getState().cart?.id === cart.id,
        });
        if (useCartStore.getState().cart?.id === cart.id) setResult({ key: feeKey, error: null });
      } catch (error) {
        if (useCartStore.getState().cart?.id === cart.id)
          setResult({
            key: feeKey,
            error: error instanceof Error ? error.message : 'Could not confirm entry fees.',
          });
      }
    })();
  }, [
    profileId,
    loadedKey,
    loadKey,
    isCartLoading,
    cart?.id,
    feeKey,
    retryNumber,
    recoveryShowId,
    recoveryEntryIds,
    recoveryIdsKey,
    loadActiveCart,
  ]);

  const ready = feeKey === null || (result?.key === feeKey && result.error === null);
  const error = result?.key === feeKey ? result.error : null;
  return {
    ready,
    error,
    retry: () => {
      setResult(null);
      setRetryNumber(number => number + 1);
    },
  };
}
