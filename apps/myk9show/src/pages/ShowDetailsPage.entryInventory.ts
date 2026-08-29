/**
 * Decides whether the show's class inventory is actually KNOWN.
 *
 * `hasEntryClassInventory` is a three-state contract — `null` means unresolved —
 * and every consumer honours it: all eight styled landings gate on `!== false`,
 * and `getEntryStatus` treats `null` as unknown. The page was the one place that
 * broke it, collapsing "I have not read the classes" into `false`:
 *
 *   effectiveTrials.length > 0 ? effectiveShowClasses.length > 0 : null
 *
 * That asserted "no classes" the moment trials were known, with no check that
 * the class read had run. On a cold anonymous landing the class read is a SECOND
 * round trip gated on the first, so the window is real and visible — the entry
 * CTA disappeared mid-load, and stayed gone for the session if the read failed.
 * On the authed surface the same false `false` produced "Classes Not Ready —
 * this show has no classes assigned yet, so entries are not available" for a
 * fully configured show.
 *
 * Known limitation, deliberately not papered over: `trialClassesLoaded` means
 * the load RAN, not that it succeeded. `ReplicatedTableQuery.getAll()` reports
 * every failure as an empty list (MYK9-252), so a silent failure still reads as
 * ready. This closes the during-load window; MYK9-252 owns the failed-read one.
 */

export interface EntryClassInventoryInput {
  /** Trials from the replicated store (warm session). */
  storeTrialCount: number;
  /** Trials actually being rendered — store rows when warm, anon rows when cold. */
  effectiveTrialCount: number;
  /** Classes actually being rendered, from whichever source applies. */
  effectiveClassCount: number;
  /** Whether the store's class load has completed a pass. */
  trialClassesLoaded: boolean;
  /** Whether the cold/anon class query has settled successfully. */
  publicClassInventoryResolved: boolean;
}

/**
 * Returns `true`/`false` only when the class list has genuinely been read, and
 * `null` whenever it has not.
 */
export function resolveEntryClassInventory({
  storeTrialCount,
  effectiveTrialCount,
  effectiveClassCount,
  trialClassesLoaded,
  publicClassInventoryResolved,
}: EntryClassInventoryInput): boolean | null {
  // No trials known yet: nothing can be said about classes either.
  if (effectiveTrialCount === 0) return null;

  const known = storeTrialCount > 0 ? trialClassesLoaded : publicClassInventoryResolved;
  if (!known) return null;

  return effectiveClassCount > 0;
}
