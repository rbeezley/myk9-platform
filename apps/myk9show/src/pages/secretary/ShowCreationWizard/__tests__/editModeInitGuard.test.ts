/**
 * The "don't re-initialize over unsaved work" guard has to be scoped to ONE
 * show, and getting that wrong is worse than not having it.
 *
 * The first version compared only "have we initialized at all?" against
 * `isDirty`, so navigating from a dirty show A to show B's edit URL kept A's
 * draft mounted while `saveShow` wrote to B's id — reconstructing the exact
 * cross-show overwrite the edit-mode gate was added to prevent.
 *
 * This pins the decision itself. The rule: suppress a refresh only when the
 * already-initialized target is the SAME show and mode.
 */
import { describe, it, expect } from 'vitest';
import { shouldSkipInitialization } from '../useEditModeInitialization';

describe('edit-mode initialization guard', () => {
  it('skips an identical re-run', () => {
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-a:add-classes:3',
        nextKey: 'show-a:add-classes:3',
        showId: 'show-a',
        mode: 'add-classes',
        isDirty: false,
      })
    ).toBe(true);
  });

  it('lets late-replicating classes refresh a clean draft for the same show', () => {
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-a:add-classes:3',
        nextKey: 'show-a:add-classes:5',
        showId: 'show-a',
        mode: 'add-classes',
        isDirty: false,
      })
    ).toBe(false);
  });

  it('protects unsaved edits from late data for the SAME show', () => {
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-a:add-classes:3',
        nextKey: 'show-a:add-classes:5',
        showId: 'show-a',
        mode: 'add-classes',
        isDirty: true,
      })
    ).toBe(true);
  });

  it('ALWAYS re-initializes when the target show changes, even while dirty', () => {
    // The one that matters. Skipping here would render show A's draft under
    // show B's id, and the save writes to B.
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-a:add-classes:3',
        nextKey: 'show-b:add-classes:0',
        showId: 'show-b',
        mode: 'add-classes',
        isDirty: true,
      })
    ).toBe(false);
  });

  it('re-initializes when the MODE changes on the same show while dirty', () => {
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-a:add-classes:3',
        nextKey: 'show-a:add-trials',
        showId: 'show-a',
        mode: 'add-trials',
        isDirty: true,
      })
    ).toBe(false);
  });

  it('does not confuse a show whose id is a prefix of another', () => {
    // 'show-a' must not match 'show-ab'.
    expect(
      shouldSkipInitialization({
        initializedKey: 'show-ab:add-classes:2',
        nextKey: 'show-a:add-classes:2',
        showId: 'show-a',
        mode: 'add-classes',
        isDirty: true,
      })
    ).toBe(false);
  });

  it('initializes for the first time regardless of dirtiness', () => {
    expect(
      shouldSkipInitialization({
        initializedKey: null,
        nextKey: 'show-a:add-trials',
        showId: 'show-a',
        mode: 'add-trials',
        isDirty: true,
      })
    ).toBe(false);
  });
});
