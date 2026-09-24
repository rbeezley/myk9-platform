/**
 * Which of an exhibitor's carts is "the" cart (MYK9-650).
 *
 * `/cart` (`loadActiveCart`), the wizard opener (which recovers through
 * `loadActiveCart`) and the header badge (`useActiveCartItemCount`) used to
 * read `status IN ('active','expired') ORDER BY created_at DESC LIMIT 1` each on
 * their own. A newer EMPTY cart for the same show therefore hid an older cart's
 * drafted items from all three, and the exhibitor saw an empty cart and a 0
 * badge while their classes sat in a row nothing read.
 *
 * The rule, in ONE place so the three readers cannot drift: pick the NEWEST
 * cart THAT HAS ITEMS; if none has items, the newest cart. Carts are never
 * merged here.
 *
 * One qualification, forced by the database rather than chosen: a cart the
 * client can OPEN ranks ahead of one it cannot. `trg_entry_carts_protect_status`
 * (20260611230000) rejects any non-service-role update that sets status
 * 'active' on another status, so this client can never reactivate a row whose
 * status is 'expired' (only stripe-checkout, as service_role, can). Picking an
 * expired cart over the exhibitor's active one would therefore trade a cart
 * they can use for one that fails to open. So the ranking is:
 *
 *   1. status 'active' with items (newest first)
 *   2. status 'active'
 *   3. status 'expired' with items
 *   4. status 'expired'
 *
 * The unique index allows at most one active cart per (show, exhibitor), so for
 * a show-scoped read the active cart wins whenever it exists; the rule does its
 * work across shows (`/cart` without a show, and the badge). Items already
 * stranded in 'expired' rows are moved into the openable cart by the one-off
 * `docs/operations/myk9-650-stranded-cart-remediation.sql`, which ranks the
 * same way. Whether the client should be able to reopen an 'expired' row at all
 * is an open decision (a SECURITY DEFINER reopen), not something this module
 * can route around.
 *
 * The status predicate is unchanged: `('active','expired')` with no
 * `expires_at` filter, so a lapsed hold on an active row is still recovered.
 */
import { supabase } from '@/lib/supabase';
import {
  RECOVERABLE_CART_LOOKUP_COLUMNS,
  RECOVERABLE_CART_STATUSES,
} from './cartStore.pickCart.constants';

export { RECOVERABLE_CART_LOOKUP_COLUMNS, RECOVERABLE_CART_STATUSES };

/**
 * Upper bound on candidates read per lookup. Live data has at most a handful of
 * recoverable carts per exhibitor; the bound only stops a pathological account
 * from turning the badge into a large read.
 */
export const RECOVERABLE_CART_CANDIDATE_LIMIT = 50;

/** One `entry_carts` row as the lookup returns it. */
export interface RecoverableCartLookupRow {
  id: string;
  show_id: string;
  status: string | null;
  expires_at: string | null;
  created_at: string | null;
  entry_cart_items?: Array<{ count: number | null }> | null;
}

/** A candidate cart with its item count resolved. */
export interface RecoverableCartCandidate {
  id: string;
  show_id: string;
  status: string | null;
  expires_at: string | null;
  created_at: string | null;
  itemCount: number;
}

const toCandidate = (row: RecoverableCartLookupRow): RecoverableCartCandidate => ({
  id: row.id,
  show_id: row.show_id,
  status: row.status,
  expires_at: row.expires_at,
  created_at: row.created_at,
  itemCount: row.entry_cart_items?.[0]?.count ?? 0,
});

const createdAtMs = (value: string | null): number => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/**
 * Newest first, a missing `created_at` last, then id descending so the pick is
 * deterministic — the same ORDER BY the remediation script uses.
 */
const newestFirst = (a: RecoverableCartCandidate, b: RecoverableCartCandidate): number =>
  createdAtMs(b.created_at) - createdAtMs(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Openable (status 'active') before not, then with items before without. */
const rank = (cart: RecoverableCartCandidate): number =>
  (cart.status === 'active' ? 0 : 2) + (cart.itemCount > 0 ? 0 : 1);

/** The newest openable cart that has items; see the ranking above. */
export function pickRecoverableCart(
  rows: readonly RecoverableCartLookupRow[]
): RecoverableCartCandidate | null {
  const candidates = rows.map(toCandidate).sort((a, b) => rank(a) - rank(b) || newestFirst(a, b));
  return candidates[0] ?? null;
}

export type FindRecoverableCartResult =
  | { kind: 'found'; cart: RecoverableCartCandidate }
  | { kind: 'none' }
  | { kind: 'error'; error: unknown };

/**
 * Read this exhibitor's recoverable carts (for one show, when given) and pick
 * one. The single lookup `/cart`, the wizard opener and the badge share.
 */
export async function findRecoverableCart({
  exhibitorId,
  showId,
}: {
  exhibitorId: string;
  showId?: string | undefined;
}): Promise<FindRecoverableCartResult> {
  let query = supabase
    .from('entry_carts')
    .select(RECOVERABLE_CART_LOOKUP_COLUMNS)
    .eq('exhibitor_id', exhibitorId)
    .in('status', [...RECOVERABLE_CART_STATUSES]);

  if (showId) query = query.eq('show_id', showId);

  const { data, error } = await query
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(RECOVERABLE_CART_CANDIDATE_LIMIT);

  if (error) return { kind: 'error', error };

  const cart = pickRecoverableCart((data ?? []) as RecoverableCartLookupRow[]);
  return cart ? { kind: 'found', cart } : { kind: 'none' };
}
