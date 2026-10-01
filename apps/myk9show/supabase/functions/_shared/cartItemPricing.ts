// Deno-free (colocated vitest). The ONE place a cart line is priced for the three
// money paths that must agree: stripe-checkout (what Stripe is asked to charge),
// stripe-webhook (what the paid total is verified against and what the entry is
// created with) and the secretary payment link.
//
// MYK9-879: the junior-handler declaration. Nothing here derives junior status:
// there is no date of birth and no dog or handler identity in the inputs. A NEW
// cart line carries the exhibitor's declaration (a request, honored only on a show
// with a junior tier); a Finish Payment line (entry_id set) points at an entry that
// already exists, whose fee was fixed at creation, so its STORED record decides and
// the cart's declaration is ignored.

import { authoritativeEntryFeeCents } from './authoritativeFee.ts';

export interface PricingShow {
  pre_entry_fee: number | string | null;
  day_of_show_fee: number | string | null;
  start_date: string | null;
  junior_handler_fee: number | string | null;
  /** shows.organization; a declaration is honored on no ASCA show. */
  organization?: string | null | undefined;
}

export interface CartItemForPricing {
  id: string;
  dog_id: string;
  class_id: string;
  /** Set on a Finish Payment line: the existing entry this line settles. */
  entry_id?: string | null | undefined;
  /** entry_cart_items.junior_fee_declared; client-writable, so only a request. */
  junior_fee_declared?: boolean | null | undefined;
  /** classes.entry_fee, the last link of the authority chain. */
  class_entry_fee: number | string | null;
}

/** The fee-relevant record on an existing entry. */
export interface StoredEntryJunior {
  dog_id: string | null;
  class_id: string | null;
  junior_fee_declared: boolean | null;
  /** people.id of the secretary who charged the junior fee at the desk (slice B). */
  junior_fee_override_by: string | null;
  /** entries.entry_fee, DECIMAL dollars: the fee FROZEN when the entry was created. */
  entry_fee?: number | string | null | undefined;
}

/** The entry's frozen fee in cents, or null when it holds no usable positive fee. */
export function frozenEntryFeeCents(
  entry: Pick<StoredEntryJunior, 'entry_fee'> | undefined
): number | null {
  const raw = entry?.entry_fee;
  if (raw == null) return null;
  const dollars = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,]/g, ''));
  // A zero fee is a waived or money-neutral row (a move-up destination), which
  // cannot be a payable line; price it from the tiers rather than charge nothing.
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
}

/**
 * Whether the junior fee applies to this line, before the show's tier is checked.
 * A new line: the exhibitor's declaration. A Finish Payment line: whatever the
 * entry already recorded (an exhibitor declaration at creation or a secretary's
 * desk override), and only when that entry is this line's own dog and class, so a
 * client cannot point a line at someone else's junior entry to borrow the price.
 */
export function cartItemJuniorFlag(
  item: CartItemForPricing,
  stored: ReadonlyMap<string, StoredEntryJunior>
): boolean {
  if (!item.entry_id) return item.junior_fee_declared === true;
  const entry = stored.get(item.entry_id);
  if (!entry) return false;
  if (entry.dog_id !== item.dog_id || entry.class_id !== item.class_id) return false;
  return storedEntryJuniorFlag(entry);
}

/**
 * Whether an EXISTING entry was charged the junior fee: the exhibitor declared it
 * at online checkout (MYK9-879) or a secretary charged it at the desk (MYK9-878).
 * The payment link prices an existing entry from this, not from its cart.
 */
export function storedEntryJuniorFlag(
  entry: Pick<StoredEntryJunior, 'junior_fee_declared' | 'junior_fee_override_by'>
): boolean {
  return entry.junior_fee_declared === true || entry.junior_fee_override_by != null;
}

/**
 * Authoritative cents for an EXISTING entry (the secretary payment link). The fee
 * was FROZEN when the entry was created, so the entry's own `entry_fee` is the
 * amount: a later change to the show's fees or junior tier never re-prices it.
 * Only an entry with no usable stored fee falls back to the tiers.
 */
