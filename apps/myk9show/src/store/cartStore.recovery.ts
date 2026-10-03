import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

import { calculateCartTotals } from './cartStore.helpers';
import type {
  CartItemWithDetails,
  DroppedRecoveryEntries,
  EntryCartItemInsert,
} from './cartStore.types';

export interface RecoverableEntryRow {
  id: string;
  class_id: string | null;
  dog_id: string | null;
  handler_id: string | null;
  entry_fee: number | string | null;
  jump_height: string | null;
  special_requests: string | null;
  class_entry_fee: number | string | null;
  show_pre_entry_fee: number | string | null;
  show_day_of_show_fee: number | string | null;
  show_start_date: string | null;
}

export const RECOVERABLE_ENTRY_STATUSES = [
  'pending',
  'submitted',
  'pending-payment',
  'confirmed',
  'moved',
] as const;

const DEFAULT_ENTRY_FEE_DOLLARS = 25;

const parseFeeDollars = (value: number | string | null): number | null => {
  if (value == null) return null;
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getNormalEntryFeeCents = (entry: RecoverableEntryRow): number => {
  const preEntryFee = parseFeeDollars(entry.show_pre_entry_fee);
  const dayOfShowFee = parseFeeDollars(entry.show_day_of_show_fee);
  const showStartDate = entry.show_start_date?.slice(0, 10);
  const todayUtc = new Date().toISOString().slice(0, 10);

  if (showStartDate && todayUtc >= showStartDate && dayOfShowFee != null) {
    return Math.round(dayOfShowFee * 100);
  }
  if (preEntryFee != null) return Math.round(preEntryFee * 100);

  return Math.round((parseFeeDollars(entry.class_entry_fee) ?? DEFAULT_ENTRY_FEE_DOLLARS) * 100);
};

/**
 * A Finish Payment line settles an entry whose fee was FROZEN at creation, so the
 * line is quoted at that stored `entry_fee` (MYK9-879): a later change to the
 * show's fees or junior tier never re-prices it, and a junior or desk-discounted
 * entry comes back at the amount it was created at. Only a row with no positive
 * stored fee (a zero move-up destination, a NULL) falls back to the tiers, the
 * same rule `stripe-checkout` applies.
 */
export const getAuthoritativeEntryFeeCents = (entry: RecoverableEntryRow): number => {
  const frozen = parseFeeDollars(entry.entry_fee);
  if (frozen != null && frozen > 0) return Math.round(frozen * 100);
  return getNormalEntryFeeCents(entry);
};

/**
 * A recovery read or write that FAILED, as distinct from one that found nothing
 * eligible (MYK9-873). Only a successful answer may become an "entries were left
 * out" notice; a failure is a retryable error.
 */
export type RecoveryOutcome<T> = { ok: true; value: T } | { ok: false };

const ok = <T>(value: T): RecoveryOutcome<T> => ({ ok: true, value });
const FAILED = { ok: false } as const;

/** Shown when the payment-link lookup or rebuild fails; the exhibitor can retry. */
export const RECOVERY_FAILED_MESSAGE =
  'We could not check the entries in your payment link. Please reload the page to try again.';

export const findRecoverableEntries = async ({
  showId,
  exhibitorId,
  entryIds,
}: {
  showId: string;
  exhibitorId: string;
  entryIds: string[];
}): Promise<RecoveryOutcome<RecoverableEntryRow[]>> => {
  const explicitEntryIds = Array.from(new Set(entryIds.filter(Boolean)));
  if (explicitEntryIds.length === 0) return ok([]);

  const { data: profile, error: profileError } = await supabase
    .from('exhibitor_profiles')
    .select('person_id')
    .eq('id', exhibitorId)
    .maybeSingle();

  if (profileError) {
    logger.error(
      'Error loading exact cart recovery profile',
      'cartStore',
      { exhibitorId },
      profileError
    );
    return FAILED;
  }
  // No person behind the profile: nothing of theirs can be recovered.
  if (!profile?.person_id) return ok([]);

  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('id')
    .or(`owner_id.eq.${profile.person_id},co_owner_id.eq.${profile.person_id}`);

  if (dogsError) {
    logger.error('Error loading exact cart recovery dogs', 'cartStore', { exhibitorId }, dogsError);
    return FAILED;
  }

  const dogIds = (dogs || []).map(dog => dog.id);
  if (dogIds.length === 0) return ok([]);

  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(
      `id, class_id, dog_id, handler_id, entry_fee, jump_height, special_requests,
       class:classes(entry_fee), show:shows(pre_entry_fee, day_of_show_fee, start_date)`
    )
    .in('id', explicitEntryIds)
    .eq('show_id', showId)
    .eq('payment_status', 'pending')
    // Keep this aligned with entries_entry_status_check; UI "accepted" maps to DB "confirmed".
    // A moved-up source remains the money-bearing row. It is intentionally
    // recoverable by its explicit id even though normal cart discovery never
    // offers terminal/moved rows.
    .in('entry_status', RECOVERABLE_ENTRY_STATUSES)
    .is('deleted_at', null)
    .in('dog_id', dogIds);

  if (entriesError) {
    logger.error(
      'Error loading exact pending entries for cart recovery',
      'cartStore',
      { exhibitorId, showId },
      entriesError
    );
    return FAILED;
  }

  return ok(
    (entries || []).map(entry => {
      const classRow = Array.isArray(entry.class) ? entry.class[0] : entry.class;
      const showRow = Array.isArray(entry.show) ? entry.show[0] : entry.show;
      return {
        ...entry,
        class_entry_fee: classRow?.entry_fee ?? null,
        show_pre_entry_fee: showRow?.pre_entry_fee ?? null,
        show_day_of_show_fee: showRow?.day_of_show_fee ?? null,
        show_start_date: showRow?.start_date ?? null,
      } as RecoverableEntryRow;
    })
  );
};

export const loadCartItemsByCartId = async (cartId: string): Promise<CartItemWithDetails[]> => {
  const { data, error } = await supabase
    .from('entry_cart_items')
    .select(
      `*, dog:dogs(id, name, call_name, registrations:dog_registrations(id, created_at, breed)), class:classes(id, name, level, trial_id, allow_waitlist), handler:people(id, first_name, last_name)`
    )
    .eq('cart_id', cartId);

  if (error) {
    logger.error('Error loading cart items', 'cartStore', { cartId }, error);
    throw error;
  }

  return (data || []) as CartItemWithDetails[];
};

export const recoverCartItemsFromEntryIds = async ({
  cartId,
  showId,
  exhibitorId,
  entryIds,
  recoverableEntries,
}: {
  cartId: string;
  showId: string;
  exhibitorId: string;
  entryIds: string[];
  recoverableEntries?: RecoverableEntryRow[];
}): Promise<RecoveryOutcome<CartItemWithDetails[]>> => {
  let entries = recoverableEntries;
  if (!entries) {
    const lookup = await findRecoverableEntries({ showId, exhibitorId, entryIds });
    if (!lookup.ok) return FAILED;
    entries = lookup.value;
  }

  const itemInserts: EntryCartItemInsert[] = entries
    .filter(entry => entry.class_id && entry.dog_id)
    .map(entry => ({
      cart_id: cartId,
      entry_id: entry.id,
      class_id: entry.class_id!,
      dog_id: entry.dog_id!,
      handler_id: entry.handler_id,
      entry_fee_cents: getAuthoritativeEntryFeeCents(entry),
      jump_height: entry.jump_height,
      special_requests: entry.special_requests,
    }));

  if (itemInserts.length === 0) return ok([]);

  const { error: upsertError } = await supabase.from('entry_cart_items').upsert(itemInserts, {
    onConflict: 'cart_id,dog_id,class_id',
    ignoreDuplicates: true,
  });

  if (upsertError) {
    logger.error('Error rebuilding exact cart items', 'cartStore', { cartId }, upsertError);
    return FAILED;
  }

  const recoveredItems = await loadCartItemsByCartId(cartId);
  const { subtotal, platformFee, total } = calculateCartTotals(recoveredItems);

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
    logger.error(
      'Error updating exact recovered cart totals',
      'cartStore',
      { cartId },
      updateError
    );
  }

  return ok(recoveredItems);
};

