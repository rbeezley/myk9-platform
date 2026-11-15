import { describe, expect, it } from 'vitest';
import { isClassCompleted, shouldOfferMarkComplete } from './markClassComplete';

const open = { classStatus: 'in_progress', isScoringFinalized: false };
const allScored = { pending: 0, completed: 12 };

describe('shouldOfferMarkComplete (MYK9-2013)', () => {
  it('offers once every dog has a result and the class did not complete by itself', () => {
    expect(
      shouldOfferMarkComplete({ canManage: true, statusCounts: allScored, classes: [open] })
    ).toBe(true);
  });

  it('does not offer while a dog is still to run', () => {
    expect(
      shouldOfferMarkComplete({
        canManage: true,
        statusCounts: { pending: 1, completed: 11 },
        classes: [open],
      })
    ).toBe(false);
  });

  it('does not offer for a class with no results at all', () => {
    expect(
      shouldOfferMarkComplete({
        canManage: true,
        statusCounts: { pending: 0, completed: 0 },
        classes: [open],
      })
    ).toBe(false);
  });

  it.each([
    ['the server finalized it', { classStatus: 'in_progress', isScoringFinalized: true }],
    ['it is already completed', { classStatus: 'completed', isScoringFinalized: false }],
    ['it is completed in another case', { classStatus: 'Completed', isScoringFinalized: false }],
  ])('does not offer when %s', (_label, cls) => {
    expect(
      shouldOfferMarkComplete({ canManage: true, statusCounts: allScored, classes: [cls] })
    ).toBe(false);
  });

  it('does not offer to someone who may not change the class status', () => {
    expect(
      shouldOfferMarkComplete({ canManage: false, statusCounts: allScored, classes: [open] })
    ).toBe(false);
  });

  it('waits for the class replica, and never offers on a cancelled class', () => {
    expect(
      shouldOfferMarkComplete({ canManage: true, statusCounts: allScored, classes: [null] })
    ).toBe(false);
    expect(
      shouldOfferMarkComplete({
        canManage: true,
        statusCounts: allScored,
        classes: [{ classStatus: 'cancelled', isScoringFinalized: false }],
      })
    ).toBe(false);
  });

  it('offers on a combined list while either section is still open', () => {
    const done = { classStatus: 'completed', isScoringFinalized: true };
    expect(
      shouldOfferMarkComplete({ canManage: true, statusCounts: allScored, classes: [done, open] })
    ).toBe(true);
    expect(
      shouldOfferMarkComplete({ canManage: true, statusCounts: allScored, classes: [done, done] })
    ).toBe(false);
  });

  it('reads completion from the server flag or the stored status', () => {
    expect(isClassCompleted(open)).toBe(false);
    expect(isClassCompleted({ classStatus: 'completed' })).toBe(true);
    expect(isClassCompleted({ classStatus: 'in_progress', isScoringFinalized: true })).toBe(true);
  });
});
