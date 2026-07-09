import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
 */
export function useActiveCartItemCount(exhibitorId: string | undefined): number {
  const { data } = useQuery({
    queryKey: ['active-cart-item-count', exhibitorId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('entry_carts')
        .select('id, entry_cart_items(count)')
        .eq('exhibitor_id', exhibitorId as string)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const items = (data?.entry_cart_items ?? []) as Array<{ count: number }>;
      return items[0]?.count ?? 0;
    },
    enabled: !!exhibitorId,
    staleTime: 30_000,
  });

  return data ?? 0;
}