/**
 * The cart lines for a Finish Payment link, and the linked entries that are still
 * payable (for the notice). An EMPTY cart is rebuilt from the link; a cart that
 * already holds lines is never backfilled, but the payable set is still read so
 * the notice can say which linked entries it lacks. `recoverableEntries` skips the
 * lookup when the caller already made it.
 */
export const loadPaymentLinkItems = async ({
  cartId,
  showId,
  exhibitorId,
  entryIds,
  items,
  recoverableEntries,
}: {
  cartId: string;
  showId: string;
  exhibitorId: string;
  entryIds: string[];
  items: CartItemWithDetails[];
  recoverableEntries?: RecoverableEntryRow[] | undefined;
}): Promise<
  RecoveryOutcome<{ items: CartItemWithDetails[]; recoverable: RecoverableEntryRow[] }>
> => {
  let recoverable = recoverableEntries;
  if (!recoverable) {
    const lookup = await findRecoverableEntries({ showId, exhibitorId, entryIds });
    if (!lookup.ok) return FAILED;
    recoverable = lookup.value;
  }
  if (items.length > 0) return ok({ items, recoverable });

  const rebuilt = await recoverCartItemsFromEntryIds({
    cartId,
    showId,
    exhibitorId,
    entryIds,
    recoverableEntries: recoverable,
  });
  return rebuilt.ok ? ok({ items: rebuilt.value, recoverable }) : FAILED;
};

/**
 * How many of the entries a Finish Payment link named are NOT in the cart the
 * exhibitor is about to pay, and why (MYK9-873). `items` must be the cart AFTER
 * reconciliation against live entries, so a line removed because it was paid
 * since is counted. Lines removed for a closed class are still in `items` here
 * and get their own notice. Split by `recoverable` (the linked entries that are
 * still payable): one that is payable but missing is `stillUnpaid` (an existing
 * cart is never backfilled), any other is `unavailable` (paid, withdrawn, or no
 * longer open). Null when every linked entry is in the cart.
 */
export const summarizeDroppedRecoveryEntries = (
  cartId: string,
  entryIds: string[],
  items: Pick<CartItemWithDetails, 'entry_id'>[],
  recoverable: Pick<RecoverableEntryRow, 'id'>[]
): DroppedRecoveryEntries | null => {
  const requested = new Set(entryIds.filter(Boolean));
  const inCart = new Set(items.map(item => item.entry_id).filter(Boolean));
  const payable = new Set(recoverable.map(entry => entry.id));
  const missing = [...requested].filter(id => !inCart.has(id));
  if (missing.length === 0) return null;
  const stillUnpaid = missing.filter(id => payable.has(id)).length;
  return {
    cartId,
    requested: requested.size,
    stillUnpaid,
    unavailable: missing.length - stillUnpaid,
  };
};
