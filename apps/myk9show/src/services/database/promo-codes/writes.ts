// Write-side operations for Promo Codes (create, delete, usage tracking).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbPromoCodeInsert } from '@/types/database-mappings';

export const createPromoCode = async (promoCode: DbPromoCodeInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .insert({ ...promoCode, code: promoCode.code.toUpperCase() })
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'insert');
    logQuery('promo_code', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deletePromoCode = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('promo_codes').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'delete');
    logQuery('promo_code', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

export const incrementPromoCodeUsage = async (id: string) => {
  const startTime = Date.now();

  try {
    // increment_promo_usage is a SECURITY DEFINER RPC (migration 085) that
    // safely increments usage_count for any authenticated user. It is the ONLY
    // correct path now that promo_codes writes/reads are officials-only
    // (SA-002): the previous raw SELECT+UPDATE fallback would RLS-fail for
    // exhibitor checkout sessions and silently under-count, so it is removed.
    const { error } = await supabase.rpc('increment_promo_usage', { promo_id: id });

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'increment_usage', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'increment_usage');
    }

    return { data: null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'increment_usage');
    logQuery('promo_code', 'increment_usage', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
