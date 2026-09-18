/**
 * Where an entry's money actually lives (MYK9-639).
 *
 * A move-up does NOT copy money. The destination entry is created
 * money-neutral — `payment_status = 'pending'`, `entry_fee = 0`, no method, no
 * reference, no comp, no discount, no Stripe intent — and carries
 * `moved_from_entry_id` pointing at the entry it supersedes. The settlement
 * stays exactly once, on the entry the exhibitor actually paid for.
 *
 * That makes the FK the one link, and this module the one way to follow it:
 *
 *   - a LIVE entry is counted once, wherever it now sits;
 *   - the dollars for that entry are read from its ROOT, once;
 *   - a superseded (`entry_status = 'moved'`) row is counted nowhere and its
 *     money is attributed to its live descendant instead.
 *
 * The previous shape — copying `payment_status`, `entry_fee`, `payment_method`
 * and the comp/discount columns onto the destination — is why this exists. It
 * tripped `trg_entries_protect_payment_fields_insert` on any Stripe-paid entry,
 * orphaned the refund from the row that held the intent, and left every
 * aggregator to decide for itself which of the two rows was real.
 *
 * Pure. No I/O, no framework, and generic over the caller's row type: the
 * Financial Report, the secretary summaries, Entry Management and the registry
 * reports each hold a different shape, and all of them need the same answer.
 */

/** The only two fields this module reads. */
export interface MoneyRootLink {
  id: string;
  /** Set on the DESTINATION of a move-up; null/undefined on every other entry. */
  movedFromEntryId?: string | null | undefined;
}

/** Why a lookup did not reach a payment-bearing root. */
export type MoneyRootProblem = 'missing-link' | 'cycle' | 'too-deep';

export interface MoneyRootResolution<T> {
  /**
   * The entry whose money to read. NEVER null: when the chain cannot be
   * followed this is the entry itself, so a broken link degrades to "the money
   * this row records" rather than silently to $0 — and `problem` is set so the
   * surface can say so out loud.
   */
  root: T;
  /** Absent on a clean resolution. Present means the figure needs a human. */
  problem?: MoneyRootProblem;
  /** The entry the chain broke at, for the message a surface shows. */
  brokenAt?: string;
}

/**
 * A move-up chain is at most a handful of hops in practice (Novice → Advanced →
 * Excellent → Master is three). The cap exists so a corrupted chain terminates
 * instead of hanging a show-day report, and is deliberately far above any real
 * ladder.
 */
export const MONEY_ROOT_MAX_DEPTH = 16;

/**
 * Follow `moved_from_entry_id` to the entry that holds the money.
 *
 * `byId` must contain every entry in the scope being summed. When a link points
 * outside it — a partial replica, a report scoped to one trial while the source
 * sits in another — the answer is `problem: 'missing-link'` and the root is the
 * entry itself. That is the case a caller must SURFACE: a moved-up entry is
 * money-neutral, so treating an unreachable root as $0 would quietly drop a real
 * payment off a reconciliation report.
 */
export function resolveMoneyRoot<T extends MoneyRootLink>(
  entry: T,
  byId: ReadonlyMap<string, T>
): MoneyRootResolution<T> {
  let current = entry;
  const seen = new Set<string>([entry.id]);

  for (let hop = 0; hop < MONEY_ROOT_MAX_DEPTH; hop += 1) {
    const parentId = current.movedFromEntryId;
    if (!parentId) return { root: current };

    if (seen.has(parentId)) {
      return { root: current, problem: 'cycle', brokenAt: parentId };
    }

    const parent = byId.get(parentId);
    if (!parent) {
      return { root: current, problem: 'missing-link', brokenAt: parentId };
    }

    seen.add(parentId);
    current = parent;
  }

  return { root: current, problem: 'too-deep', brokenAt: current.id };
}

/** Index a scope's entries for {@link resolveMoneyRoot}. */
export function indexEntriesById<T extends MoneyRootLink>(entries: readonly T[]): Map<string, T> {
  return new Map(entries.map(entry => [entry.id, entry]));
}

/**
 * The superseded half of a move-up: counted nowhere, its money attributed to the
 * live descendant that now carries the run.
 *
 * Deliberately narrow. `withdrawn` / `scratched` entries stay counted wherever
 * they were before — their money is real and still has to be reconciled.
 */
export function isSupersededMoveUpEntry(entry: { entryStatus?: string | null }): boolean {
  return entry.entryStatus?.trim().toLowerCase() === 'moved';
}

export interface MoneyAttribution<T> {
  /** The live entries to count, in input order. One row per run. */
  live: T[];
  /** `live[i]`'s money row, by the live entry's id. */
  rootById: Map<string, T>;
  /**
   * Live entries whose chain could not be followed, with the reason. Non-empty
   * means a surface must SAY so — the figures below it are incomplete.
   */
  unresolved: Array<{ entryId: string; problem: MoneyRootProblem; brokenAt?: string }>;
}

/**
 * Split a scope into "the entries to count" and "where each one's dollars are".
 *
 * This is the call every money reader makes, exactly once, so none of them can
 * drift into its own opinion about which half of a move-up pair is real.
 */
export function buildMoneyAttribution<T extends MoneyRootLink & { entryStatus?: string | null }>(
  entries: readonly T[]
): MoneyAttribution<T> {
  const byId = indexEntriesById(entries);
  const live: T[] = [];
  const rootById = new Map<string, T>();
  const unresolved: MoneyAttribution<T>['unresolved'] = [];

  for (const entry of entries) {
    if (isSupersededMoveUpEntry(entry)) continue;
    live.push(entry);

    const resolution = resolveMoneyRoot(entry, byId);
    rootById.set(entry.id, resolution.root);
    if (resolution.problem) {
      unresolved.push({
        entryId: entry.id,
        problem: resolution.problem,
        ...(resolution.brokenAt !== undefined ? { brokenAt: resolution.brokenAt } : {}),
      });
    }
  }

  return { live, rootById, unresolved };
}

/**
 * Where a money ACTION has to land (MYK9-639).
 *
 * A refund, a comp or a discount invoked on a dog who was moved up must target
 * the entry that holds the money, not the run. `stripe-refund-entry` needs the
 * `stripe_payment_intent_id`, and that stays on the root — the destination of a
 * move-up never had one, and `trg_entries_protect_payment_fields_insert` makes
 * sure it never can. A comp written on the money-neutral destination would set
 * `comped` on a $0 row and leave the real $35 collected.
 *
 * Returns `null` when the entry is not in `entries` at all; returns the entry
 * itself when its chain cannot be followed, which is the same "surface it, do
 * not silently redirect" rule the aggregations use.
 */
export function resolveMoneyActionTarget<T extends MoneyRootLink>(
  entryId: string,
  entries: readonly T[]
): T | null {
  const byId = indexEntriesById(entries);
  const entry = byId.get(entryId);
  if (!entry) return null;
  return resolveMoneyRoot(entry, byId).root;
}
