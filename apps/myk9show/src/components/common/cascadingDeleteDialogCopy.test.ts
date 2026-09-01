import { describe, it, expect } from 'vitest';
import {
  buildCascadingDeleteBody,
  buildCascadingDeleteHeading,
} from './cascadingDeleteDialogCopy';

/**
 * MYK9-285: the dialog claimed permanent, irreversible deletion regardless of
 * what it was about to do. Walking it against staging, deleting a show soft-
 * deleted the show, its trial and both classes — every row took a `deleted_at`
 * stamp and none were removed — while the dialog said "This action cannot be
 * undone."
 */
describe('cascading delete copy', () => {
  describe('when the delete is permanent (site admin ticked the box)', () => {
    it('says so, and keeps the irreversibility warning', () => {
      expect(buildCascadingDeleteHeading(true)).toMatch(/permanently delete/i);
      const body = buildCascadingDeleteBody('show', 3, true);
      expect(body).toMatch(/permanently delete 3 related records/i);
      expect(body).toMatch(/cannot be undone/i);
    });
  });

  describe('when the delete is a soft delete (the default)', () => {
    it('does not claim the deletion is permanent', () => {
      expect(buildCascadingDeleteHeading(false)).not.toMatch(/permanent/i);
      expect(buildCascadingDeleteBody('show', 3, false)).not.toMatch(/permanent/i);
    });

    it('does not claim the action cannot be undone', () => {
      expect(buildCascadingDeleteBody('show', 3, false)).not.toMatch(/cannot be undone/i);
    });

    it('names who can reverse it, rather than implying the reader can', () => {
      // Restore lives at /admin/deleted-items and is admin-only, so the copy
      // must not tell a secretary they can undo it themselves.
      expect(buildCascadingDeleteBody('show', 3, false)).toMatch(
        /restored by an administrator/i
      );
    });
  });

  it('keeps the related-record count in both branches — the part that was always right', () => {
    expect(buildCascadingDeleteBody('show', 3, true)).toContain('3 related records');
    expect(buildCascadingDeleteBody('show', 3, false)).toContain('3 related records');
  });

  it('agrees with itself on one record', () => {
    expect(buildCascadingDeleteBody('show', 1, false)).toContain('1 related record');
    expect(buildCascadingDeleteBody('show', 1, false)).not.toContain('1 related records');
  });
});
