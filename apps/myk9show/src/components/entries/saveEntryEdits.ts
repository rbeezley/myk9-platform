/**
 * The Edit Entry dialog's Save Changes body, extracted from
 * `EntryEditDialog.tsx` (MYK9-561) so that file stays under the 500-line limit
 * and so the two "did this actually change?" comparisons can be tested without
 * rendering the dialog.
 *
 * BOTH writes go through an RPC because `entries` has one UPDATE policy,
 * `entries_update`, admitting only `can_manage_show(show_id)`: the handler
 * through `update_entry_handler_for_entry_management`, the jump height through
 * `update_own_entry_jump_height` (MYK9-561). Each RPC carries its own manager
 * tier, so this is shared by the exhibitor and the secretary with no role
 * branch.
 */
import { updateEntryDetails, updateEntryHandler } from '@/services/database/entries';
import { jumpHeightErrorMessage } from '@/services/database/entries/jumpHeightErrors';

/** The subset of the dialog's `EntryClass` this needs; satisfied structurally. */
export interface SavableEntryClass {
  id: string;
  jumpHeight?: string | undefined;
  handler?: string | undefined;
}

export interface EntryClassEdits {
  handler?: string | undefined;
  /** Optional explicit person selection; free-text edits leave this undefined. */
  handlerId?: string | null | undefined;
  jumpHeight?: string | undefined;
  status?: string | undefined;
}

export interface SaveEntryEditsParams {
  classes: SavableEntryClass[];
  classEdits: Record<string, EntryClassEdits>;
  /** The card-level handler, used when a class row carries none of its own. */
  fallbackHandler?: string | undefined;
}

/**
 * Applies every changed field, row by row, and stops at the first failure.
 *
 * Returns the sentence to show, or null on success. Stopping early can leave an
 * earlier row written — hence the UNCHANGED guards below: a write that was never
 * needed must not be the one that fails.
 */
export async function saveEntryEdits(
  params: SaveEntryEditsParams
): Promise<{ error: string | null }> {
  const { classes, classEdits, fallbackHandler } = params;

  // A grouped dog card can contain multiple entry rows, and each row may need a
  // different handler.
  for (const classEntry of classes) {
    const editedHandler = classEdits[classEntry.id]?.handler;
    const originalHandler = classEntry.handler ?? fallbackHandler ?? '';
    if (editedHandler !== undefined && editedHandler !== originalHandler) {
      // MYK9-665: text corrections preserve the load-bearing handler_id link.
      //
      // Round 1 of that issue's review made it unconditional on the theory that
      // a rename should drop the now-wrong person link. Round 2 showed the
      // reasoning rested on a false premise — `entries.handler_id` is NOT
      // incidental. It is keyed by the exhibitor's own self check-in
      // (`useClassCheckInData` filters `.eq('handler_id', userId)` with no
      // owner/co-owner fallback), the at-show exhibitor queue view,
      // `entry_results_caller_context`'s "is this my entry?" predicate,
      // recoverable show access codes, the announcement push path and the
      // show-registrations read. Nulling it on a text correction would take an
      // exhibitor's own check-in page away from them.
      //
      // So the stale-link problem is solved on the READ side instead, where it
      // costs nothing: `resolveHandlerPerson` refuses to derive junior status or
      // print a registry number unless the person behind `handler_id` bears the
      // name being printed. Whether the WRITE should also re-point or clear the
      // id is a real question with real consequences. Legacy clear requests are
      // ignored by the RPC; an explicit selected handler id can re-point it.
      const { error } = await updateEntryHandler({
        entryId: classEntry.id,
        handler: editedHandler,
        handlerId: classEdits[classEntry.id]?.handlerId ?? null,
      });
      if (error) return { error: 'Failed to update handler. Please try again.' };
    }
  }

  for (const classEntry of classes) {
    const edits = classEdits[classEntry.id];
    if (!edits) continue;
    // MYK9-561: compared against the ROW's height, the way the handler loop
    // compares against `originalHandler`. Re-picking the same value still
    // writes `classEdits[id].jumpHeight`, and a handler edit alone satisfies
    // the dialog's `hasChanges()`, so without this the RPC fired for a height
    // nobody changed — and on a checked-in entry that raised 42501 AFTER the
    // handler write had committed, reporting a half-saved dialog as a failure.
    if (
      edits.jumpHeight &&
      edits.jumpHeight !== (classEntry.jumpHeight ?? '') &&
      edits.status !== 'withdrawn'
    ) {
      const { error } = await updateEntryDetails({
        entryId: classEntry.id,
        jumpHeight: edits.jumpHeight,
      });
      // Say WHY. The RPC's owner-tier refusals arrive as SQLSTATEs carrying the
      // row UUID — right for the log, wrong for a person to read.
      if (error) return { error: jumpHeightErrorMessage(error) };
    }
  }

  return { error: null };
}
