// Authoritative data access module for the Promo Code entity.
// All callers import from here — never from supabaseClient directly.

export {
  getPromoCodesByTrial,
  getPromoCodesByShow,
  validatePromoCode,
  validatePromoCodeForEntry,
  calculatePromoDiscount,
} from './reads';

export {
  createPromoCode,
  deletePromoCode,
  incrementPromoCodeUsage,
} from './writes';
