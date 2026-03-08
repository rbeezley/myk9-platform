// Promo code types for show/trial discount management

export type PromoCodeScope = 'show' | 'trial';

export interface PromoCode {
  id: string;
  show_id: string | null;
  trial_id: string | null;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  usage_limit: number | null;
  usage_count: number;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeFormData {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  usage_limit: number | null;
  expires_at: string | null;
}

/** Scope target for creating a promo code — exactly one of showId or trialId */
export type PromoCodeTarget =
  | { showId: string; trialId?: never }
  | { showId?: never; trialId: string };

export interface PromoCodeValidationResult {
  valid: boolean;
  error?: string;
  promoCode?: PromoCode;
}
