import { useQuery } from '@tanstack/react-query';
import { findRecoverableCart } from '@/store/cartStore.pickCart';

/**
 * exhibitor-ux-remediation (cart-integrity): a READ-ONLY item count for the
 * exhibitor's active cart, used only to drive the header cart badge so a cart
 * drafted in a prior session is discoverable everywhere (not just on /cart).
 *
 * Deliberately does NOT touch the Zustand cart store. An earlier version had
 * the header call `loadActiveCart` (which writes the shared store); on
 * registration/cart/checkout routes that could resolve after the show-scoped
 * `loadCart`/`createCart` and overwrite the show-specific cart, sending later
 * `addItem` calls to the wrong cart (Codex review PR #1217). Reading the count
 * directly keeps the badge accurate without ever writing the store, so it
 * cannot race the entry-building flow.
 *
 * The cart it counts is chosen by `findRecoverableCart`, the same lookup
 * `/cart` and the wizard opener use (MYK9-650): `status IN ('active','expired')`
 * with NO `expires_at` filter, and the newest cart WITH items rather than the
 * newest cart. A lapsed draft still surfaces the badge, and a newer empty cart
 * can no longer read the badge as 0 over an older cart's drafted items.
 */
export function useActiveCartItemCount(exhibitorId: string | undefined): number {
  const { data } = useQuery({
    queryKey: ['active-cart-item-count', exhibitorId],
    queryFn: async (): Promise<number> => {
      const result = await findRecoverableCart({ exhibitorId: exhibitorId as string });
      if (result.kind === 'error') throw result.error;
      return result.kind === 'found' ? result.cart.itemCount : 0;
    },
    enabled: !!exhibitorId,
    staleTime: 30_000,
  });

  return data ?? 0;
}
