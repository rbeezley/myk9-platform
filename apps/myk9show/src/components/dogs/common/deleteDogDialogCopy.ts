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
 * Replaces the generic "This action cannot be undone." The dog soft-delete is
 * reversible by an admin, and entries cascade-deleted with it are restorable
 * too — both from Admin → Data Lifecycle.
 */
export function buildRestoreNote(activeEntryCount?: number): string {
  const what =
    !activeEntryCount || activeEntryCount <= 0 ? 'The dog' : 'The dog and its entries';
  return `${what} can be restored by an administrator from Admin → Data Lifecycle.`;
}
