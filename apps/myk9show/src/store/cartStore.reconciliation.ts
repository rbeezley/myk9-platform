import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { calculateCartTotals } from './cartStore.helpers';
import {
  classReEntryReason,
  getClassReEntryBlock,
  strongestClassReEntryBlock,
  type ClassReEntryBlock,
} from '@/services/entryDisplay/classReEntry';
import { dropItemsInClosedClasses, type ClosedClassDropResult } from './cartStore.classClosure';
import type { CartItemWithDetails, DroppedCartItem } from './cartStore.types';

interface ExistingEntryCartMatch {
  dog_id: string | null;
  class_id: string | null;
  payment_status: string | null;
  entry_status: string | null;
  check_in_status: string | null;
}

interface ReconcileCartItemsParams {
  cartId: string;
  showId: string;
  items: CartItemWithDetails[];
}

export async function reconcileCartItemsAgainstExistingEntries({
  cartId,
  showId,
  items,
}: ReconcileCartItemsParams): Promise<ClosedClassDropResult> {
  const dogIds = Array.from(new Set(items.map(item => item.dog_id).filter(Boolean)));
  const classIds = Array.from(new Set(items.map(item => item.class_id).filter(Boolean)));

  if (dogIds.length === 0 || classIds.length === 0) return { items, dropped: [] };

  const { data, error } = await supabase
    .from('entries')
    .select('dog_id, class_id, payment_status, entry_status, check_in_status')
    .eq('show_id', showId)
    .is('deleted_at', null)
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

  if (matchesByPair.size === 0) return { items, dropped: [] };

  // The same rule the wizard's class step reads (`getClassReEntryBlock`), so a
  // class the step offers is never one removed here. A line whose only live
  // entry is still unpaid is the Finish Payment line and stays.
  const blockByItemId = new Map<string, ClassReEntryBlock>();
  for (const item of items) {
    if (!item.dog_id || !item.class_id) continue;
    const matches = matchesByPair.get(`${item.dog_id}:${item.class_id}`);
    if (!matches) continue;
    const blocks = matches.map(entry => ({
      block: getClassReEntryBlock(entry.entry_status, entry.check_in_status),
      entry,
    }));
    const strongest = strongestClassReEntryBlock(blocks.map(b => b.block));
    if (!strongest) continue;
    const isFinishPayment = blocks.some(
      b => b.block === 'entered' && b.entry.payment_status === 'pending'
    );
    if (isFinishPayment) continue;
    blockByItemId.set(item.id, strongest);
  }
  const staleItemIds = [...blockByItemId.keys()];

  if (staleItemIds.length === 0) return { items, dropped: [] };

  // MYK9-530 asked whether this prune can be a silent zero-row 204 under RLS,
  // leaving the DB row alive while the local list drops it. It cannot:
  // `entry_cart_items` carries a single FOR ALL policy whose USING expression
  // (`is_site_admin() OR cart_id IN (my carts)`) is the same expression that
  // gated the SELECT which produced `items` moments earlier in this same
  // session. Dog ownership (`get_my_person_id()`) appears only in WITH CHECK,
  // so it cannot gate a DELETE. Any row readable here is deletable here.
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

  const dropped: DroppedCartItem[] = items
    .filter(item => blockByItemId.has(item.id))
    .map(item => ({
      cartId,
      itemId: item.id,
      dogName: item.dog?.call_name || item.dog?.name || null,
      className: item.class?.name ?? null,
      reason: classReEntryReason(blockByItemId.get(item.id)!),
    }));

  return { items: reconciledItems, dropped };
}

/**
 * The cart's two load-time checks in order: lines the dog already has an entry
 * for (live or withdrawn), then lines in a class self-service can no longer
 * buy. Returns what is left and every removal with its reason, so no line
 * leaves the cart unexplained.
 */
export async function settleCartLines({
  cartId,
  showId,
  items,
}: ReconcileCartItemsParams): Promise<ClosedClassDropResult> {
  const reconciled = await reconcileCartItemsAgainstExistingEntries({ cartId, showId, items });
  const closure = await dropItemsInClosedClasses({ cartId, items: reconciled.items });
  return { items: closure.items, dropped: [...reconciled.dropped, ...closure.dropped] };
}
