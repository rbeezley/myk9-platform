/**
 * A recovered cart may hold a class that has closed or filled since it was
 * drafted (MYK9-656).
 *
 * `loadActiveCart` has no expiry filter by design, so a draft from any earlier
 * session is rehydrated, re-ticked in the wizard and sent to Stripe. This runs
 * on every load, after the existing-entry reconcile, and asks the server to drop
 * the lines self-service can no longer buy.
 *
 * The decision and the delete are ONE server call, `reconcile_cart_closed_classes`
 * (migration 20260925004700). An earlier client-side version deleted lines,
 * rewrote totals and severed the Stripe session as separate writes, and any one
 * could fail after another had landed; the last such failure lost the "we
 * removed these" notice while the lines were already gone. The RPC locks the
 * cart, deletes the blocked lines (the line-delete trigger severs the session in
 * the same transaction) and returns exactly what it removed and why, counted
 * over every entry in the class rather than the rows this exhibitor's RLS can
 * read (MYK9-705):
 *
 *   cancelled  classes.status 'cancelled'
 *   started    classes.status 'in_progress', or any dog in the ring or scored
 *   finished   classes.status 'completed'
 *   full       class or judge day full, and the class takes no wait list
 *
 * A full class that DOES take a wait list stays: checkout routes it there.
 * Finish Payment lines (entry_id set) are never dropped.
 *
 * A failed call leaves the cart exactly as it was, with no notice. That is safe
 * rather than silent: stripe-checkout refuses to open a session for a cart that
 * still holds a blocked line, and the reload that follows its refusal runs this
 * again.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { ensureError } from '@myk9/core';
import { CLASS_CLOSED_REASON } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.availability';
import type { CartItemWithDetails, DroppedCartItem } from './cartStore.types';

/** The server's block codes, in the exhibitor's words. */
const REASON_BY_BLOCK: Readonly<Record<string, string>> = {
  cancelled: CLASS_CLOSED_REASON.cancelled,
  started: CLASS_CLOSED_REASON.started,
  finished: CLASS_CLOSED_REASON.finished,
  full: 'This class is full',
};

export function describeBlockReason(block: string): string {
  return REASON_BY_BLOCK[block] ?? 'This class can no longer be entered';
}

export interface ClosedClassDropResult {
  items: CartItemWithDetails[];
  dropped: DroppedCartItem[];
}

/**
 * Drop this cart's lines whose class self-service can no longer buy, and say
 * which and why. Never throws: on failure the items come back untouched.
 */
export async function dropItemsInClosedClasses({
  cartId,
  items,
}: {
  cartId: string;
  items: CartItemWithDetails[];
}): Promise<ClosedClassDropResult> {
  if (items.length === 0) return { items, dropped: [] };

  let data: Array<{ item_id: string; reason: string }> | null = null;
  let error: unknown = null;
  try {
    ({ data, error } = await supabase.rpc('reconcile_cart_closed_classes', {
      p_cart_id: cartId,
    }));
  } catch (thrown) {
    error = thrown;
  }

  if (error) {
    logger.warn(
      'Could not re-check the classes in a saved cart; checkout re-checks them',
      'cartStore',
      { cartId },
      ensureError(error)
    );
    return { items, dropped: [] };
  }

  const reasonByItemId = new Map((data ?? []).map(row => [row.item_id, row.reason]));
  if (reasonByItemId.size === 0) return { items, dropped: [] };

  const dropped: DroppedCartItem[] = [];
  const kept: CartItemWithDetails[] = [];
  for (const item of items) {
    const block = reasonByItemId.get(item.id);
    if (block === undefined) {
      kept.push(item);
      continue;
    }
    dropped.push({
      itemId: item.id,
      dogName: item.dog?.call_name || item.dog?.name || null,
      className: item.class?.name ?? null,
      reason: describeBlockReason(block),
    });
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
