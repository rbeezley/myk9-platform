import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { calculateCartTotals } from './cartStore.helpers';
import type { CartItemWithDetails } from './cartStore.types';

interface ExistingEntryCartMatch {
  dog_id: string | null;
  class_id: string | null;
  payment_status: string | null;
  entry_status: string | null;
  deleted_at: string | null;
}

const INACTIVE_ENTRY_STATUSES = new Set([
  'withdrawn',
  'scratched',
  'not_accepted',
  'absent',
  'promotion-expired',
  'cancelled',
  'moved',
]);

interface ReconcileCartItemsParams {
  cartId: string;
  showId: string;
  items: CartItemWithDetails[];
}

export async function reconcileCartItemsAgainstExistingEntries({
  cartId,
  showId,
  items,
}: ReconcileCartItemsParams): Promise<CartItemWithDetails[]> {
  const dogIds = Array.from(new Set(items.map(item => item.dog_id).filter(Boolean)));
  const classIds = Array.from(new Set(items.map(item => item.class_id).filter(Boolean)));

  if (dogIds.length === 0 || classIds.length === 0) return items;

  const { data, error } = await supabase
    .from('entries')
    .select('dog_id, class_id, payment_status, entry_status, deleted_at')
    .eq('show_id', showId)
    .in('dog_id', dogIds)
    .in('class_id', classIds);

  if (error) {
    logger.error(
      'Error loading existing entries for cart reconciliation',
      'cartStore',
      { cartId, showId },
      error
    );
    throw error;
  }

  const matchesByPair = new Map<string, ExistingEntryCartMatch[]>();
  for (const entry of (data || []) as ExistingEntryCartMatch[]) {
    if (!entry.dog_id || !entry.class_id) continue;
    const key = `${entry.dog_id}:${entry.class_id}`;
    const matches = matchesByPair.get(key);
    if (matches) {
      matches.push(entry);
    } else {
      matchesByPair.set(key, [entry]);
    }
  }

  if (matchesByPair.size === 0) return items;

  const staleItemIds = items
    .filter(item => {
      if (!item.dog_id || !item.class_id) return false;
      const matches = matchesByPair.get(`${item.dog_id}:${item.class_id}`);
      if (!matches) return false;
      return !matches.some(
        entry =>
          entry.payment_status === 'pending' &&
          (entry.deleted_at === null || entry.deleted_at === undefined) &&
          (entry.entry_status === null ||
            entry.entry_status === undefined ||
            !INACTIVE_ENTRY_STATUSES.has(entry.entry_status))
      );
    })
    .map(item => item.id);

  if (staleItemIds.length === 0) return items;

  const { error: deleteError } = await supabase
    .from('entry_cart_items')
    .delete()
    .in('id', staleItemIds);

  if (deleteError) {
    logger.error(
      'Error deleting stale cart items',
      'cartStore',
      { cartId, staleItemIds },
      deleteError
    );
    throw deleteError;
  }

  const reconciledItems = items.filter(item => !staleItemIds.includes(item.id));
  const { subtotal, platformFee, total } = calculateCartTotals(reconciledItems);

  const { error: updateError } = await supabase
    .from('entry_carts')
    .update({
      subtotal_cents: subtotal,
      platform_fee_cents: platformFee,
      total_cents: total,
      stripe_checkout_session_id: null,
    })
    .eq('id', cartId)
    .in('status', ['active', 'expired']);

  if (updateError) {
    logger.warn('Error updating reconciled cart totals', 'cartStore', { cartId }, updateError);
  }

  return reconciledItems;
}
