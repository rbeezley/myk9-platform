import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

import { calculateCartTotals } from './cartStore.helpers';
import type { CartItemWithDetails, EntryCartItemInsert } from './cartStore.types';

export interface RecoverableEntryRow {
  id: string;
  class_id: string | null;
  dog_id: string | null;
  handler_id: string | null;
  entry_fee: number | string | null;
  jump_height: string | null;
  special_requests: string | null;
}

export const findRecoverableEntries = async ({
  showId,
  exhibitorId,
  entryIds,
}: {
  showId: string;
  exhibitorId: string;
  entryIds: string[];
}): Promise<RecoverableEntryRow[]> => {
  const explicitEntryIds = Array.from(new Set(entryIds.filter(Boolean)));
  if (explicitEntryIds.length === 0) return [];

  const { data: profile, error: profileError } = await supabase
    .from('exhibitor_profiles')
    .select('person_id')
    .eq('id', exhibitorId)
    .maybeSingle();

  if (profileError || !profile?.person_id) {
    if (profileError) {
      logger.error(
        'Error loading exact cart recovery profile',
        'cartStore',
        { exhibitorId },
        profileError
      );
    }
    return [];
  }

  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('id')
    .or(`owner_id.eq.${profile.person_id},co_owner_id.eq.${profile.person_id}`);

  if (dogsError) {
    logger.error('Error loading exact cart recovery dogs', 'cartStore', { exhibitorId }, dogsError);
    return [];
  }

  const dogIds = (dogs || []).map(dog => dog.id);
  if (dogIds.length === 0) return [];

  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select('id, class_id, dog_id, handler_id, entry_fee, jump_height, special_requests')
    .in('id', explicitEntryIds)
    .eq('show_id', showId)
    .eq('payment_status', 'pending')
    // Keep this aligned with entries_entry_status_check; UI "accepted" maps to DB "confirmed".
    .in('entry_status', ['pending', 'submitted', 'pending-payment', 'confirmed'])
    .is('deleted_at', null)
    .in('dog_id', dogIds);

  if (entriesError) {
    logger.error(
      'Error loading exact pending entries for cart recovery',
      'cartStore',
      { exhibitorId, showId },
      entriesError
    );
    return [];
  }

  return (entries || []) as RecoverableEntryRow[];
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
}): Promise<CartItemWithDetails[]> => {
  const entries =
    recoverableEntries ?? (await findRecoverableEntries({ showId, exhibitorId, entryIds }));

  const itemInserts: EntryCartItemInsert[] = ((entries || []) as RecoverableEntryRow[])
    .filter(entry => entry.class_id && entry.dog_id)
    .map(entry => ({
      cart_id: cartId,
      entry_id: entry.id,
      class_id: entry.class_id!,
      dog_id: entry.dog_id!,
      handler_id: entry.handler_id,
      entry_fee_cents: Math.round(Number(entry.entry_fee ?? 0) * 100),
      jump_height: entry.jump_height,
      special_requests: entry.special_requests,
    }));

  if (itemInserts.length === 0) return [];

  const { error: upsertError } = await supabase.from('entry_cart_items').upsert(itemInserts, {
    onConflict: 'cart_id,dog_id,class_id',
    ignoreDuplicates: true,
  });

  if (upsertError) {
    logger.error('Error rebuilding exact cart items', 'cartStore', { cartId }, upsertError);
    return [];
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

  return recoveredItems;
};
