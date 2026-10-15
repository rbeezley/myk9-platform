import { describe, expect, it } from 'vitest';
import { buildEntryManagementViews } from '../entryManagementViews';

describe('buildEntryManagementViews', () => {
  const counts = {
    queueCounts: {
      'needs-review': 3,
      'missing-information': 1,
      'payment-due': 2,
      all: 6,
    },
    pulls: 4,
    moveUps: 5,
    registrationNeeded: 2,
  };

  it('surfaces the four registration-queue counts and the two exception counts already available', () => {
    const views = buildEntryManagementViews(counts);
    expect(views.map(view => [view.id, view.count])).toEqual([
      ['needs-review', 3],
      ['missing-information', 1],
      ['payment-due', 2],
      ['all', 6],
      ['waitlist', undefined],
      ['pulls', 4],
      ['move-ups', 5],
      ['registration-needed', 2],
    ]);
  });

  it('surfaces a Waitlist count when the caller has one', () => {
    const views = buildEntryManagementViews({ ...counts, waitlist: 7 });
    expect(views.find(view => view.id === 'waitlist')?.count).toBe(7);
  });

  it('omits the Waitlist count field entirely rather than showing a fake 0', () => {
    const views = buildEntryManagementViews(counts);
    const waitlistView = views.find(view => view.id === 'waitlist');
    expect(waitlistView).toBeDefined();
    expect('count' in (waitlistView ?? {})).toBe(false);
  });

  // Codex finding on MYK9-795: a failed move-up read must not present as a
  // confident zero. Same "omit the badge" convention as Waitlist above.
  it('omits the Move-ups count field when the count is unknown, rather than showing a fake 0', () => {
    const views = buildEntryManagementViews({ ...counts, moveUps: undefined });
    const moveUpsView = views.find(view => view.id === 'move-ups');
    expect(moveUpsView).toBeDefined();
    expect('count' in (moveUpsView ?? {})).toBe(false);
  });

  it('labels the held-entry view and omits its count while it is unknown, never a fake 0', () => {
    const labelled = buildEntryManagementViews(counts).find(
      view => view.id === 'registration-needed'
    );
    expect(labelled?.label).toBe('Registration number needed');
    const unknown = buildEntryManagementViews({ ...counts, registrationNeeded: undefined }).find(
      view => view.id === 'registration-needed'
    );
    expect('count' in (unknown ?? {})).toBe(false);
  });

  it('gives every view a non-empty href-free (in-page) entry, in the approved order', () => {
    const views = buildEntryManagementViews(counts);
    expect(views.map(view => view.id)).toEqual([
      'needs-review',
      'missing-information',
      'payment-due',
      'all',
      'waitlist',
      'pulls',
      'move-ups',
      'registration-needed',
    ]);
    expect(views.every(view => view.href === undefined)).toBe(true);
  });
});
