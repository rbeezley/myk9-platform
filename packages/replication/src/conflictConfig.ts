/**
 * Module-level Phase 4 conflict-surfacing switch.
 *
 * Extracted to its own module so both the download path (syncReplicatedTable)
 * and the upload path (ReplicatedTable.queueMutation / MutationManager) can
 * read the same flag without creating circular imports.
 *
 * Call configureConflictSurfacing(true) once at app boot. Individual
 * syncReplicatedTable call-sites can still override via the per-call option.
 */

let _conflictSurfacingEnabled = false;

export function configureConflictSurfacing(enabled: boolean): void {
  _conflictSurfacingEnabled = enabled;
}

export function isConflictSurfacingEnabled(): boolean {
  return _conflictSurfacingEnabled;
}

/** Reset to default (false). For test cleanup only. */
export function _resetConflictSurfacingForTests(): void {
  _conflictSurfacingEnabled = false;
}
