// Copy for the delete-dog confirmation dialog. Kept in a sibling module so the
// component file only exports components (react-refresh) and the pure builders
// can be unit-tested directly.

// Subtitle shown under the dialog title.
export const deleteDogSubtitle =
  'This marks the dog as deleted and hides it from normal view.';

const entryNoun = (count: number): string => (count === 1 ? 'entry' : 'entries');

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
  canRestore: boolean
): string {
  if (!canRestore) return 'This action cannot be undone.';
  const what =
    !activeEntryCount || activeEntryCount <= 0 ? 'The dog' : 'The dog and its entries';
  return `${what} can be restored by an administrator from Admin → Deleted Items.`;
}
