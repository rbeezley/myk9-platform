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
      // MYK9-570: `clearHandlerId` is TRUE on every rename, not just the
      // secretary's. This dialog only ever edits the handler as free TEXT — it
      // offers no person picker, hence `handlerId: null` — so after a rename the
      // stored `handler_id` points at whoever used to hold the name. Keeping it
      // made the catalog and the AKC entry form read one person's date of birth
      // and registry-issued junior number and print them under another person's
      // name. Nothing else on an entry is keyed to `handler_id`, so clearing it
      // costs a re-resolution the app does not currently do anyway.
      //
      // This is only half the guard, and deliberately so. The RPC's OFFICIAL
      // branch honours the flag; its EXHIBITOR branch does
      // `handler_id = COALESCE(p_handler_id, v_existing_handler_id)` and ignores
      // it entirely, so an exhibitor's rename still leaves the old id behind
      // until that function is changed. The read side therefore refuses to
      // derive junior status at all unless the person behind `handler_id` is
      // the person whose name is printed — see `handlerNameMatchesPerson`.
      const { error } = await updateEntryHandler({
        entryId: classEntry.id,
        handler: editedHandler,
        handlerId: null,
        clearHandlerId: true,
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
