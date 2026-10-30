import { STEP_UP_REQUIRED_CODE } from '@/features/step-up/stepUpFetch';

/**
 * The Stripe ledger's ON DELETE RESTRICT foreign keys (migration
 * 20260915191700). Matched by constraint name, because 23503 alone says only
 * "something references this row": a `secretary_tasks.created_by` reference is
 * a 23503 too, and it has nothing to do with money (MYK9-750).
 */
const STRIPE_LEDGER_FK = /stripe_orders_(show|enrollment)_id_fkey/;

/**
 * hard_delete_show's refusal code: the show is not unused (entries, money,
 * deliveries or other records that must be kept), and its message says which
 * (MYK9-1472).
 */
const SHOW_IN_USE_CODE = 'MK615';

/** lock_not_available and deadlock_detected: the transaction rolled back whole. */
const LOCK_CONFLICT_CODES = new Set(['55P03', '40P01']);

export const STRIPE_LEDGER_REFUSAL_MESSAGE =
  'This record has Stripe orders that refunds and reconciliation still reference, so it cannot be permanently deleted. Resolve or reassign those orders first.';

export const DATABASE_BUSY_REFUSAL_MESSAGE =
  'The database was busy, so nothing was deleted. Try again in a quiet moment.';

/**
 * The sentence to show when a permanent delete was REFUSED by a guard or
 * stopped by a lock conflict, or null when the failure is not one of those. A
 * refusal is not transient, so "please try again" is the wrong advice for it
 * (MYK9-527, MYK9-750).
 */
export function permanentDeleteRefusalMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';
  if (!text) return null;

  if (typeof code === 'string' && LOCK_CONFLICT_CODES.has(code)) {
    return DATABASE_BUSY_REFUSAL_MESSAGE;
  }

  // hard_delete_show's unused-show guard and the owns-dogs trigger (MK001)
  // both author a sentence that says what to do.
  if (code === SHOW_IN_USE_CODE || code === 'MK001') return text;

  // A cancelled or failed step-up prompt: permanentDeleteUser authors the sentence (MYK9-1461).
  if (code === STEP_UP_REQUIRED_CODE) return text;

  if (code === '23503' && STRIPE_LEDGER_FK.test(text)) return STRIPE_LEDGER_REFUSAL_MESSAGE;
  return null;
}
