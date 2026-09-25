/**
 * "Has this Edit Entry row left its class?" — ONE answer for the row's display
 * (`EntryEditClassRow`) and the Save Changes body (`saveEntryEdits`).
 *
 * A withdrawal (`'withdrawn'`) and a pull (`'scratched'`) are different acts
 * (MYK9-632) that both take the dog out of the class. The save guard used to
 * name only `'withdrawn'`, so a jump height edited and then Pulled in the same
 * session was written to a row the server had just scratched (MYK9-652).
 * Naming both here means a third removal state is added in one place.
 */
const REMOVED_ENTRY_EDIT_STATUSES: ReadonlySet<string> = new Set(['withdrawn', 'scratched']);

export function isRemovedEntryEditStatus(status: string | null | undefined): boolean {
  return status != null && REMOVED_ENTRY_EDIT_STATUSES.has(status);
}
