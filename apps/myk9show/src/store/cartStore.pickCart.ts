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
 * The rule, in ONE place so the three readers cannot drift: among the
 * recoverable carts, pick the NEWEST cart THAT HAS ITEMS; if none has items,
 * the newest cart. Carts are never merged here. Items stranded before this
 * rule shipped are moved by the one-off
 * `docs/operations/myk9-650-stranded-cart-remediation.sql`, which applies the
 * same ordering.
 *
 * The status predicate is unchanged: `('active','expired')` with no
 * `expires_at` filter, so a lapsed draft is still recovered with its items.
 */
import { supabase } from '@/lib/supabase';

/** Terminal carts (submitted / abandoned) are never recovered. */
export const RECOVERABLE_CART_STATUSES = ['active', 'expired'] as const;

/**
 * The lookup's column list. `entry_cart_items(count)` is the same embedded
 * count the badge has always used; the items' RLS is scoped to the viewer's own
 * carts, so it counts exactly the rows `/cart` will load.
 */
export const RECOVERABLE_CART_LOOKUP_COLUMNS =
  'id, show_id, status, expires_at, created_at, entry_cart_items(count)';

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

/** The newest cart that has items; the newest cart when none has. */
export function pickRecoverableCart(
  rows: readonly RecoverableCartLookupRow[]
): RecoverableCartCandidate | null {
  const candidates = rows.map(toCandidate).sort(newestFirst);
  return candidates.find(cart => cart.itemCount > 0) ?? candidates[0] ?? null;
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
