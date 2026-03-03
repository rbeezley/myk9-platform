// Promo code data mappers - transform between database and application types

import type { DbPromoCode, DbPromoCodeInsert } from '@/types/database-mappings';
import type { PromoCode, PromoCodeFormData } from '@/types/promo-codes';

export const mapDbPromoCodeToApp = (db: DbPromoCode): PromoCode => ({
  id: db.id,
  trial_id: db.trial_id,
  code: db.code,
  discount_type: db.discount_type as 'percentage' | 'flat',
  discount_value: db.discount_value,
  usage_limit: db.usage_limit,
  usage_count: db.usage_count,
  expires_at: db.expires_at,
  created_by: db.created_by,
  created_at: db.created_at,
  updated_at: db.updated_at,
});

export const mapAppPromoCodeToDbInsert = (
  form: PromoCodeFormData,
  trialId: string,
  createdBy: string
): DbPromoCodeInsert => ({
  trial_id: trialId,
  code: form.code.toUpperCase(),
  discount_type: form.discount_type,
  discount_value: form.discount_value,
  usage_limit: form.usage_limit,
  expires_at: form.expires_at,
  created_by: createdBy,
});
