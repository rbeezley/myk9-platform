// Copy for the delete-dog confirmation dialog. Kept in a sibling module so the
// component file only exports components (react-refresh) and the pure builders
// can be unit-tested directly.

// Subtitle shown under the dialog title.
export const deleteDogSubtitle = 'This marks the dog as deleted and hides it from normal view.';

const entryNoun = (count: number): string => (count === 1 ? 'entry' : 'entries');

/**
 * The server refuses (MK002) when a dog has live entries that are paid or
 * scored: deleting them would drop a paid entry with no refund decision, and
 * would recompute placements behind a scored one. The dialog says so up front
 * rather than letting the user click Delete into an error.
 */
export function buildBlockedText(
  blockingEntryCount: number | undefined,
  canForceDelete = false
): string | null {
  if (!blockingEntryCount || blockingEntryCount <= 0) return null;
  const pronoun = blockingEntryCount === 1 ? 'it' : 'them';
  // MYK9-600: name the escalation that exists. A secretary whose blocking entry
  // is SCORED cannot scratch or refund it — "scratch or refund them" was the
  // whole of their next step, and for them it was not available. A site admin
  // can delete the dog outright, so point at that rather than leave a dead end.
  //
  // Not shown to someone who already holds the override: the checkbox that does
  // it renders directly below this sentence, and telling a site admin to ask a
  // site admin reads as the app not knowing who it is talking to.
  const escalation = canForceDelete ? '' : ', or ask a site admin to delete the dog';
  return `This dog has ${blockingEntryCount} paid or scored ${entryNoun(blockingEntryCount)}. Scratch or refund ${pronoun} before deleting${escalation}.`;
}

/**
 * Inline suffix after the dog name in "You are about to delete <b>Dog</b>…".
 * Surfaces the cascade impact (entries removed with the dog, per migration
 * 20260616130000) right where the user confirms. Empty when there are no
 * entries or the count is still loading.
 */
export function buildImpactSuffix(activeEntryCount?: number): string {
  if (!activeEntryCount || activeEntryCount <= 0) return '';
  return ` and ${activeEntryCount} ${entryNoun(activeEntryCount)}`;
}

/**
 * The warning line under the primary sentence.
 *
 * The restore UI (`/admin/deleted-items`) is admin-only, so only an admin can
 * actually undo this delete. Non-admins (e.g. an exhibitor deleting their own
 * dog) genuinely can't reverse it themselves, so they get the honest "cannot be
 * undone." Admins get the restore note, naming entries too when they cascade.
 */
export function buildWarningText(
  activeEntryCount: number | undefined,
  canRestore: boolean,
  blockingEntryCount?: number,
  canForceDelete = false
): string {
  const blocked = buildBlockedText(blockingEntryCount, canForceDelete);
  if (blocked) return blocked;
  if (!canRestore) return 'This action cannot be undone.';
  const what = !activeEntryCount || activeEntryCount <= 0 ? 'The dog' : 'The dog and its entries';
  return `${what} can be restored by an administrator from Admin → Deleted Items.`;
}

/**
 * The two "we do not know yet" lines (MYK9-600).
 *
 * Both sit where `buildBlockedText` would, and both accompany a disabled
 * Delete. They are deliberately not softened into "loading…": the reason the
 * button is unpressable is a fact about this dog's money and results, and the
 * user is entitled to read it rather than infer it from a spinner.
 */
export const blockingCountPendingText = 'Checking whether this dog has paid or scored entries…';

export const blockingCountErrorText =
  'We could not check whether this dog has paid or scored entries. Deleting now could strand a paid entry, so try again before deleting.';
