/**
 * Results privacy (MYK9-969) — the app-side words for what the server decides.
 *
 * The database is the only judge of privacy. An entry's results are public
 * only when the show is not private and every person tied to the entry (the
 * dog's owner and co-owner, the entry's handler) has turned on "Show my
 * results publicly". For anyone else than show staff or those people:
 *
 *   - `view_authenticated_entry_results` keeps the row (the run order is not a
 *     result) but NULLs every result column and sets `results_private`;
 *   - `view_public_entry_results` keeps the row at its place in the standings
 *     but anonymises it: dog name "Private entry", no dog id, handler, armband,
 *     time or score.
 *
 * Nothing here hides anything; it only names what the server already hid, so
 * a masked row reads "Results private" rather than "Pending" or "Not Set".
 */

/**
 * The dog name the public results view returns for an anonymised entry.
 * Must equal the SQL literal in `view_public_entry_results`
 * (migration 20261004152300) — the explicit public selects do not carry
 * `results_private`, so the label is how they recognise the row.
 */
export const PRIVATE_ENTRY_LABEL = 'Private entry';

/** What a viewer sees in place of a result the owner keeps private. */
export const RESULTS_PRIVATE_LABEL = 'Results private';

interface PrivacyMarkedRow {
  results_private?: unknown;
  dog_id?: unknown;
  dog_call_name?: unknown;
  dog_name?: unknown;
}

/**
 * True when the server masked this row's results for the current viewer.
 * Reads `results_private` when the select carried it; otherwise recognises the
 * public view's anonymised shape (no dog id, the "Private entry" name).
 */
export function isPrivateResultRow(row: PrivacyMarkedRow): boolean {
  if (row.results_private === true) return true;
  if (row.results_private === false) return false;
  return (
    row.dog_id == null &&
    (row.dog_call_name === PRIVATE_ENTRY_LABEL || row.dog_name === PRIVATE_ENTRY_LABEL)
  );
}
