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
 * PRODUCER: `public.move_up_entry` (migration 20260918193300) writes this note
 * onto the DESTINATION entry it creates. The SOURCE's `special_requests` is no
 * longer touched at all — the `moved_from_entry_id` FK is the lineage, and that
 * column is where a secretary writes "reactive dog, needs the ramp".
 *
 * CONSUMER: `resolveMoveUpReversal`, which parses it only to RECOGNISE a legacy
 * pair recorded before the FK existed (zero such rows live today) so the dialog
 * can explain itself rather than offer a control the server would refuse.
 */

/**
 * Matches the move-up note and captures the source class id.
 * `[^\s:]+` stops at the first space or colon, so the id is captured cleanly
 * whether or not a `": reason"` suffix follows.
 */
export const MOVED_UP_FROM_PATTERN = /Moved up from class ([^\s:]+)/;

/**
 * Build the note. Kept in TypeScript beside the parser even though the SQL
 * function is now the only producer: the two must agree, and a template
 * authored in only one language drifts the first time either is reworded. The
 * SQL is pinned against this shape by `movedFromEntryIdViewProjection.test.ts`.
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
