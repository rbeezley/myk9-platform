// Promo code types for trial discount management

export interface PromoCode {
  id: string;
  trial_id: string;
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

export interface PromoCodeValidationResult {
  valid: boolean;
  error?: string;
  promoCode?: PromoCode;
}
