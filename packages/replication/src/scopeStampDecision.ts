/**
 * What a completed sync does to a scope's account stamp (MYK9-1133). One pure
 * decision, so the conditions that stamp, clear or leave it cannot drift apart
 * inside the engine.
 *
 * - `keep`: the sync does not stamp (no opt-in); the stamp is left as it is.
 * - `stamp`: write the syncing account.
 * - `clear`: remove the stamp, so the scope reads cold (foreign) until a sync
 *   that can vouch for it.
 */
export type ScopeStampDecision = 'stamp' | 'clear' | 'keep';

export interface ScopeStampInputs {
  /** The sync opted into account stamping. */
  stamping: boolean;
  /** The same non-null account was signed in at both ends of the sync. */
  identityHeld: boolean;
  /** The scope held rows this account had not stamped before this sync. */
  holdsOthersRows: boolean;
  /** A stale-row cleanup completed, by the adapter's policy or the account-change purge. */
  cleanupCompleted: boolean;
  /** The fetch is known to be the whole scope. */
  fetchComplete: boolean;
  /**
   * A row is still in the scope that this download did not return and no unsent
   * work of the current account explains (another account's dirty edit, or a
   * queue that could not be read).
   */
  foreignWorkRemaining: boolean;
}

export function decideScopeStamp(inputs: ScopeStampInputs): ScopeStampDecision {
  if (!inputs.stamping) return 'keep';
  if (!inputs.identityHeld) return 'clear';
  if (inputs.foreignWorkRemaining) return 'clear';
  const othersRowsGone = inputs.cleanupCompleted && inputs.fetchComplete;
  if (inputs.holdsOthersRows && !othersRowsGone) return 'clear';
  return 'stamp';
}

/** The table methods {@link hasForeignUnsentWork} reads. */
interface UnsentWorkTable {
  getReplicatedRow(id: string): Promise<{ isDirty: boolean; data: unknown } | null>;
  getUnsentMutationIdsForRow(id: string): Promise<string[]>;
}

/**
 * Is a row in `localRows` unsent local work (dirty, or created here and never
 * uploaded) that this download did not return and that the CURRENT account has
 * no unsent mutation for? Such a row is another account's, kept by cleanup
 * because it is unsent, but never to be handed to this account. The queue read
 * is owner-scoped, so another account's mutations are not named. A queue that
 * cannot be read is never a pass.
 */
export async function hasForeignUnsentWork(
  table: UnsentWorkTable,
  localRows: readonly { id: string }[],
  serverIds: ReadonlySet<string>
): Promise<boolean> {
  for (const local of localRows) {
    const id = String(local.id);
    if (serverIds.has(id)) continue;
    const stored = await table.getReplicatedRow(id);
    const localOnly = (stored?.data as { _localOnly?: unknown } | null)?._localOnly === true;
    if (!stored || !(stored.isDirty || localOnly)) continue;
    try {
      if ((await table.getUnsentMutationIdsForRow(id)).length === 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}
