// Read-side operations for Promo Codes (lookup, validation, discount math).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbPromoCode } from '@/types/database-mappings';
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

    const match = data?.find((c) => c.trial_id === trialId) ?? data?.[0] ?? null;
    return { data: match, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'find_by_code');
    logQuery('promo_code', 'find_by_code', duration, dbError.message);
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

export const calculatePromoDiscount = (
  discountType: 'percentage' | 'flat',
  discountValue: number,
  entryFee: number
): number => {
  if (discountType === 'percentage') {
    return Math.min(entryFee, (entryFee * discountValue) / 100);
  }
  return Math.min(entryFee, discountValue);
};
