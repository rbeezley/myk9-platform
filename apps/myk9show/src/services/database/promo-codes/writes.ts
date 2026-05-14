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
    const { data, error } = await supabase.rpc(
      'increment_promo_usage' as never,
      { promo_id: id } as never
    );

    // Fallback: if no RPC exists, do a manual increment.
    if (error) {
      const { data: current } = await supabase
        .from('promo_codes')
        .select('usage_count')
        .eq('id', id)
        .single();

      const newCount = (current?.usage_count ?? 0) + 1;
      const { data: updated, error: updateError } = await supabase
        .from('promo_codes')
        .update({ usage_count: newCount })
        .eq('id', id)
        .select()
        .single();

      const duration = Date.now() - startTime;
      logQuery('promo_code', 'increment_usage', duration, updateError?.message);

      if (updateError) {
        throw createDatabaseError(updateError, 'promo_code', 'increment_usage');
      }

      return { data: updated, error: null };
    }

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'increment_usage', duration);
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'increment_usage');
    logQuery('promo_code', 'increment_usage', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
