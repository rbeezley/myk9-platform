/**
 * How a finishing sync asks the cache to settle a scope's account stamp
 * (MYK9-1133, MYK9-1148). The decision is made INSIDE the metadata write, against
 * the stamp stored at that moment, so a snapshot read earlier can never undo
 * another account's newer stamp.
 */
export interface ScopeStampDirective {
  /** The account whose rows the sync wrote. */
  syncingAuthUserId: string;
  /** This account finished a whole download of the scope. */
  whole: boolean;
  /**
   * The ids this sync handed to the bulk write. Whether `syncingAuthUserId` still
   * owns any of them is read inside the metadata transaction (MYK9-1149).
   */
  writtenIds: readonly string[];
}

export interface ResolvedScopeStamp {
  /** string stamps the scope, null clears the stamp, undefined keeps the stored one. */
  stamp: string | null | undefined;
  /** The scope must read as downloaded-by-someone (so never-synced is ruled out). */
  recordMarker: boolean;
  /**
   * The sync kept another account's stamp without having written its rows, so its
   * cursor and coverage describe a download that account cannot use: they must not
   * replace the stamp holder's own (its next incremental would skip updates).
   */
  freezeCursor: boolean;
}

/**
 * - whole: stamp the syncing account.
 * - not whole, stored stamp is the syncing account's: keep it (its rows are its own).
 * - not whole, rows written and the stored stamp is another's or absent: clear it
 *   and leave a marker, so the scope is foreign, not never-synced, for everyone else.
 * - nothing written (no id handed over is still the syncing account's): leave the stored stamp alone.
 */
export async function resolveScopeStamp(
  option: string | null | ScopeStampDirective | undefined,
  stored: string | undefined,
  wroteRows: () => Promise<boolean>
): Promise<ResolvedScopeStamp> {
  if (option === undefined || option === null || typeof option === 'string') {
    return { stamp: option, recordMarker: false, freezeCursor: false };
  }
  if (option.whole)
    return { stamp: option.syncingAuthUserId, recordMarker: false, freezeCursor: false };
  if (stored === option.syncingAuthUserId) {
    return { stamp: undefined, recordMarker: false, freezeCursor: false };
  }
  if (!(await wroteRows())) {
    return { stamp: undefined, recordMarker: false, freezeCursor: true };
  }
  return { stamp: null, recordMarker: true, freezeCursor: false };
}
