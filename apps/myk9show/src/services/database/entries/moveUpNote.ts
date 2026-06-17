/**
 * Move-up note — single source of truth for the
 * `"Moved up from class <classId>[: reason]"` string written onto a new
 * entry's `special_requests` when a dog is moved up to a higher class.
 *
 * This string is BOTH produced (by the day-of move-up write paths) and
 * meant to be parsed back (to display "moved up from" provenance). Authoring
 * the template in more than one place creates silent-drift risk: a producer
 * tweak (class name instead of id, dropping the literal "class ") would
 * break any regex consumer with no compile-time link. Keep the builder, the
 * parser, and the pattern co-located here so a change to one forces the others.
 *
 * Producers: services/database/day-of-operations/move-up.ts,
 *            features/show-map/showMapActionMutations.ts
 */

/**
 * Matches the move-up note and captures the source class id.
 * `[^\s:]+` stops at the first space or colon, so the id is captured cleanly
 * whether or not a `": reason"` suffix follows.
 */
export const MOVED_UP_FROM_PATTERN = /Moved up from class ([^\s:]+)/;

/**
 * Build the note written onto the new entry's `special_requests`.
 *
 * `sourceClassId` is intentionally nullable: the entry row's class id can type
 * as `string | null | undefined` at the call sites, and this matches the prior
 * inline template's coercion behavior exactly (a missing id stringifies rather
 * than throwing). In practice a fetched entry always has a class id.
 */
export function buildMovedUpFromNote(
  sourceClassId: string | null | undefined,
  reason?: string | null
): string {
  return `Moved up from class ${sourceClassId}${reason ? ': ' + reason : ''}`;
}

/**
 * Parse the source class id back out of a move-up note.
 * Returns `null` for empty input or a note that isn't a move-up note.
 */
export function parseMovedUpFromClassId(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(MOVED_UP_FROM_PATTERN);
  return match ? match[1] : null;
}
