/**
 * A recovered cart may hold a class that has closed since it was drafted
 * (MYK9-656).
 *
 * `loadActiveCart` has no expiry filter by design, so a draft from any earlier
 * session is rehydrated, re-ticked in the wizard and sent to Stripe. Nothing on
 * that path re-read the class: an exhibitor could reopen a months-old draft and
 * pay for a class that was cancelled, or that the judge has already run.
 *
 * This runs on every load, after the existing-entry reconcile, and drops the
 * items whose class can no longer be entered. "Can no longer be entered" is the
 * wizard's own rule, `getClassEntryWindow` (MYK9-516), called with
 * `isStaff: false` because the cart is the exhibitor self-service path:
 *
 *   - `classes.status` 'cancelled'   → dropped, "This class was cancelled"
 *   - `classes.status` 'in_progress' → dropped, "This class has started"
 *   - a dog in the ring or scored     → dropped, "This class has started"
 *   - `classes.status` 'completed'   → dropped, "This class has finished"
 *
 * FULLNESS IS DELIBERATELY NOT GATED HERE. The only client-side fullness count,
 * `useClassAvailability`, counts entries under the exhibitor's own RLS, so a
 * class filled by other exhibitors reads as open (MYK9-705). Dropping on that
 * count would only ever drop classes the exhibitor filled themselves, and a full
 * class that allows a wait list is a legitimate cart line that checkout routes
 * to the wait list. The server's `create_online_paid_entry` capacity gate is the
 * one that decides fullness today. When MYK9-705 gives the client a real count,
 * this is the place to add it.
 *
 * The same RLS limit applies to the started check: only entries this exhibitor
 * can read contribute. `classes.status` is readable by everyone and carries the
 * rest.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { getClassEntryWindow } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.availability';
import { calculateCartTotals } from './cartStore.helpers';
import type { CartItemWithDetails, DroppedCartItem } from './cartStore.types';

/** Shown when the classes in a saved cart could not be re-checked. */
export const CART_CLASS_CHECK_FAILED_MESSAGE =
  'We could not check the classes in your saved cart. Please try again.';

/** Why checkout is blocked while the classes are unchecked; read beside the button. */
export const CART_CLASS_CHECK_BLOCKS_CHECKOUT =
  'Checkout is paused: we could not check whether the classes in this cart are still open.';

interface ClassStatusRow {
  id: string;
  name: string | null;
  status: string | null;
}

interface ClassStartRow {
  class_id: string | null;
  is_in_ring: boolean | null;
  is_scored: boolean | null;
}

export interface ClosedClassDropResult {
  items: CartItemWithDetails[];
  dropped: DroppedCartItem[];
}

/**
 * Drop cart items whose class is closed, delete their rows so checkout can
 * never be handed them, and say which were dropped and why. Throws on a failed
 * read, delete or session sever, so the caller's own error path decides what
 * the exhibitor sees rather than a silently unchecked cart.
 */
export async function dropItemsInClosedClasses({
  cartId,
  items,
}: {
  cartId: string;
  items: CartItemWithDetails[];
}): Promise<ClosedClassDropResult> {
  const classIds = Array.from(new Set(items.map(item => item.class_id).filter(Boolean)));
  if (classIds.length === 0) return { items, dropped: [] };

  const [classResult, startResult] = await Promise.all([
    supabase.from('classes').select('id, name, status').in('id', classIds),
    supabase
      .from('entries')
      .select('class_id, is_in_ring, is_scored')
      .in('class_id', classIds)
      .is('deleted_at', null),
  ]);

  const readError = classResult.error ?? startResult.error;
  if (readError) {
    logger.error('Error reading class status for cart items', 'cartStore', { cartId }, readError);
    throw readError;
  }

  const classById = new Map(
    ((classResult.data ?? []) as ClassStatusRow[]).map(row => [row.id, row])
  );
  const startedClassIds = new Set(
    ((startResult.data ?? []) as ClassStartRow[])
      .filter(row => row.class_id && (row.is_in_ring === true || row.is_scored === true))
      .map(row => row.class_id as string)
  );

  const dropped: DroppedCartItem[] = [];
  for (const item of items) {
    const classRow = classById.get(item.class_id);
    // A class this viewer cannot read is left alone: nothing here can say it
    // closed, and the server still owns the final decision.
    if (!classRow) continue;
    // A Finish Payment line settles an entry that ALREADY exists; removing it
    // would not un-enter the dog, only strand the balance. Closure is a rule
    // about buying NEW entries, so those lines are left to the secretary.
    if (item.entry_id) continue;
    const window = getClassEntryWindow({
      status: classRow.status,
      hasStarted: startedClassIds.has(item.class_id),
      isStaff: false,
    });
    if (window.enterable) continue;
    dropped.push({
      itemId: item.id,
      dogName: item.dog?.call_name || item.dog?.name || null,
      className: item.class?.name ?? classRow.name ?? null,
      reason: window.reason ?? 'This class is closed',
    });
  }

  if (dropped.length === 0) return { items, dropped };

  const droppedIds = dropped.map(entry => entry.itemId);
  const { error: deleteError } = await supabase
    .from('entry_cart_items')
    .delete()
    .in('id', droppedIds);
  if (deleteError) {
    logger.error(
      'Error removing cart items in closed classes',
      'cartStore',
      { cartId, droppedIds },
      deleteError
    );
    throw deleteError;
  }

  const kept = items.filter(item => !droppedIds.includes(item.id));
  const { subtotal, platformFee, total } = calculateCartTotals(kept);
  const { error: updateError } = await supabase
    .from('entry_carts')
    .update({
      subtotal_cents: subtotal,
      platform_fee_cents: platformFee,
      total_cents: total,
      // The contents changed: an open Stripe page must not pay for the old set.
      stripe_checkout_session_id: null,
    })
    .eq('id', cartId)
    .in('status', ['active', 'expired']);
  // Fail closed: the lines are already gone, so a session left linked would
  // let an open Stripe page charge for a set this cart no longer holds.
  if (updateError) {
    logger.error(
      'Could not sever the checkout session after closed-class removal',
      'cartStore',
      { cartId },
      updateError
    );
    throw updateError;
  }

  return { items: kept, dropped };
}

/** Add newly dropped lines to those not yet dismissed, once per cart line. */
export function mergeDroppedItems(
  previous: readonly DroppedCartItem[],
  next: readonly DroppedCartItem[]
): DroppedCartItem[] {
  if (next.length === 0) return [...previous];
  const seen = new Set(previous.map(entry => entry.itemId));
  return [...previous, ...next.filter(entry => !seen.has(entry.itemId))];
}
