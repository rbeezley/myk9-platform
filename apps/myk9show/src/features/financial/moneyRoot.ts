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

/**
 * Why a row's money cannot be accounted for.
 *
 * The first three are a LIVE entry that cannot reach its root.
 * `orphaned-supersession` is the mirror image: a superseded (`moved`) row that
 * no live entry claims, so excluding it from the count would drop its money
 * with nothing to attribute it to.
 *
 * No such row exists on the live database — the one historical pair, written by
 * the pre-MYK9-639 code as a `waived` $0 destination with no FK, was
 * soft-deleted on 2026-09-17 and every financial read filters `deleted_at`. The
 * arm is here for the shape, not for a known example: a hand-edited row, a
 * partial restore, or a source removed after its destination was created all
 * produce it.
 */
export type MoneyRootProblem = 'missing-link' | 'cycle' | 'too-deep' | 'orphaned-supersession';

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

  const claimedRootIds = new Set<string>();

  const claimChainIds = (entry: T) => {
    let current = entry;
    const seen = new Set<string>();

    for (let hop = 0; hop < MONEY_ROOT_MAX_DEPTH; hop += 1) {
      if (seen.has(current.id)) return;
      seen.add(current.id);
      claimedRootIds.add(current.id);

      const parentId = current.movedFromEntryId;
      if (!parentId) return;
      const parent = byId.get(parentId);
      if (!parent) return;
      current = parent;
    }
  };

  for (const entry of entries) {
    if (isSupersededMoveUpEntry(entry)) continue;
    live.push(entry);

    const resolution = resolveMoneyRoot(entry, byId);
    rootById.set(entry.id, resolution.root);
    // Claim every row traversed by the live descendant. A two-hop chain has
    // two superseded rows, and claiming only the root falsely reports the
    // intermediate row as orphaned.
    claimChainIds(entry);
    if (resolution.problem) {
      unresolved.push({
        entryId: entry.id,
        problem: resolution.problem,
        ...(resolution.brokenAt !== undefined ? { brokenAt: resolution.brokenAt } : {}),
      });
    }
  }

  // A superseded row nobody claims. Dropping it from the count is right — the
  // dog ran once — but dropping its MONEY is not, and silence here is exactly
  // the "silently $0" this module exists to prevent.
  for (const entry of entries) {
    if (!isSupersededMoveUpEntry(entry)) continue;
    if (claimedRootIds.has(entry.id)) continue;
    unresolved.push({ entryId: entry.id, problem: 'orphaned-supersession' });
  }

  return { live, rootById, unresolved };
}

/** Stamped onto every row whose money has been resolved (see {@link withResolvedMoneyRoots}). */
export interface ResolvedMoneyRoot {
  /** The entry this row's fee and payment were read from — itself, usually. */
  moneyRootEntryId: string;
  /**
   * True when the chain could not be followed, so the money shown is this
   * row's own and is probably wrong. A surface that renders money MUST say so.
   */
  moneyRootUnresolved: boolean;
}

/**
 * Resolve every row's money ONCE, at the mapper, and stamp the answer onto the
 * row (MYK9-639, round 3).
 *
 * The round-2 shape resolved the root inside each AGGREGATION, which left every
 * per-entry predicate — the attention classifier, the refund gate, the
 * request-payment gate, the badges — reading the raw row. On a moved-up dog
 * that raw row is money-neutral by construction, so the secretary was told a
 * paid exhibitor owed money ("Payment due", in red, on a card whose own total
 * said paid in full) and the refund the exhibitor was entitled to had no
 * reachable control at all. Patching the four call sites would have left the
 * fifth; this resolves once so that nothing downstream has to remember.
 *
 * `merge` names the money fields explicitly rather than spreading the root:
 * the row keeps its OWN identity — its id, its class, its dog, its lifecycle
 * status, the run it represents — and takes only what the root is authoritative
 * for. A row that IS its own root is returned untouched apart from the stamp.
 */
export function withResolvedMoneyRoots<T extends MoneyRootLink & { entryStatus?: string | null }>(
  entries: readonly T[],
  merge: (entry: T, root: T) => T
): Array<T & ResolvedMoneyRoot> {
  const byId = indexEntriesById(entries);

  return entries.map(entry => {
    const { root, problem } = resolveMoneyRoot(entry, byId);
    const rooted = root.id === entry.id ? entry : merge(entry, root);
    return {
      ...rooted,
      moneyRootEntryId: root.id,
      moneyRootUnresolved: problem !== undefined,
    };
  });
}
