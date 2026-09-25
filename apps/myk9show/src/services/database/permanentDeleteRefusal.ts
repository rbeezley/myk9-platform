import { SHOW_HAS_STRIPE_ORDERS } from '@/services/database/shows';

/**
 * The Stripe ledger's ON DELETE RESTRICT foreign keys (migration
 * 20260915191700). Matched by constraint name, because 23503 alone says only
 * "something references this row": a `secretary_tasks.created_by` reference is
 * a 23503 too, and it has nothing to do with money (MYK9-750).
 */
const STRIPE_LEDGER_FK = /stripe_orders_(show|enrollment)_id_fkey/;

export const STRIPE_LEDGER_REFUSAL_MESSAGE =
  'This record has Stripe orders that refunds and reconciliation still reference, so it cannot be permanently deleted. Resolve or reassign those orders first.';

/**
 * The sentence to show when a permanent delete was REFUSED by a guard, or
 * null when the failure is not one of those. A refusal is not transient, so
 * "please try again" is the wrong advice for it (MYK9-527, MYK9-750).
 */
export function permanentDeleteRefusalMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';
  if (!text) return null;

  // The client-side ledger pre-check and the owns-dogs trigger (MK001) both
  // author a sentence that says what to do.
  if (code === SHOW_HAS_STRIPE_ORDERS || code === 'MK001') return text;

  if (code === '23503') {
    if (STRIPE_LEDGER_FK.test(text)) return STRIPE_LEDGER_REFUSAL_MESSAGE;
    // hard_delete_show's own pre-check raises its readable refusal as 23503.
    if (/Stripe order/.test(text)) return text;
  }
  return null;
}
