// Read-side operations for Promo Codes (secretary catalog + validation).
//
// SA-002: the promo_codes catalog is officials-only at the RLS layer. Exhibitor
// code validation therefore goes through the `validate_promo_code` SECURITY
// DEFINER RPC, which returns only match/no-match + discount and never exposes
// the underlying rows. The secretary catalog reads (getPromoCodesBy*) remain
// direct SELECTs — those callers are always show officials.

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
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

/**
 * Validate a promo code for a trial (trial-level only).
 * For registration flows that need both show + trial scope, use validatePromoCodeForEntry.
 */
export const validatePromoCode = async (
  trialId: string,
  code: string
): Promise<PromoCodeValidationResult> => {
  return validateViaRpc(code, trialId, null);
};

/**
 * Validate a promo code against both trial-level and show-level codes.
 * Used in registration/checkout where a show-wide code should also apply.
 * Trial-level codes take precedence over show-level (enforced in the RPC).
 */
export const validatePromoCodeForEntry = async (
  trialId: string,
  showId: string,
  code: string
): Promise<PromoCodeValidationResult> => {
  return validateViaRpc(code, trialId, showId);
};

const validateViaRpc = async (
  code: string,
  trialId: string | null,
  showId: string | null
): Promise<PromoCodeValidationResult> => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('validate_promo_code', {
      p_code: code,
      p_trial_id: trialId,
      p_show_id: showId,
    });

    const duration = Date.now() - startTime;
    logQuery('promo_code', 'validate_rpc', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'promo_code', 'validate_rpc');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.valid) {
      return { valid: false, error: row?.reason ?? 'Invalid promo code' };
    }

    return {
      valid: true,
      promoCode: {
        id: row.promo_code_id as string,
        discount_type: row.discount_type as 'percentage' | 'flat',
        discount_value: Number(row.discount_value),
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'promo_code', 'validate_rpc');
    logQuery('promo_code', 'validate_rpc', duration, dbError.message);
    return { valid: false, error: 'Invalid promo code' };
  }
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
