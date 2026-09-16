/**
 * MYK9-561: the client half of the `update_own_entry_jump_height` contract.
 *
 * Lives in its own module — like `withdrawEligibility.ts` — so neither
 * `writes.ts` nor `ReplicatedEntriesTable.ts` grows to carry it, and so the RPC
 * NAME has exactly one definition on the client.
 *
 * WHY AN RPC AT ALL. `entries` has one UPDATE policy, `entries_update`, whose
 * USING and WITH CHECK are both `can_manage_show(show_id)`. An exhibitor's
 * direct `UPDATE entries SET jump_height = …` matches zero rows, and
 * `updateEntryDetails` turned that empty result into PGRST116 — the "Failed to
 * update jump height" the Edit Entry dialog reported. The owner tier therefore
 * goes through the SECURITY DEFINER RPC
 * (`supabase/migrations/20260916194700_update_own_entry_jump_height_rpc.sql`),
 * which also admits show managers by restating `entries_update`, so the ONE
 * dialog shared by the exhibitor (`MyEntriesDialogs`) and the secretary
 * (`EntryManagementPage`) needs no role branch. That mirrors
 * `update_entry_handler_for_entry_management`, which the very same Save Changes
 * handler already calls for the handler field.
 */
export const UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC = 'update_own_entry_jump_height';

/** Someone else changed the row while this save was in flight. */
export class JumpHeightConflictError extends Error {
  readonly code = 'conflict';

  constructor() {
    super('Someone else changed this entry — reopen it and try again.');
    this.name = 'JumpHeightConflictError';
  }
}

/** The entry could not be found at all — deleted, or never existed. */
export class JumpHeightNotFoundError extends Error {
  readonly code = 'missing';

  constructor() {
    super('This entry no longer exists — refresh the page and try again.');
    this.name = 'JumpHeightNotFoundError';
  }
}

/** The request never reached Postgres. */
export class JumpHeightUnavailableError extends Error {
  readonly code = 'unavailable';

  constructor() {
    super("We couldn't reach the server — try saving again when you're connected.");
    this.name = 'JumpHeightUnavailableError';
  }
}

/**
 * Turn a save failure into a sentence an exhibitor can act on.
 *
 * Server refusals arrive as raw Postgres text carrying the row UUID ("Entry
 * 22eb47a9-… is checked in at the show; ask the secretary to change it") — right
 * for the log, wrong for the dialog. Switch on the CODE, exactly as
 * `withdrawErrorMessage` does for the withdrawal seam.
 */
const SERVER_MESSAGES: Record<string, string> = {
  // Every owner-tier guard in the RPC: removed, not-editable status, scored,
  // checked in, entries closed. The dialog already refuses to open for edit
  // after close, so reaching one of these means the row changed underneath.
  '42501': 'This jump height can no longer be changed — ask the secretary to change it.',
  // invalid_parameter_value: a blank or over-long height. Not the exhibitor's
  // doing — the picker only offers valid values.
  '22023': "Something went wrong saving this jump height — we've logged it.",
  P0002: 'This entry no longer exists — refresh the page and try again.',
  '40001': 'Someone else changed this entry — reopen it and try again.',
};

const OWN_CODES = new Set<string>(['conflict', 'missing', 'unavailable']);

export function jumpHeightErrorMessage(
  error: { code?: string | undefined; message?: string | undefined } | null | undefined
): string {
  const code = error?.code;
  // Our own errors already carry a written sentence — pass it through.
  if (code && OWN_CODES.has(code) && error?.message) return error.message;
  if (code && SERVER_MESSAGES[code]) return SERVER_MESSAGES[code] as string;
  return "We couldn't update the jump height. Please try again.";
}
