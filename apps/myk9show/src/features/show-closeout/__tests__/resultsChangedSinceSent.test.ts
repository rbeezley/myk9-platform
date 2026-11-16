import { describe, expect, it } from 'vitest';

import { buildFinishList } from '../finishList';
import { calculateWhatIsLeft } from '../whatIsLeft';

const SENT_AT = '2026-11-14T19:40:00Z';
const BEFORE = '2026-11-14T19:00:00Z';
const AFTER = '2026-11-14T20:15:00Z';

function listFor(
  latestScoreChangeByClass: ReadonlyMap<string, string> | null | undefined,
  submissions = [{ status: 'sent', organization: 'AKC', submitted_at: SENT_AT }]
) {
  const left = calculateWhatIsLeft({
    classes: [
      { id: 'c1', trialId: 't1', expectedCount: 4, scoredCount: 4 },
      { id: 'c2', trialId: 't1', expectedCount: 4, scoredCount: 4 },
    ],
    trials: [{ id: 't1', registryId: 'AKC' }],
    entries: [],
    incidents: null,
    submissions,
    latestScoreChangeByClass,
  });
  return buildFinishList('show-1', left).find(item => item.key === 'akc-results-file');
}

describe('the results file line after a score changes', () => {
  it('a change after the send flips the line and offers the send again', () => {
    const item = listFor(new Map([['c2', AFTER]]));
    expect(item).toMatchObject({
      state: 'open',
      label: 'Results changed since they were sent',
      href: '/shows/show-1/results?step=submit',
    });
  });

  it('a change before the send leaves the line ticked as sent', () => {
    const item = listFor(new Map([['c1', BEFORE]]));
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC', href: null });
    expect(item?.note).toBeUndefined();
  });

  it('a resend newer than the change clears it, and the first record stays', () => {
    const records = [
      { status: 'sent', organization: 'AKC', submitted_at: SENT_AT },
      { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T21:00:00Z' },
    ];
    const item = listFor(new Map([['c2', AFTER]]), records);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
  });

  it('says plainly when the history could not be read', () => {
    const item = listFor(null);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
    expect(item?.note).toBe('We could not check for score changes since they were sent.');
  });

  it('says nothing extra while the history has not been read', () => {
    expect(listFor(undefined)?.note).toBeUndefined();
  });

  it('ignores a file the secretary only marked as submitted', () => {
    const item = listFor(new Map([['c2', AFTER]]), [
      { status: 'submitted', organization: 'AKC', submitted_at: SENT_AT },
    ]);
    expect(item).toMatchObject({ state: 'done', label: 'Results file sent to AKC' });
  });
});
