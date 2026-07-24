/**
 * STALE FILE — delete me.
 *
 * This test covered AddTrainingEntryDialog/EditTrainingEntryDialog, which
 * were deleted as unmounted dead code (no importers; EnhancedTrainingJournal
 * owns the live add/edit dialog). The file is untracked and awaits manual
 * `rm` (agent sandbox cannot delete files). Overwritten with a no-op so the
 * suite and typecheck stay green until then.
 */
import { describe, expect, it } from 'vitest';

describe('TrainingEntryDialogs (deleted orphans)', () => {
  it('is a placeholder pending manual deletion of this file', () => {
    expect(true).toBe(true);
  });
});
