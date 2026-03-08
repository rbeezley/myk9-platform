// Promo code data mappers - transform between database and application types

import type { DbPromoCode, DbPromoCodeInsert } from '@/types/database-mappings';
import type { PromoCode, PromoCodeFormData, PromoCodeTarget } from '@/types/promo-codes';

export const mapDbPromoCodeToApp = (db: DbPromoCode): PromoCode => ({
  id: db.id,
  show_id: db.show_id ?? null,
  trial_id: db.trial_id ?? null,
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
  target: PromoCodeTarget,
  createdBy: string
): DbPromoCodeInsert => ({
  show_id: target.showId ?? null,
  trial_id: target.trialId ?? null,
  code: form.code.toUpperCase(),
  discount_type: form.discount_type,
  discount_value: form.discount_value,
  usage_limit: form.usage_limit,
  expires_at: form.expires_at,
  created_by: createdBy,
});
