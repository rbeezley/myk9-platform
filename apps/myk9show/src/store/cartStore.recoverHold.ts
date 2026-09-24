/**
 * Bringing a lapsed cart back under the protection of the active-cart index
 * (MYK9-581, review C P2-1).
 *
 * `entry_carts_active_show_exhibitor_unique_idx` is `(show_id, exhibitor_id)
 * WHERE status = 'active'`. A row left at `status = 'expired'` is therefore NOT
 * covered by it: a second `createCart` for the same (show, exhibitor) succeeds,
 * the newer empty row wins every `created_at desc` read that `/cart`, the header
 * badge and `loadActiveCart` itself perform, and `stripe-checkout`'s own
 * recovery branch then fails its `status -> 'active'` update against the newer
 * row and marks the real draft `abandoned`. Extending the hold without
 * reactivating the row recovers its items for one session and loses them for
 * good on the next open.
 *
 * So recovery means making the row active again. The update is scoped
 * `.in('status', ['active','expired'])` so it can never resurrect a terminal
 * (submitted / abandoned) cart, and a 23505 on the index is the honest signal
 * that an active row already owns this (show, exhibitor): that row, not this
 * one, is the cart every other surface reads, so recover it instead.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { CART_EXPIRATION_MINUTES } from './cartStore.helpers';
import { isActiveCartUniqueViolation } from './cartStore.ensureCart';

export interface RecoverableCartRow {
  id: string;
  show_id: string;
  status: string | null;
  expires_at: string | null;
  /** Items the lookup counted on this row (MYK9-650); absent when unknown. */
  itemCount?: number | undefined;
}

export type RecoverCartHoldResult =
  { kind: 'recovered'; row: RecoverableCartRow; expiresAt: string } | { kind: 'failed' };

const freshHold = (): string =>
  new Date(Date.now() + CART_EXPIRATION_MINUTES * 60 * 1000).toISOString();

/**
 * Reactivate `row` and extend its hold. `exhibitorId` is only used to find the
 * active row that already owns this (show, exhibitor) when the index rejects the
 * reactivation.
 */
const reactivate = (rowId: string, expiresAt: string) =>
  supabase
    .from('entry_carts')
    .update({
      // Not just the hold: an 'expired' row the index does not cover is a row a
      // duplicate INSERT can be created alongside.
      status: 'active',
      expires_at: expiresAt,
      stripe_checkout_session_id: null,
    })
    .eq('id', rowId)
    .in('status', ['active', 'expired']);

export async function recoverCartHold(
  row: RecoverableCartRow,
  exhibitorId: string
): Promise<RecoverCartHoldResult> {
  const expiresAt = freshHold();

  const { error } = await reactivate(row.id, expiresAt);

  if (!error) return { kind: 'recovered', row: { ...row, status: 'active' }, expiresAt };

  if (!isActiveCartUniqueViolation(error)) {
    logger.error('Error recovering cart', 'cartStore', { exhibitorId, cartId: row.id }, error);
    return { kind: 'failed' };
  }

  // Another row already holds the active slot for this (show, exhibitor).
  const { data: activeRow, error: activeRowError } = await supabase
    .from('entry_carts')
    .select('id, show_id, status, expires_at, entry_cart_items(count)')
    .eq('exhibitor_id', exhibitorId)
    .eq('show_id', row.show_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // MYK9-650: the picker chose `row` BECAUSE it has items and the active row
  // was newer. If the active row is empty it holds the slot and nothing else,
  // so it yields: retire it and reactivate the cart with the draft. Nothing is
  // merged. When the active row has items of its own it keeps the slot, as
  // before — two carts with items is what the remediation script resolves.
  const activeItemCount = activeRow?.entry_cart_items?.[0]?.count ?? 0;
  if (activeRow && (row.itemCount ?? 0) > 0 && activeItemCount === 0) {
    const { error: retireError } = await supabase
      .from('entry_carts')
      .update({ status: 'expired' })
      .eq('id', activeRow.id)
      .eq('status', 'active');
    if (!retireError) {
      // The empty row is retired, so it can no longer be recovered below.
      const { error: retryError } = await reactivate(row.id, expiresAt);
      if (!retryError) return { kind: 'recovered', row: { ...row, status: 'active' }, expiresAt };
      logger.error(
        'Error reactivating the cart with items after retiring the empty active cart',
        'cartStore',
        { exhibitorId, cartId: row.id, retiredCartId: activeRow.id },
        retryError
      );
      return { kind: 'failed' };
    }
    logger.warn(
      'Could not retire the empty active cart; recovering it instead',
      'cartStore',
      { exhibitorId, cartId: row.id, activeCartId: activeRow.id },
      retireError
    );
  }

  if (activeRowError || !activeRow) {
    logger.error(
      'Active cart conflicts with the recovered cart but could not be read',
      'cartStore',
      { exhibitorId, cartId: row.id },
      activeRowError ?? new Error('No active cart found after a unique violation')
    );
    return { kind: 'failed' };
  }

  // It is already 'active', so this update is the same-row case and cannot
  // collide with the index again — no second conflict branch is reachable.
  const { error: extendError } = await supabase
    .from('entry_carts')
    .update({ expires_at: expiresAt, stripe_checkout_session_id: null })
    .eq('id', activeRow.id)
    .eq('status', 'active');

  if (extendError) {
    logger.error(
      'Error extending the hold on the conflicting active cart',
      'cartStore',
      { exhibitorId, cartId: activeRow.id },
      extendError
    );
    return { kind: 'failed' };
  }

  return {
    kind: 'recovered',
    row: {
      id: activeRow.id,
      show_id: activeRow.show_id,
      status: activeRow.status,
      expires_at: activeRow.expires_at,
    },
    expiresAt,
  };
}
