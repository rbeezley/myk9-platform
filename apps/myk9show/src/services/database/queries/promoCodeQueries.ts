// ========================================
// PROMO CODES
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbPromoCode, DbPromoCodeInsert } from '@/types/database-mappings';
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

export const getPromoCodesByShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('show_id', showId)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'select_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'select_by_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'select_by_show');
    logQuery('promo_code', 'select_by_show', duration, dbError.message);
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

/** Find a promo code by code string, checking both trial-level and show-level codes.
 *  Trial-level codes take priority over show-level codes. */
export const findPromoCodeByCode = async (trialId: string, showId: string, code: string) => {
  const startTime = Date.now();
  const upperCode = code.toUpperCase();

  try {
    // Single query: fetch both trial-level and show-level matches
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', upperCode)
      .or(`trial_id.eq.${trialId},show_id.eq.${showId}`);

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'find_by_code', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'find_by_code');
    }

    // Prefer trial-level match over show-level
    const match = data?.find(c => c.trial_id === trialId) ?? data?.[0] ?? null;
    return { data: match, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'find_by_code');
    logQuery('promo_code', 'find_by_code', duration, dbError.message);
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
    const { data, error } = await supabase.rpc(
      'increment_promo_usage' as never,
      {
        promo_id: id,
      } as never
    );

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

/**
 * Validate a promo code for a trial (trial-level only).
 * For registration flows that need both show + trial scope, use validatePromoCodeForEntry.
 */
export const validatePromoCode = async (
  trialId: string,
  code: string
): Promise<PromoCodeValidationResult> => {
  const { data: promoCode, error } = await getPromoCodeByCode(trialId, code);

  if (error || !promoCode) {
    return { valid: false, error: 'Invalid promo code' };
  }

  return validatePromoCodeRecord(promoCode);
};

/**
 * Validate a promo code against both trial-level and show-level codes.
 * Used in registration/checkout where a show-wide code should also apply.
 */
export const validatePromoCodeForEntry = async (
  trialId: string,
  showId: string,
  code: string
): Promise<PromoCodeValidationResult> => {
  const { data: promoCode, error } = await findPromoCodeByCode(trialId, showId, code);

  if (error || !promoCode) {
    return { valid: false, error: 'Invalid promo code' };
  }

  return validatePromoCodeRecord(promoCode);
};

/** Shared validation logic for a promo code record */
const validatePromoCodeRecord = (promoCode: DbPromoCode): PromoCodeValidationResult => {
  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return { valid: false, error: 'This promo code has expired' };
  }

  if (promoCode.usage_limit !== null && promoCode.usage_count >= promoCode.usage_limit) {
    return { valid: false, error: 'This promo code has reached its usage limit' };
  }

  return {
    valid: true,
    promoCode: {
      id: promoCode.id,
      show_id: promoCode.show_id ?? null,
      trial_id: promoCode.trial_id ?? null,
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
