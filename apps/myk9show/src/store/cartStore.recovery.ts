import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

import type { CartItemWithDetails } from './cartStore.types';

export const loadCartItemsByCartId = async (cartId: string): Promise<CartItemWithDetails[]> => {
  const { data, error } = await supabase
    .from('entry_cart_items')
    .select(
      `*, dog:dogs(id, name, call_name, breed), class:classes(id, name, level, trial_id), handler:people(id, first_name, last_name)`
    )
    .eq('cart_id', cartId);

  if (error) {
    logger.error('Error loading cart items', 'cartStore', { cartId }, error);
    throw error;
  }

  return (data || []) as CartItemWithDetails[];
};
