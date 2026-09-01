/**
 * Copy for the cascading-delete confirmation.
 *
 * MYK9-285: the warning used to claim permanent, irreversible deletion
 * unconditionally — "This will permanently delete all related data … This
 * action cannot be undone." — while the delete it actually performs is a SOFT
 * delete unless the site-admin-only "permanently delete" box is ticked. The
 * confirm button already distinguished the two ("Permanently Delete" vs
 * "Delete Show"); only this block did not.
 *
 * Both halves of that mismatch cost something. A secretary who mistypes a show
 * name is told the deletion is irreversible, so they hesitate over something
 * the app can undo. And anyone told their data was permanently removed has been
 * told something untrue.
 *
 * Restore lives at `/admin/deleted-items` and is admin-only, so the soft-delete
 * copy says who can reverse it rather than implying the reader can — the same
 * distinction `deleteDogDialogCopy.buildWarningText` draws.
 */

/** Heading line of the warning block. */
export function buildCascadingDeleteHeading(permanent: boolean): string {
  return permanent
    ? 'Warning: This will permanently delete all related data'
    : 'This will also remove related data';
}

/**
 * Body line. Keeps the related-record count in both branches — naming what
 * else goes is the part of this dialog that was always right.
 */
export function buildCascadingDeleteBody(
  entityType: string,
  totalToDelete: number,
  permanent: boolean
): string {
  const noun = totalToDelete === 1 ? 'related record' : 'related records';
  return permanent
    ? `Deleting this ${entityType} will also permanently delete ${totalToDelete} ${noun}. This action cannot be undone.`
    : `Deleting this ${entityType} will also remove ${totalToDelete} ${noun}. They stop appearing in the app and can be restored by an administrator from Admin → Deleted Items.`;
}
