import { useCallback, useMemo, useState } from 'react';
import { canDeclareJuniorHandler } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';

interface Params {
  selectedDogs: readonly string[];
  /** The method the entries are actually being paid with (the effective one). */
  paymentMethod: string | undefined;
  show: { juniorHandlerFee?: string | undefined; organization?: string | undefined } | undefined;
}

/**
 * MYK9-879: the exhibitor's junior-handler declarations, one per dog entry.
 *
 * The declaration says the person SHOWING the dog is under 18. It is about the
 * handler, not the owner: a parent owns the dog and registers it, the child
 * handles it. Nothing here reads a date of birth.
 *
 * `juniorHandlerDogIds` is the EFFECTIVE set, the only thing fee code may read:
 * it is empty unless this is a card checkout on a show that offers the declaration
 * (a junior tier, not ASCA), and holds only dogs still selected. Ticks made before
 * the exhibitor switched to check or cash are kept but never priced, so the live
 * total always equals what the chosen payment path actually charges.
 */
export function useJuniorHandlerDeclaration({ selectedDogs, paymentMethod, show }: Params) {
  const [declaredDogIds, setDeclaredDogIds] = useState<ReadonlySet<string>>(() => new Set());

  const canDeclare = canDeclareJuniorHandler(show) && paymentMethod === 'credit_card';

  const juniorHandlerDogIds = useMemo<ReadonlySet<string>>(() => {
    if (!canDeclare) return new Set();
    return new Set(selectedDogs.filter(dogId => declaredDogIds.has(dogId)));
  }, [canDeclare, declaredDogIds, selectedDogs]);

  const setJuniorHandlerDog = useCallback((dogId: string, declared: boolean) => {
    setDeclaredDogIds(prev => {
      if (prev.has(dogId) === declared) return prev;
      const next = new Set(prev);
      if (declared) next.add(dogId);
      else next.delete(dogId);
      return next;
    });
  }, []);

  return { canDeclareJuniorHandler: canDeclare, juniorHandlerDogIds, setJuniorHandlerDog };
}