export function priceExistingEntryCents(
  show: PricingShow,
  entry: Pick<StoredEntryJunior, 'junior_fee_declared' | 'junior_fee_override_by' | 'entry_fee'>,
  classEntryFee: number | string | null,
  nowIso: string
): number {
  return (
    frozenEntryFeeCents(entry) ??
    authoritativeEntryFeeCents({
      showPreEntryFee: show.pre_entry_fee,
      showDayOfShowFee: show.day_of_show_fee,
      showStartDate: show.start_date,
      classEntryFee,
      showJuniorHandlerFee: show.junior_handler_fee,
      showOrganization: show.organization,
      juniorDeclared: storedEntryJuniorFlag(entry),
      nowIso,
    })
  );
}

/** Authoritative cents for every line, keyed by cart item id. */
export function priceCartItems(
  show: PricingShow,
  items: readonly CartItemForPricing[],
  stored: ReadonlyMap<string, StoredEntryJunior>,
  nowIso: string
): Map<string, number> {
  const priced = new Map<string, number>();
  for (const item of items) {
    // A line that settles an existing entry charges that entry's frozen fee.
    const frozen = item.entry_id ? stored.get(item.entry_id) : undefined;
    const frozenCents =
      frozen && frozen.dog_id === item.dog_id && frozen.class_id === item.class_id
        ? frozenEntryFeeCents(frozen)
        : null;
    if (frozenCents !== null) {
      priced.set(item.id, frozenCents);
      continue;
    }
    priced.set(
      item.id,
      authoritativeEntryFeeCents({
        showPreEntryFee: show.pre_entry_fee,
        showDayOfShowFee: show.day_of_show_fee,
        showStartDate: show.start_date,
        classEntryFee: item.class_entry_fee,
        showJuniorHandlerFee: show.junior_handler_fee,
        showOrganization: show.organization,
        juniorDeclared: cartItemJuniorFlag(item, stored),
        nowIso,
      })
    );
  }
  return priced;
}

/**
 * The lines whose stored `entry_fee_cents` is not the authoritative price. The
 * column is client-writable, so a line that disagrees is healed to the authoritative
 * value and the exhibitor is asked to review, never silently charged.
 */
export function findDriftedCartItems<T extends { id: string; entry_fee_cents: number }>(
  items: readonly T[],
  authoritativeByItem: ReadonlyMap<string, number>
): { item: T; authoritativeCents: number }[] {
  return items
    .map(item => ({ item, authoritativeCents: authoritativeByItem.get(item.id) ?? 0 }))
    .filter(x => x.item.entry_fee_cents !== x.authoritativeCents);
}

interface StoredEntryRow extends StoredEntryJunior {
  id: string;
}

/** The slice of a supabase-js client this module needs, so tests can fake it. */
export interface StoredEntryJuniorClient {
  from(table: 'entries'): {
    select(columns: string): {
      in(
        column: 'id',
        values: string[]
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

/**
 * Reads the stored junior record of every entry a Finish Payment line points at.
 * Run with the service-role client (junior_fee_override_by has no API column
 * grant). A read error is returned, not swallowed: the caller must fail closed,
 * because pricing without the record would charge the normal fee for an entry
 * that was fixed at the junior fee.
 */
export async function loadStoredEntryJunior(
  client: StoredEntryJuniorClient,
  items: readonly CartItemForPricing[]
): Promise<{ stored: Map<string, StoredEntryJunior>; error: { message: string } | null }> {
  const entryIds = [...new Set(items.map(i => i.entry_id).filter((id): id is string => !!id))];
  const stored = new Map<string, StoredEntryJunior>();
  if (entryIds.length === 0) return { stored, error: null };

  const { data, error } = await client
    .from('entries')
    .select('id, dog_id, class_id, entry_fee, junior_fee_declared, junior_fee_override_by')
    .in('id', entryIds);
  if (error) return { stored, error };
  for (const row of (data ?? []) as StoredEntryRow[]) {
    stored.set(row.id, {
      dog_id: row.dog_id,
      class_id: row.class_id,
      junior_fee_declared: row.junior_fee_declared,
      junior_fee_override_by: row.junior_fee_override_by,
      entry_fee: row.entry_fee,
    });
  }
  return { stored, error: null };
}
