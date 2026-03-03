// ========================================
// PROMO CODES
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbPromoCodeInsert } from '@/types/database-mappings';
import type { PromoCodeValidationResult } from '@/types/promo-codes';

export const getPromoCodesByTrial = async (trialId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('trial_id', trialId)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'select_by_trial', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'select_by_trial');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'select_by_trial');
    logQuery('promo_code', 'select_by_trial', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getPromoCodeByCode = async (trialId: string, code: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('trial_id', trialId)
      .eq('code', code.toUpperCase())
      .single();

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'select_by_code', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'select_by_code');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'select_by_code');
    logQuery('promo_code', 'select_by_code', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

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
    const { data, error } = await supabase.rpc('increment_promo_usage' as never, {
      promo_id: id,
    } as never);

    // Fallback: if no RPC exists, do a manual increment
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

export const validatePromoCode = async (
  trialId: string,
  code: string
): Promise<PromoCodeValidationResult> => {
  const { data: promoCode, error } = await getPromoCodeByCode(trialId, code);

  if (error || !promoCode) {
    return { valid: false, error: 'Invalid promo code' };
  }

  // Check expiry
  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return { valid: false, error: 'This promo code has expired' };
  }

  // Check usage limit
  if (promoCode.usage_limit !== null && promoCode.usage_count >= promoCode.usage_limit) {
    return { valid: false, error: 'This promo code has reached its usage limit' };
  }

  return {
    valid: true,
    promoCode: {
      id: promoCode.id,
      trial_id: promoCode.trial_id,
      code: promoCode.code,
      discount_type: promoCode.discount_type as 'percentage' | 'flat',
      discount_value: promoCode.discount_value,
      usage_limit: promoCode.usage_limit,
      usage_count: promoCode.usage_count,
      expires_at: promoCode.expires_at,
      created_by: promoCode.created_by,
      created_at: promoCode.created_at,
      updated_at: promoCode.updated_at,
    },
  };
};

export const calculateDiscount = (
  discountType: 'percentage' | 'flat',
  discountValue: number,
  entryFee: number
): number => {
  if (discountType === 'percentage') {
    return Math.min(entryFee, (entryFee * discountValue) / 100);
  }
  return Math.min(entryFee, discountValue);
};
